# KeepAwakeLite v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1.0.0 KeepAwakeLite Tauri desktop app from the existing requirements document.

**Architecture:** React renders one Chinese dashboard and talks to Tauri commands/events. Rust owns the active loop, cancellation, in-memory log emission, sysinfo sampling, tray/menu handling, and temporary-directory cleanup. GitHub Actions builds the unsigned Windows NSIS installer; the local macOS release script builds unsigned Apple Silicon and Intel DMGs and uploads them to the draft GitHub Release.

**Tech Stack:** Tauri v2, React, TypeScript, Vite, Tailwind CSS, lucide-react, Rust, tokio, reqwest, sysinfo.

---

### Task 1: Scaffold And Dependencies

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] Rename the generated template metadata to `KeepAwakeLite`.
- [ ] Add frontend dependencies for Tailwind, lucide icons, and unit tests.
- [ ] Add Rust dependencies for async tasks, HTTP timeouts, system metrics, time formatting, and cancellation.
- [ ] Configure bundle targets for `nsis` and `dmg`, and keep updater/log persistence disabled.

### Task 2: Testable Frontend State Helpers

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`
- Create: `src/lib/logs.ts`
- Create: `src/lib/logs.test.ts`

- [ ] Write tests for duration formatting, byte formatting, percent clamping, and 1000-line log retention.
- [ ] Run `npm test -- --run src/lib/format.test.ts src/lib/logs.test.ts` and confirm the tests fail because helpers do not exist.
- [ ] Implement helpers with stable, UI-friendly output.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Rust Core Loop And Metrics

**Files:**
- Replace: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/activity.rs`
- Create: `src-tauri/src/activity_tests.rs`
- Create: `src-tauri/src/metrics.rs`
- Create: `src-tauri/src/state.rs`

- [ ] Write Rust tests for CPU checksum determinism, memory check behavior, temporary file cleanup, and state transitions.
- [ ] Run `cargo test` from `src-tauri` and confirm tests fail before production modules are complete.
- [ ] Implement fixed 60-second loop, cancellation, one-round work actions, temporary directory cleanup, and event emission.
- [ ] Implement fixed 5-second sysinfo sampling.
- [ ] Re-run `cargo test`.

### Task 4: Desktop Lifecycle

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] Add commands: `start_activity`, `stop_activity`, `get_snapshot`, and `request_graceful_exit`.
- [ ] Add tray/menu items: `显示窗口` and `退出`.
- [ ] Make tray left-click show and focus the main window.
- [ ] Make window close request run graceful stop and cleanup, then exit.

### Task 5: Single-Page UI

**Files:**
- Replace: `src/App.tsx`
- Replace: `src/App.css`
- Modify: `src/main.tsx`
- Create: `src/types.ts`

- [ ] Render one Chinese page with status, run duration, round number, next-round countdown, start/stop button, metrics, action list, and log panel.
- [ ] Subscribe to backend events for status, metrics, and logs.
- [ ] Keep logs in memory only and cap at 1000 entries.
- [ ] Use responsive desktop sizing without nested cards or marketing copy.

### Task 6: Release Workflow And Verification

**Files:**
- Create: `.github/workflows/release.yml`
- Replace: `README.md`

- [ ] Add GitHub Release workflow for tag `v1.0.0`.
- [ ] Build Windows x64 NSIS without signing.
- [ ] Build unsigned macOS Apple Silicon and Intel DMGs locally and upload them to the draft Release.
- [ ] Run `npm run typecheck`, `npm test -- --run`, `npm run build`, and `cargo test` where the local toolchain supports them.
