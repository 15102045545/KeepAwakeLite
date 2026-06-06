import { describe, expect, it } from "vitest";

import type { AppLogEntry } from "../types";
import { appendLog, formatLogLine } from "./logs";

const makeLog = (index: number): AppLogEntry => ({
  timestamp: `12:00:${String(index % 60).padStart(2, "0")}`,
  level: index % 2 === 0 ? "INFO" : "WARN",
  message: `日志 ${index}`,
});

describe("appendLog", () => {
  it("keeps only the latest 1000 entries", () => {
    const logs = Array.from({ length: 1005 }, (_, index) => makeLog(index));
    const retained = logs.reduce<AppLogEntry[]>((items, entry) => appendLog(items, entry), []);

    expect(retained).toHaveLength(1000);
    expect(retained[0].message).toBe("日志 5");
    expect(retained[retained.length - 1]?.message).toBe("日志 1004");
  });
});

describe("formatLogLine", () => {
  it("formats the log line with timestamp and level", () => {
    expect(formatLogLine(makeLog(3))).toBe("[12:00:03] WARN 日志 3");
  });
});
