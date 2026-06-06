export type ActivityStatus = "stopped" | "running" | "stopping";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface AppLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface MetricsSnapshot {
  cpu_usage_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  disk_available_bytes: number;
  process_memory_bytes: number;
}

export interface ActivitySnapshot {
  status: ActivityStatus;
  started_at_ms: number | null;
  elapsed_seconds: number;
  round: number;
  next_round_seconds: number;
  metrics: MetricsSnapshot | null;
}
