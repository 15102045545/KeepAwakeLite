import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Play,
  Radio,
  Square,
  Terminal,
  Timer,
} from "lucide-react";

import "./App.css";
import { clampPercent, formatBytes, formatDuration, formatSeconds } from "./lib/format";
import { appendLog, formatLogLine } from "./lib/logs";
import type { ActivitySnapshot, AppLogEntry, MetricsSnapshot } from "./types";

interface SnapshotState {
  data: ActivitySnapshot;
  receivedAt: number;
}

const defaultSnapshot: ActivitySnapshot = {
  status: "stopped",
  started_at_ms: null,
  elapsed_seconds: 0,
  round: 0,
  next_round_seconds: 60,
  metrics: null,
};

const isTauriRuntime = "__TAURI_INTERNALS__" in window;

function App() {
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({
    data: defaultSnapshot,
    receivedAt: Date.now(),
  });
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const snapshot = snapshotState.data;
  const isRunning = snapshot.status === "running";
  const isStopping = snapshot.status === "stopping";

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    const unlisteners: UnlistenFn[] = [];

    if (!isTauriRuntime) {
      setMetrics({
        cpu_usage_percent: 3.8,
        memory_used_bytes: 8.4 * 1024 ** 3,
        memory_total_bytes: 32 * 1024 ** 3,
        disk_available_bytes: 418 * 1024 ** 3,
        process_memory_bytes: 92 * 1024 ** 2,
      });
      return () => {
        mounted = false;
      };
    }

    invoke<ActivitySnapshot>("get_snapshot")
      .then((data) => {
        if (mounted) {
          applySnapshot(data);
        }
      })
      .catch((error) => pushLocalLog("ERROR", `读取初始状态失败：${String(error)}`));

    listen<ActivitySnapshot>("activity-snapshot", (event) => applySnapshot(event.payload)).then(
      (unlisten) => {
        if (mounted) {
          unlisteners.push(unlisten);
        } else {
          unlisten();
        }
      },
    );

    listen<MetricsSnapshot>("metrics-snapshot", (event) => setMetrics(event.payload)).then(
      (unlisten) => {
        if (mounted) {
          unlisteners.push(unlisten);
        } else {
          unlisten();
        }
      },
    );

    listen<AppLogEntry>("app-log", (event) => {
      setLogs((items) => appendLog(items, event.payload));
    }).then((unlisten) => {
      if (mounted) {
        unlisteners.push(unlisten);
      } else {
        unlisten();
      }
    });

    return () => {
      mounted = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  function applySnapshot(data: ActivitySnapshot) {
    setSnapshotState({ data, receivedAt: Date.now() });
    if (data.metrics) {
      setMetrics(data.metrics);
    }
  }

  function pushLocalLog(level: AppLogEntry["level"], message: string) {
    setLogs((items) =>
      appendLog(items, {
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level,
        message,
      }),
    );
  }

  async function toggleActivity() {
    if (busy || isStopping) {
      return;
    }

    setBusy(true);
    try {
      if (!isTauriRuntime) {
        const now = Date.now();
        const nextStatus = isRunning ? "stopped" : "running";
        applySnapshot({
          ...snapshot,
          status: nextStatus,
          started_at_ms: nextStatus === "running" ? now : null,
          elapsed_seconds: 0,
          round: nextStatus === "running" ? Math.max(snapshot.round, 1) : 0,
          next_round_seconds: 60,
        });
        pushLocalLog("INFO", nextStatus === "running" ? "后端任务已开始，循环周期 60 秒" : "后端任务已停止，临时目录已清理");
        return;
      }

      const command = isRunning ? "stop_activity" : "start_activity";
      const data = await invoke<ActivitySnapshot>(command);
      applySnapshot(data);
    } catch (error) {
      pushLocalLog("ERROR", `${isRunning ? "停止" : "开始"}失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const elapsedSeconds = useMemo(() => {
    void tick;
    if (isRunning && snapshot.started_at_ms) {
      return Math.max(0, Math.floor((Date.now() - snapshot.started_at_ms) / 1000));
    }

    return snapshot.elapsed_seconds;
  }, [isRunning, snapshot.elapsed_seconds, snapshot.started_at_ms, tick]);

  const nextRoundSeconds = useMemo(() => {
    void tick;
    if (!isRunning) {
      return 60;
    }

    const localElapsed = Math.floor((Date.now() - snapshotState.receivedAt) / 1000);
    return Math.max(0, snapshot.next_round_seconds - localElapsed);
  }, [isRunning, snapshot.next_round_seconds, snapshotState.receivedAt, tick]);

  const activeMetrics = metrics ?? snapshot.metrics;
  const memoryPercent = activeMetrics
    ? clampPercent((activeMetrics.memory_used_bytes / Math.max(activeMetrics.memory_total_bytes, 1)) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-[#eef3f4] text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] items-center px-6 py-4">
        <section className="window-shell w-full overflow-hidden rounded-xl border border-white/80 bg-white/90 shadow-[0_34px_92px_rgba(24,35,43,0.18),0_2px_8px_rgba(24,35,43,0.08)]">
          <header className="flex h-12 items-center border-b border-line/80 bg-white/80 px-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[14px] font-bold text-white">
              K
            </div>
            <div className="ml-3 text-[15px] font-semibold">KeepAwakeLite</div>
            <StatusBadge status={snapshot.status} />
            <div className="ml-auto flex items-center gap-2 text-[13px] text-muted">
              <Timer className="h-4 w-4" />
              <span>固定周期 60s</span>
            </div>
          </header>

          <div className="space-y-4 px-6 pb-5 pt-5">
            <section className="hero-band grid grid-cols-[1fr_0.86fr_0.86fr_0.72fr_auto] items-center gap-5 rounded-lg border border-line bg-white px-6 py-4">
              <HeroMetric label="本次运行时长" value={formatDuration(elapsedSeconds)} mono />
              <HeroMetric label="当前循环" value={snapshot.round > 0 ? `第 ${snapshot.round} 轮` : "第 0 轮"} bordered />
              <HeroMetric label="下一轮" value={formatSeconds(nextRoundSeconds)} bordered mono />
              <HeroMetric label="固定周期" value="60s" bordered mono />
              <button
                type="button"
                onClick={toggleActivity}
                disabled={busy || isStopping}
                className={`flex h-12 w-32 items-center justify-center gap-3 rounded-md text-[17px] font-semibold text-white shadow-sm transition ${
                  isRunning
                    ? "bg-stop shadow-red-900/10 hover:bg-[#b8322c]"
                    : "bg-run shadow-emerald-900/10 hover:bg-[#0f724c]"
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {isRunning ? <Square className="h-4 w-4 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
                {isStopping ? "停止中" : isRunning ? "停止" : "开始"}
              </button>
            </section>

            <section className="grid grid-cols-4 gap-4">
              <MetricCard
                title="CPU 使用率"
                value={activeMetrics ? `${activeMetrics.cpu_usage_percent.toFixed(1)}%` : "--"}
                detail="轻计算"
                percent={activeMetrics ? activeMetrics.cpu_usage_percent : 0}
                tone="green"
                icon={<Cpu className="h-4 w-4" />}
              />
              <MetricCard
                title="内存"
                value={
                  activeMetrics
                    ? `${formatBytes(activeMetrics.memory_used_bytes)} / ${formatBytes(activeMetrics.memory_total_bytes)}`
                    : "--"
                }
                detail="系统占用"
                percent={memoryPercent}
                tone="blue"
                icon={<MemoryStick className="h-4 w-4" />}
              />
              <MetricCard
                title="磁盘可用空间"
                value={activeMetrics ? formatBytes(activeMetrics.disk_available_bytes) : "--"}
                detail="临时目录"
                percent={activeMetrics ? 68 : 0}
                tone="amber"
                icon={<HardDrive className="h-4 w-4" />}
              />
              <MetricCard
                title="本进程内存"
                value={activeMetrics ? formatBytes(activeMetrics.process_memory_bytes) : "--"}
                detail="应用自身"
                percent={activeMetrics ? clampPercent(activeMetrics.process_memory_bytes / (1024 * 1024 * 6)) : 0}
                tone="violet"
                icon={<Gauge className="h-4 w-4" />}
              />
            </section>

            <section className="grid grid-cols-[360px_1fr] gap-5">
              <aside className="rounded-lg border border-line bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">当前循环动作</h2>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-muted">
                    固定顺序
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <ActionRow active={isRunning} tone="green" title="CPU 轻计算" subtitle="固定次数校验和" icon={<Cpu />} />
                  <ActionRow active={isRunning} tone="blue" title="内存分配释放" subtitle="单轮作用域" icon={<MemoryStick />} />
                  <ActionRow active={isRunning} tone="amber" title="临时文件读写" subtitle="完成后删除" icon={<HardDrive />} />
                  <ActionRow active={isRunning} tone="accent" title="百度短请求" subtitle="短超时 HEAD" icon={<Radio />} />
                </div>
              </aside>

              <section className="console-panel overflow-hidden rounded-lg border border-slate-900">
                <div className="flex h-11 items-center border-b border-white/5 px-5">
                  <Terminal className="mr-2 h-4 w-4 text-slate-300" />
                  <h2 className="text-[15px] font-semibold text-white">软件运行日志</h2>
                  <div className="ml-auto text-xs text-slate-400">{logs.length} / 1000</div>
                </div>
                <div className="h-[244px] overflow-y-auto px-5 py-4 font-mono text-[13px]">
                  {logs.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-slate-500">暂无日志</div>
                  ) : (
                    <div className="space-y-3">
                      {logs.map((entry, index) => (
                        <LogLine key={`${entry.timestamp}-${index}`} entry={entry} />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </section>

            <footer className="grid h-9 grid-cols-3 items-center rounded-lg border border-line bg-white px-5 text-sm text-muted">
              <FooterItem color="bg-run" label={statusText(snapshot.status)} />
              <FooterItem color="bg-amber-500" label="关闭窗口将优雅退出" />
              <FooterItem color="bg-accent" label="托盘菜单：显示窗口 / 退出" />
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: ActivitySnapshot["status"] }) {
  const label = statusText(status);
  const className =
    status === "running"
      ? "bg-emerald-50 text-emerald-700"
      : status === "stopping"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <div className={`ml-4 flex h-7 items-center gap-2 rounded-md px-3 text-[13px] font-medium ${className}`}>
      <span className={`h-2 w-2 rounded-full ${status === "running" ? "bg-run" : status === "stopping" ? "bg-amber-500" : "bg-slate-400"}`} />
      {label}
    </div>
  );
}

function HeroMetric({
  label,
  value,
  bordered = false,
  mono = false,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={bordered ? "border-l border-line pl-6" : undefined}>
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <div className={`mt-2 text-[28px] font-bold leading-none tracking-normal ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  percent,
  tone,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  percent: number;
  tone: "green" | "blue" | "amber" | "violet";
  icon: ReactNode;
}) {
  const toneClass = {
    green: "bg-run text-white",
    blue: "bg-sky-500 text-white",
    amber: "bg-amber-500 text-white",
    violet: "bg-violet-500 text-white",
  }[tone];

  const barClass = {
    green: "bg-run",
    blue: "bg-sky-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
  }[tone];

  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold">{title}</div>
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${toneClass}`}>{icon}</span>
      </div>
      <div className="mt-3 min-h-8 break-words font-mono text-[23px] font-bold leading-8">{value}</div>
      <div className="mt-3 h-2 rounded-full bg-field">
        <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${clampPercent(percent)}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted">{detail}</div>
    </article>
  );
}

function ActionRow({
  active,
  tone,
  title,
  subtitle,
  icon,
}: {
  active: boolean;
  tone: "green" | "blue" | "amber" | "accent";
  title: string;
  subtitle: string;
  icon: ReactElement;
}) {
  const toneClass = {
    green: "bg-emerald-100 text-run",
    blue: "bg-sky-100 text-sky-700",
    amber: "bg-amber-100 text-amber-700",
    accent: "bg-blue-100 text-accent",
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-slate-50 px-3 py-2">
      <span className={`flex h-7 w-7 items-center justify-center rounded-md ${active ? toneClass : "bg-slate-200 text-slate-500"}`}>
        {active ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="truncate text-xs text-muted">{subtitle}</div>
      </div>
      <span className="ml-auto text-slate-400">{icon}</span>
    </div>
  );
}

function LogLine({ entry }: { entry: AppLogEntry }) {
  const levelClass =
    entry.level === "INFO" ? "text-emerald-300" : entry.level === "WARN" ? "text-amber-300" : "text-red-300";

  return (
    <p title={formatLogLine(entry)} className="grid grid-cols-[86px_58px_1fr] gap-3 leading-5">
      <span className="text-slate-500">[{entry.timestamp}]</span>
      <span className={`font-bold ${levelClass}`}>{entry.level}</span>
      <span className="break-words text-emerald-50">{entry.message}</span>
    </p>
  );
}

function FooterItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function statusText(status: ActivitySnapshot["status"]): string {
  if (status === "running") {
    return "运行中";
  }

  if (status === "stopping") {
    return "停止中";
  }

  return "已停止";
}

export default App;
