# Dev Command Runner

![Dev Command Runner Screenshot](assets/screenshot.png?v=1.0.1)

A cross-platform desktop developer dashboard application to manage, monitor, and run command-line tasks, servers, and scripts. Built with Tauri v2, Rust, and React, this app features a frameless window layout and runs shell tasks natively inside separate process sessions.

## Features

- **Frameless Custom Titlebar**: Native window buttons (Minimize, Maximize, Close) with customized click handles and drag areas.
- **Task Management**: Create, edit, and organize command shortcuts with configurable working directories, tags, and autoscroll configurations.
- **Drag-and-Drop Reordering**: Rearrange cards dynamically with vertical grab handles; positioning is saved to local storage.
- **Process Log Console**: Real-time console terminal outputs featuring automatic scrolling toggles, log clearing, and ANSI color code strip parsers.
- **Native Browser Redirection**: Auto-detects HTTP/HTTPS links printed in process outputs; clicking redirects natively to your OS default browser.
- **Startup Auto-Run Execution**: Configure individual cards to execute their shell commands automatically as soon as the application starts.
- **Window State Retention**: Tracks and restores window size dimensions and display coordinates position across application starts.
- **Confirmation Warning Overlays**: Prompts confirmation modal before deleting tasks and intercepts window exit actions if background commands are still active.
- **JSON Import & Export**: Back up, restore, or share command cards by exporting configuration configurations to JSON.
- **Cross-Platform OS Shells**: Configures shell commands using conditional compilation (spawns PowerShell cmdlets on Windows, and standard Unix `sh` on macOS/Linux).

## Prerequisites

To run and build this application locally, ensure you have installed:

- **Node.js** (v18 or higher)
- **Rust toolchain** (rustc, cargo, and rustup)
- **Tauri v2 dependencies** (consult the official [Tauri Prerequisite Guide](https://v2.tauri.app/start/prerequisites/) for your specific operating system).

## Getting Started

### 1. Install Dependencies

Clone this repository and run npm install inside the root folder:

```bash
npm install
```

### 2. Run in Development Mode

Spawn the Tauri development shell window with hot-reloading active:

```bash
npm run tauri dev
```

### 3. Build for Production

Compile and bundle the production release binary executable (.exe, .dmg, or .deb) depending on your host operating system:

```bash
npm run tauri build
```

The output packages will be created inside the `src-tauri/target/release/bundle/` directory.

## Configuration Format

Shortcut data can be exported and imported using the following JSON schema:

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

## License

MIT License. Feel free to use and distribute for open-source developments.
