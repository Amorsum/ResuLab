---
name: tauri-windows-build-crt-flags-corrupt-rlib
description: 最终根因分析 — tauri/custom-protocol corrupt rlib，CRT flags 只是表象
metadata:
  type: project
---

# Tauri Windows 编译：corrupt rlib 根因分析（最终）

**日期**: 2026-06-08 ~ 2026-06-09
**最终更新**: 2026-06-09

## 实际根因（最终确认）

**`tauri/custom-protocol` feature → corrupt rlib 或 OOM**，与配置组合有关：

| opt-level | custom-protocol | 结构 | 结果 |
|-----------|----------------|------|------|
| 3 (default) | Yes | 任意 | **LLVM OOM** (exit 0xc0000409) |
| 0 | Yes | 任意（lib+bin同包或workspace） | **corrupt rlib** |
| 0 | Yes | 单线程 -j1 | **corrupt rlib** (无改善) |
| 0 | No | 任意 | ✅ 通过 |

## 排除的因素

- ❌ CRT link-arg flags（空 build.rs 仍 corrupt）
- ❌ 并行编译竞争条件（-j1 仍 corrupt）
- ❌ Workspace 分离（lib/bin 在不同包仍 corrupt）

## 最终方案

**完全禁用 custom-protocol**。`cargo tauri build` 自动加 `--features tauri/custom-protocol`，所以也不能用它。

替代方案：
- **Windows**: `cargo build --release` + `npx tauri bundle`
- **Android**: `cargo build --release --lib --target <triple>` × 4 + `gradlew assembleUniversalRelease` (skip Rust tasks)

详见 [[stable-build-plan]]。

## 相关记忆

- [[stable-build-plan]] — 最终方案和构建脚本

**Why:** `tauri/custom-protocol` 在任何配置下都 corrupt rlib 或 OOM。只有完全不禁用 custom-protocol 才能稳定构建。

**How to apply:** 使用 `build-desktop.cmd` 和 `build-apk.cmd` 构建，不用 `cargo tauri build`。
