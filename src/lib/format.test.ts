import { describe, expect, it } from "vitest";

import { clampPercent, formatBytes, formatDuration, formatSeconds } from "./format";

describe("formatDuration", () => {
  it("formats elapsed seconds as HH:MM:SS", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(65)).toBe("00:01:05");
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("handles invalid or negative durations as zero", () => {
    expect(formatDuration(-10)).toBe("00:00:00");
    expect(formatDuration(Number.NaN)).toBe("00:00:00");
  });
});

describe("formatSeconds", () => {
  it("formats countdown seconds as MM:SS", () => {
    expect(formatSeconds(0)).toBe("00:00");
    expect(formatSeconds(7)).toBe("00:07");
    expect(formatSeconds(67)).toBe("01:07");
  });
});

describe("formatBytes", () => {
  it("formats byte counts into compact binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 * 42.5)).toBe("42.5 MB");
    expect(formatBytes(1024 * 1024 * 1024 * 8.25)).toBe("8.3 GB");
  });
});

describe("clampPercent", () => {
  it("keeps percentage values inside 0 to 100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(42.42)).toBe(42.42);
    expect(clampPercent(105)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});
