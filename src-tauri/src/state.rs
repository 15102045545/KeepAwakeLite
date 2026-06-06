use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime},
};

use chrono::Local;
use reqwest::Client;
use serde::Serialize;
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter, Manager};
use tokio::{
    sync::Mutex,
    time::{sleep, timeout},
};
use tokio_util::sync::CancellationToken;

use crate::{
    activity::{self, cleanup_temp_dir, HTTP_TIMEOUT, LOOP_INTERVAL},
    metrics::{MetricsCollector, MetricsSnapshot},
};

const METRICS_INTERVAL: Duration = Duration::from_secs(5);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityStatus {
    Stopped,
    Running,
    Stopping,
}

#[derive(Clone, Debug, Serialize)]
pub struct AppLogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ActivitySnapshot {
    pub status: ActivityStatus,
    pub started_at_ms: Option<u64>,
    pub elapsed_seconds: u64,
    pub round: u64,
    pub next_round_seconds: u64,
    pub metrics: Option<MetricsSnapshot>,
}

#[derive(Clone)]
pub struct BackendState {
    inner: Arc<Mutex<InnerState>>,
    exit_requested: Arc<AtomicBool>,
}

struct InnerState {
    status: ActivityStatus,
    started_at: Option<Instant>,
    started_at_ms: Option<u64>,
    round: u64,
    next_round_at: Option<Instant>,
    metrics: Option<MetricsSnapshot>,
    activity_cancel: Option<CancellationToken>,
    activity_handle: Option<JoinHandle<()>>,
    metrics_cancel: Option<CancellationToken>,
    metrics_handle: Option<JoinHandle<()>>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(InnerState {
                status: ActivityStatus::Stopped,
                started_at: None,
                started_at_ms: None,
                round: 0,
                next_round_at: None,
                metrics: None,
                activity_cancel: None,
                activity_handle: None,
                metrics_cancel: None,
                metrics_handle: None,
            })),
            exit_requested: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl BackendState {
    pub async fn start(&self, app: AppHandle) -> Result<ActivitySnapshot, String> {
        let client = Client::builder()
            .timeout(HTTP_TIMEOUT)
            .user_agent("KeepAwakeLite/1.0.0")
            .build()
            .map_err(|error| format!("初始化 HTTP 客户端失败：{}", error))?;

        let mut inner = self.inner.lock().await;
        if inner.status != ActivityStatus::Stopped {
            return Ok(Self::snapshot_from_inner(&inner));
        }

        cleanup_temp_dir()?;

        let activity_cancel = CancellationToken::new();
        let metrics_cancel = CancellationToken::new();
        let now = Instant::now();

        inner.status = ActivityStatus::Running;
        inner.started_at = Some(now);
        inner.started_at_ms = Some(unix_now_millis());
        inner.round = 0;
        inner.next_round_at = Some(now);
        inner.activity_cancel = Some(activity_cancel.clone());
        inner.metrics_cancel = Some(metrics_cancel.clone());

        let activity_state = self.clone();
        let activity_app = app.clone();
        inner.activity_handle = Some(tauri::async_runtime::spawn(async move {
            activity_task(activity_state, activity_app, activity_cancel, client).await;
        }));

        let metrics_state = self.clone();
        let metrics_app = app.clone();
        inner.metrics_handle = Some(tauri::async_runtime::spawn(async move {
            metrics_task(metrics_state, metrics_app, metrics_cancel).await;
        }));

        let snapshot = Self::snapshot_from_inner(&inner);
        drop(inner);

        emit_log(&app, "INFO", "后端任务已开始，循环周期 60 秒");
        emit_log(&app, "INFO", "sysinfo 采样已启动，刷新周期 5 秒");
        self.emit_snapshot(&app).await;

        Ok(snapshot)
    }

    pub async fn stop(&self, app: AppHandle) -> Result<ActivitySnapshot, String> {
        let (activity_cancel, metrics_cancel, activity_handle, metrics_handle, was_stopped) = {
            let mut inner = self.inner.lock().await;
            let was_stopped = inner.status == ActivityStatus::Stopped;

            if !was_stopped {
                inner.status = ActivityStatus::Stopping;
            }

            (
                inner.activity_cancel.take(),
                inner.metrics_cancel.take(),
                inner.activity_handle.take(),
                inner.metrics_handle.take(),
                was_stopped,
            )
        };

        if was_stopped {
            cleanup_temp_dir()?;
            let snapshot = self.snapshot().await;
            self.emit_snapshot(&app).await;
            return Ok(snapshot);
        }

        emit_log(&app, "INFO", "正在停止后端任务并清理临时目录");

        if let Some(token) = activity_cancel {
            token.cancel();
        }
        if let Some(token) = metrics_cancel {
            token.cancel();
        }

        if let Some(handle) = activity_handle {
            wait_for_task(handle).await;
        }
        if let Some(handle) = metrics_handle {
            wait_for_task(handle).await;
        }

        cleanup_temp_dir()?;

        let snapshot = {
            let mut inner = self.inner.lock().await;
            inner.status = ActivityStatus::Stopped;
            inner.started_at = None;
            inner.started_at_ms = None;
            inner.round = 0;
            inner.next_round_at = None;
            Self::snapshot_from_inner(&inner)
        };

        emit_log(&app, "INFO", "后端任务已停止，临时目录已清理");
        self.emit_snapshot(&app).await;

        Ok(snapshot)
    }

    pub async fn snapshot(&self) -> ActivitySnapshot {
        let inner = self.inner.lock().await;
        Self::snapshot_from_inner(&inner)
    }

    pub async fn emit_snapshot(&self, app: &AppHandle) {
        let snapshot = self.snapshot().await;
        let _ = app.emit("activity-snapshot", snapshot);
    }

    pub fn mark_exit_requested(&self) -> bool {
        !self.exit_requested.swap(true, Ordering::SeqCst)
    }

    async fn begin_round(&self, next_round_at: Instant) -> Option<u64> {
        let mut inner = self.inner.lock().await;

        if inner.status != ActivityStatus::Running {
            return None;
        }

        inner.round += 1;
        inner.next_round_at = Some(next_round_at);

        Some(inner.round)
    }

    async fn set_metrics(&self, metrics: MetricsSnapshot) {
        let mut inner = self.inner.lock().await;
        inner.metrics = Some(metrics);
    }

    fn snapshot_from_inner(inner: &InnerState) -> ActivitySnapshot {
        let now = Instant::now();
        let elapsed_seconds = match (inner.status, inner.started_at) {
            (ActivityStatus::Running | ActivityStatus::Stopping, Some(started_at)) => {
                now.saturating_duration_since(started_at).as_secs()
            }
            _ => 0,
        };

        let next_round_seconds = match (inner.status, inner.next_round_at) {
            (ActivityStatus::Running, Some(next_round_at)) => {
                next_round_at.saturating_duration_since(now).as_secs()
            }
            _ => LOOP_INTERVAL.as_secs(),
        };

        ActivitySnapshot {
            status: inner.status,
            started_at_ms: inner.started_at_ms,
            elapsed_seconds,
            round: inner.round,
            next_round_seconds,
            metrics: inner.metrics.clone(),
        }
    }
}

pub fn emit_log(app: &AppHandle, level: &str, message: impl Into<String>) {
    let entry = AppLogEntry {
        timestamp: Local::now().format("%H:%M:%S").to_string(),
        level: level.to_string(),
        message: message.into(),
    };

    let _ = app.emit("app-log", entry);
}

pub async fn graceful_exit(app: AppHandle) {
    let state = app.state::<BackendState>().inner().clone();

    if !state.mark_exit_requested() {
        return;
    }

    if let Err(error) = state.stop(app.clone()).await {
        emit_log(&app, "WARN", format!("退出前停止任务失败：{error}"));
        let _ = cleanup_temp_dir();
    }

    app.exit(0);
}

async fn activity_task(
    state: BackendState,
    app: AppHandle,
    cancel: CancellationToken,
    client: Client,
) {
    let dir = activity::temp_dir();

    loop {
        if cancel.is_cancelled() {
            break;
        }

        let round_started = Instant::now();
        let next_round_at = round_started + LOOP_INTERVAL;
        let Some(round) = state.begin_round(next_round_at).await else {
            break;
        };

        state.emit_snapshot(&app).await;
        activity::run_round(&app, round, &dir, &client).await;
        state.emit_snapshot(&app).await;

        let sleep_for = next_round_at.saturating_duration_since(Instant::now());
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = sleep(sleep_for) => {}
        }
    }
}

async fn metrics_task(state: BackendState, app: AppHandle, cancel: CancellationToken) {
    let mut collector = MetricsCollector::new();

    loop {
        if cancel.is_cancelled() {
            break;
        }

        let metrics = collector.sample();
        state.set_metrics(metrics.clone()).await;
        let _ = app.emit("metrics-snapshot", metrics);
        state.emit_snapshot(&app).await;

        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = sleep(METRICS_INTERVAL) => {}
        }
    }
}

async fn wait_for_task(mut handle: JoinHandle<()>) {
    match timeout(SHUTDOWN_TIMEOUT, &mut handle).await {
        Ok(_) => {}
        Err(_) => {
            handle.abort();
            let _ = handle.await;
        }
    }
}

fn unix_now_millis() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
