import type { AppLogEntry } from "../types";

export const MAX_LOG_ENTRIES = 1000;

export function appendLog(logs: AppLogEntry[], entry: AppLogEntry): AppLogEntry[] {
  const nextLogs = [...logs, entry];

  if (nextLogs.length <= MAX_LOG_ENTRIES) {
    return nextLogs;
  }

  return nextLogs.slice(nextLogs.length - MAX_LOG_ENTRIES);
}

export function formatLogLine(entry: AppLogEntry): string {
  return `[${entry.timestamp}] ${entry.level} ${entry.message}`;
}
