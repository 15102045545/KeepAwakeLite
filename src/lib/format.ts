const ZERO_DURATION = "00:00:00";

function safeWholeSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDuration(seconds: number): string {
  const safeSeconds = safeWholeSeconds(seconds);
  if (safeSeconds === 0) {
    return ZERO_DURATION;
  }

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(remainingSeconds)}`;
}

export function formatSeconds(seconds: number): string {
  const safeSeconds = safeWholeSeconds(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${pad2(minutes)}:${pad2(remainingSeconds)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} ${units[unitIndex]}`;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 100) {
    return 100;
  }

  return value;
}
