use serde::Serialize;
use sysinfo::{Disks, System};

#[derive(Clone, Debug, Default, Serialize)]
pub struct MetricsSnapshot {
    pub cpu_usage_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub disk_available_bytes: u64,
    pub process_memory_bytes: u64,
}

pub struct MetricsCollector {
    system: System,
}

impl MetricsCollector {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        Self { system }
    }

    pub fn sample(&mut self) -> MetricsSnapshot {
        self.system.refresh_all();

        let disk_available_bytes = Disks::new_with_refreshed_list()
            .list()
            .iter()
            .map(|disk| disk.available_space())
            .sum();

        let process_memory_bytes = sysinfo::get_current_pid()
            .ok()
            .and_then(|pid| self.system.process(pid).map(|process| process.memory()))
            .unwrap_or(0);

        MetricsSnapshot {
            cpu_usage_percent: self.system.global_cpu_usage(),
            memory_used_bytes: self.system.used_memory(),
            memory_total_bytes: self.system.total_memory(),
            disk_available_bytes,
            process_memory_bytes,
        }
    }
}
