---
name: stable-build-plan
description: ResuLab Windows/Android 稳定构建方案 — 最终方案：禁用 custom-protocol，手动分步构建
metadata:
  type: project
---

# ResuLab 稳定构建方案（最终版）

**日期**: 2026-06-09
**状态**: ✅ 已验证通过

## 根因

`tauri/custom-protocol` feature 在任何配置下都会导致问题：
- **opt-level=3** (默认) + custom-protocol → LLVM **OOM** (out of memory)
- **opt-level=0** + custom-protocol → **corrupt rlib metadata**
- **单线程 (-j1)** + custom-protocol → 仍然 corrupt rlib
- **Workspace 分离** + custom-protocol → 仍然 corrupt rlib

**结论**: `cargo tauri build` 自动传递 `--features tauri/custom-protocol`，必需绕过它。

## 最终方案：分步构建，不使用 custom-protocol

### 结构

回到最简单的原始结构（lib+bin 同包，无 workspace）：
- `[lib] name = "app_lib"`, `crate-type = ["staticlib", "cdylib", "rlib"]`
- `[[bin]]` 自动从 `src/main.rs`
- `[profile.release] opt-level = 0`
- `src-tauri/.cargo/config.toml` — Android NDK 链接器配置

### Windows 构建 (`build-desktop.cmd`)

```cmd
npm run build                          # Web 前端
cd src-tauri && cargo build --release  # Rust 编译（无 custom-protocol）
npx tauri bundle --bundles nsis        # NSIS 打包
```

输出: `src-tauri/target/release/bundle/nsis/ResuLab_1.0.2_x64-setup.exe`

### Android 构建 (`build-apk.cmd`)

```cmd
npm run build                                                  # Web 前端
cargo build --release --target aarch64-linux-android --lib     # ARM64
cargo build --release --target armv7-linux-androideabi --lib   # ARM32
cargo build --release --target i686-linux-android --lib        # x86
cargo build --release --target x86_64-linux-android --lib      # x86_64
# 复制 .so 到 gen/android/app/src/main/jniLibs/<abi>/
gradlew assembleUniversalRelease -x rustBuild*                 # Gradle 打包
# APK 签名
```

## 验证记录

| 平台 | 命令 | 结果 | 日期 |
|------|------|------|------|
| Windows | `cargo build --release` | ✅ 通过 | 2026-06-09 |
| Windows | `npx tauri bundle --bundles nsis` | ✅ NSIS installer | 2026-06-09 |
| Android | `cargo build --release --target aarch64-linux-android --lib` | ✅ 通过 | 2026-06-09 |
| Android | `gradlew assembleUniversalRelease` (skip Rust) | ✅ APK | 2026-06-09 |

## 关键文件

| 文件 | 用途 |
|------|------|
| `src-tauri/.cargo/config.toml` | Android NDK linker 配置 |
| `build-desktop.cmd` | Windows 一键构建脚本 |
| `build-apk.cmd` | Android 一键构建脚本 |
| `src-tauri/Cargo.toml` | `[profile.release] opt-level = 0` |

## 注意事项

- NDK 路径硬编码（`C:\Users\19307\Android\Sdk\ndk\29.0.13846066`），换环境需更新
- `tauri bundle` 依赖已编译的 `target/release/app.exe`
- Android 构建需 `gradlew`（由 `cargo tauri android init` 生成）
- APK 签名密钥首次自动生成，密码: `resulab123`

**Why:** `tauri/custom-protocol` 在 opt-level=0 时 corrupt rlib，在 opt-level=3 时 OOM。唯一稳定的方式是完全不用 custom-protocol。

**How to apply:** 使用 `build-desktop.cmd` 构建 Windows，`build-apk.cmd` 构建 Android。
