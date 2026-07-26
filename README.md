# Dev Command Runner

[![Tauri](https://img.shields.io/badge/Tauri-v2.11-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-2021-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

A cross-platform desktop dashboard to manage, run, and monitor background development processes, servers, and scripts. Built with Tauri v2, Rust, and React, it operates inside a frameless window layout and executes shell tasks natively using background process sessions.

<img src="assets/screenshot.png?v=1.0.1" width="75%" alt="Application Screenshot">

---

## Features

- **System Tray Support** → Run the application in the background. Hides the window to the tray on minimize, restores on left-click, and provides a quick context menu to show the window or quit cleanly.
- **Process Cleanup on Exit** → Quitting the application automatically terminates all active child process trees (e.g. Node/Vite processes) safely.
- **Custom Titlebar** → A custom drag handle area with window controls (Minimize to Tray, Minimize to Taskbar, Maximize, Close) styled as segmented button groups.
- **Task Management** → Register and configure custom command shortcuts with distinct working directories, command lines, and toggleable auto-run settings.
- **Drag-and-Drop Reordering** → Persists task card positions in local storage and allows vertical rearranging using grab handles.
- **Integrated Console** → Real-time stdout and stderr console logging with ANSI color code parsing, manual clearing, and toggleable auto-scroll.
- **Console Clipboard Support** → Copy entire console logs to your clipboard with temporary visual feedback.
- **Auto-Detect URLs** → Automatically scans process logs for localhost/network URLs and opens them in the system's default browser on click.
- **Persisted Window State** → Saves and restores the window's screen position and size across launches.
- **Safety Overlays** → Prompts warnings before deleting tasks or closing the window while background processes are running.
- **Import & Export** → Backup and restore all command shortcuts via JSON configurations.

---

## Prerequisites

Before running or building the application, ensure your environment has:

- **Node.js** (v18 or higher)
- **Rust Toolchain** (rustc, cargo, and rustup)
- **Tauri dependencies**: Refer to the [Tauri v2 Prerequisite Guide](https://v2.tauri.app/start/prerequisites/) for your operating system.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Mode
```bash
npm run tauri dev
```

### 3. Build Production Executable
```bash
npm run tauri build
```
Built binaries and installers (e.g., `.exe` or `.msi` on Windows) will be created inside the `src-tauri/target/release/bundle/` directory.

---

## Configuration Schema

Shortcut databases can be backed up or restored using the following JSON structure:

```json
[
  {
    "id": "task-frontend-dev",
    "title": "Vite Dev Server",
    "cwd": ".",
    "command": "npm run dev",
    "autoScroll": true,
    "autoRun": false,
    "tags": ["Frontend", "Vite"]
  }
]
```

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
