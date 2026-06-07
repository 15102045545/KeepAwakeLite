# KeepAwakeLite

KeepAwakeLite 是一个 Windows/macOS 桌面小工具。用户手动点击开始后，应用每 60 秒执行一轮低负载活跃循环，并在单窗口 GUI 中展示运行状态、运行时长、循环轮次、基础机器指标和内存日志。

## 范围

- Tauri v2 + React + TypeScript + Vite + Tailwind CSS。
- Rust 后端负责 CPU 轻计算、内存小块校验、临时文件读写删除、百度短请求、sysinfo 采样、托盘和退出清理。
- 不做系统 keep-awake API、防锁屏、电源策略修改、鼠标键盘模拟、后台服务、开机自启、自动更新或日志落盘。
- 日志只保留 GUI 内存中的最近 1000 条。

## 本地开发

需要先安装 Node.js、npm 和 Rust 工具链。

```bash
npm install
npm run typecheck
npm test -- --run
npm run tauri dev
```

仅验证前端页面时可运行：

```bash
npm run dev
```

## 本地打包

```bash
npm run tauri build
```

Windows 产物为未签名 NSIS 安装包。macOS 产物为本机生成的未签名 Apple Silicon 和 Intel DMG。

macOS 发布包由本机生成并上传到 GitHub draft Release：

```bash
npm run release:macos
```

脚本不使用 Apple Developer ID、Apple ID、公证、staple 或 GitHub Secrets。macOS 用户首次打开未签名应用时会看到系统安全提示。

## GitHub Release

工作流位于 `.github/workflows/release.yml`，触发条件为推送 `v1.0.0` tag 或手动运行。

GitHub Actions 负责验证工程并生成 Windows NSIS 安装包。macOS DMG 由本机脚本生成并上传。

Windows v1.0.0 不做代码签名，因此安装时可能出现 SmartScreen 或未知发布者提示。macOS v1.0.0 不做 Developer ID 签名或公证，因此安装时可能出现 Gatekeeper 安全提示。
