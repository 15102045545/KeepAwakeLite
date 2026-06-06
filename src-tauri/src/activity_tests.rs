use std::{fs, time::SystemTime};

use crate::activity::{compute_checksum, memory_probe, temp_file_probe};

#[test]
fn checksum_is_deterministic_and_non_zero() {
    let first = compute_checksum(25_000);
    let second = compute_checksum(25_000);

    assert_eq!(first, second);
    assert_ne!(first, 0);
}

#[test]
fn memory_probe_uses_requested_size_and_validates_contents() {
    let checksum = memory_probe(64 * 1024).expect("memory probe should complete");

    assert_ne!(checksum, 0);
}

#[test]
fn temp_file_probe_removes_the_round_file() {
    let unique = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("system time should be available")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("KeepAwakeLite-test-{unique}"));

    temp_file_probe(&dir, 7).expect("temp file probe should complete");

    let entries = fs::read_dir(&dir)
        .expect("temp directory should exist")
        .collect::<Result<Vec<_>, _>>()
        .expect("temp directory entries should be readable");

    assert!(entries.is_empty());

    fs::remove_dir_all(dir).expect("test temp directory should be removable");
}
