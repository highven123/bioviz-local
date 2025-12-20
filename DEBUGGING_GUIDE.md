# BioViz 打包问题调试指南

## 问题总结

**症状**：
- 开发模式（`npm run tauri dev`）：✅ 完全正常
- 打包后的 DMG：❌ 无法发送 ANALYZE 命令

**根本原因**：
打包后的前端（JavaScript）没有正确调用 `sendCommand` 函数，或者调用了但 Tauri 没有正确传递给后端。

## 日志证据

从 `~/.bioviz_local/logs/bio-engine_20251220.log`：
- 17:31（开发模式）：可以看到 `ANALYZE` 命令和 `status=ok`
- 17:35+（打包应用）：**完全没有 ANALYZE 命令的日志**

这证实：打包后的前端根本没有向后端发送请求。

## 可能的原因

### 1. Tauri IPC 问题
打包后的 Tauri IPC 通道可能被破坏或配置不正确。

### 2. 前端代码未正确打包
虽然我们多次修改了代码，但 Vite 的缓存或 Tauri 的打包流程可能导致旧代码被包含。

### 3. 权限问题
macOS 可能阻止了打包应用的某些功能。

## 临时解决方案

### 方案 A：使用开发模式（推荐）

```bash
cd /Users/haifeng/BioViz-Local
npm run tauri dev
```

这个版本**完全正常**，可以正常使用所有功能。

### 方案 B：调试打包问题

1. 添加更详细的日志到 Rust 层（`src-tauri/src/lib.rs`）
2. 检查 Tauri 的 IPC 配置
3. 验证前端是否正确调用了 Tauri API

## 下一步行动

我建议：
1. **暂时使用开发模式**完成您的工作
2. 让我深入调查 Tauri 打包配置
3. 可能需要重新审视整个构建流程

---

**注意**：所有修复都已在源代码中完成，开发模式100%正常。问题仅限于打包流程。
