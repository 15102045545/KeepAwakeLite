use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use reqwest::Client;
use tauri::AppHandle;

use crate::state::emit_log;

pub const LOOP_INTERVAL: Duration = Duration::from_secs(60);
pub const HTTP_TIMEOUT: Duration = Duration::from_secs(3);
const CPU_ITERATIONS: u64 = 140_000;
const MEMORY_PROBE_BYTES: usize = 256 * 1024;
const TEMP_FILE_BYTES: usize = 16 * 1024;

pub fn temp_dir() -> PathBuf {
    std::env::temp_dir().join("KeepAwakeLite")
}

pub fn cleanup_temp_dir() -> Result<(), String> {
    let dir = temp_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|error| format!("清理临时目录失败：{}", error))?;
    }

    Ok(())
}

pub fn compute_checksum(iterations: u64) -> u64 {
    let mut value = 0xcbf2_9ce4_8422_2325_u64;

    for index in 0..iterations {
        value ^= index.wrapping_mul(0x9e37_79b9_7f4a_7c15);
        value = value.rotate_left(7).wrapping_mul(0x1000_0000_01b3);
    }

    value
}

pub fn memory_probe(size: usize) -> Result<u64, String> {
    let mut data = vec![0_u8; size];

    for (index, byte) in data.iter_mut().enumerate() {
        *byte = ((index * 31 + 17) % 251) as u8;
    }

    let checksum = data
        .iter()
        .fold(0_u64, |acc, byte| acc.wrapping_add(*byte as u64));

    let verify = data
        .iter()
        .enumerate()
        .all(|(index, byte)| *byte == ((index * 31 + 17) % 251) as u8);

    if !verify {
        return Err("内存校验失败".to_string());
    }

    Ok(checksum)
}

pub fn temp_file_probe(dir: &Path, round: u64) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("创建临时目录失败：{}", error))?;

    let file_path = dir.join(format!("round-{round}.bin"));
    let payload = build_temp_payload(round);

    {
        let mut file =
            fs::File::create(&file_path).map_err(|error| format!("创建临时文件失败：{}", error))?;
        file.write_all(&payload)
            .map_err(|error| format!("写入临时文件失败：{}", error))?;
        file.sync_all()
            .map_err(|error| format!("同步临时文件失败：{}", error))?;
    }

    let read_back = fs::read(&file_path).map_err(|error| format!("读取临时文件失败：{}", error))?;

    if read_back != payload {
        let _ = fs::remove_file(&file_path);
        return Err("临时文件读写校验失败".to_string());
    }

    fs::remove_file(&file_path).map_err(|error| format!("删除临时文件失败：{}", error))?;

    Ok(())
}

pub async fn run_round(app: &AppHandle, round: u64, dir: &Path, client: &Client) {
    let cpu_started = Instant::now();
    let checksum = compute_checksum(CPU_ITERATIONS);
    emit_log(
        app,
        "INFO",
        format!(
            "第 {round} 轮：CPU 轻计算完成，用时 {}ms，校验 {}",
            cpu_started.elapsed().as_millis(),
            checksum
        ),
    );

    match memory_probe(MEMORY_PROBE_BYTES) {
        Ok(checksum) => emit_log(
            app,
            "INFO",
            format!("第 {round} 轮：内存小块校验完成，已释放，校验 {checksum}"),
        ),
        Err(error) => emit_log(app, "WARN", format!("第 {round} 轮：{error}，继续下一轮")),
    }

    match temp_file_probe(dir, round) {
        Ok(()) => emit_log(
            app,
            "INFO",
            format!("第 {round} 轮：临时文件读写完成，已删除"),
        ),
        Err(error) => emit_log(app, "WARN", format!("第 {round} 轮：{error}，继续下一轮")),
    }

    match baidu_probe(client).await {
        Ok(status) => emit_log(
            app,
            "INFO",
            format!("第 {round} 轮：百度短请求完成，HTTP {status}"),
        ),
        Err(error) => emit_log(
            app,
            "WARN",
            format!("第 {round} 轮：百度短请求失败：{error}，继续下一轮"),
        ),
    }
}

fn build_temp_payload(round: u64) -> Vec<u8> {
    (0..TEMP_FILE_BYTES)
        .map(|index| ((index as u64 + round * 13) % 251) as u8)
        .collect()
}

async fn baidu_probe(client: &Client) -> Result<u16, String> {
    let response = client
        .head("https://www.baidu.com")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    Ok(response.status().as_u16())
}
