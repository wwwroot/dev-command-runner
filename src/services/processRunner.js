import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const activeTaskStatusMap = new Map();
let isListenerInitialized = false;
const taskLogCallbacks = new Map();
const taskStatusCallbacks = new Map();

async function initGlobalTauriListeners() {
  if (isListenerInitialized) return;
  isListenerInitialized = true;

  try {
    await listen("task-log", (event) => {
      const { task_id, line, is_error } = event.payload || {};
      const cbs = taskLogCallbacks.get(task_id);
      if (cbs) {
        cbs.forEach((cb) => cb(line, is_error));
      }
    });

    await listen("task-status", (event) => {
      const { task_id, status } = event.payload || {};
      activeTaskStatusMap.set(task_id, status);
      const cbs = taskStatusCallbacks.get(task_id);
      if (cbs) {
        cbs.forEach((cb) => cb(status));
      }
    });
  } catch (err) {
    console.warn("Failed to attach Tauri event listeners:", err);
  }
}

export async function runTaskProcess(task, onLog, onStatusChange) {
  const isTauri = typeof window !== "undefined" && (
    window.__TAURI_INTERNALS__ !== undefined || 
    window.__TAURI_IPC__ !== undefined || 
    window.__TAURI__ !== undefined
  );

  if (!isTauri) {
    onLog(`[SYS-WARN] Aplikasi dibuka di Web Browser biasa!`, true);
    onLog(`[SYS-WARN] Jalankan 'npm run tauri dev' untuk membuka versi Desktop Tauri.`, true);
    onStatusChange("STOPPED");
    return;
  }

  await initGlobalTauriListeners();

  if (!taskLogCallbacks.has(task.id)) {
    taskLogCallbacks.set(task.id, new Set());
  }
  taskLogCallbacks.get(task.id).add(onLog);

  if (!taskStatusCallbacks.has(task.id)) {
    taskStatusCallbacks.set(task.id, new Set());
  }
  taskStatusCallbacks.get(task.id).add(onStatusChange);

  onLog(`[SYS] Initializing process execution in "${task.cwd || '.'}"...`, false);
  onLog(`[SYS] Command: ${task.command}`, false);

  try {
    await invoke("spawn_shell_task", {
      taskId: task.id,
      cwd: task.cwd || ".",
      command: task.command
    });
  } catch (err) {
    onLog(`[SYS-ERR] Failed to invoke spawn_shell_task: ${err.message || err}`, true);
    onStatusChange("FAILED");
  }
}

export async function stopTaskProcess(taskId, onLog) {
  const isTauri = typeof window !== "undefined" && (
    window.__TAURI_INTERNALS__ !== undefined || 
    window.__TAURI_IPC__ !== undefined || 
    window.__TAURI__ !== undefined
  );

  if (!isTauri) return;

  try {
    await invoke("kill_shell_task", { taskId });
    if (onLog) onLog(`[SYS] Terminated process tree for task ${taskId}`, false);
    activeTaskStatusMap.set(taskId, "STOPPED");
  } catch (err) {
    if (onLog) onLog(`[SYS-ERR] Failed to kill process: ${err.message || err}`, true);
  }
}

export function isTaskRunning(taskId) {
  return activeTaskStatusMap.get(taskId) === "RUNNING";
}

export async function isTaskRunningBackend(taskId) {
  const isTauri = typeof window !== "undefined" && (
    window.__TAURI_INTERNALS__ !== undefined || 
    window.__TAURI_IPC__ !== undefined || 
    window.__TAURI__ !== undefined
  );

  if (!isTauri) return false;

  try {
    return await invoke("is_task_process_active", { taskId });
  } catch (err) {
    console.error("Failed to check if task is running on backend:", err);
    return false;
  }
}
