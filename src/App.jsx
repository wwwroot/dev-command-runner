import React, { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Titlebar } from "./components/Titlebar";
import { TaskCard } from "./components/TaskCard";
import { loadTasksConfig, saveTasksConfig } from "./services/configStore";
import { stopTaskProcess, isTaskRunningBackend } from "./services/processRunner";

export function App() {
  const [tasks, setTasks] = useState([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [runningTasks, setRunningTasks] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);

  const runningTasksRef = useRef(runningTasks);
  useEffect(() => {
    runningTasksRef.current = runningTasks;
  }, [runningTasks]);

  const [shouldAutoRun, setShouldAutoRun] = useState(false);

  useEffect(() => {
    async function initConfig() {
      const loaded = await loadTasksConfig();
      setTasks(loaded);
      setShouldAutoRun(true);
    }
    initConfig();
  }, []);

  useEffect(() => {
    let active = true;
    const win = getCurrentWindow();
    let unlistenResize;
    let unlistenMove;
    let unlistenClose;

    const MIN_WINDOW_WIDTH = 520;
    const MIN_WINDOW_HEIGHT = 480;

    async function restoreWindow() {
      try {
        await win.setMinSize(new LogicalSize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT));

        const savedSize = localStorage.getItem("window_size");
        if (savedSize) {
          const { width, height } = JSON.parse(savedSize);
          const validW = Math.max(MIN_WINDOW_WIDTH, Number(width) || MIN_WINDOW_WIDTH);
          const validH = Math.max(MIN_WINDOW_HEIGHT, Number(height) || MIN_WINDOW_HEIGHT);
          await win.setSize(new LogicalSize(validW, validH));
        }

        const savedPos = localStorage.getItem("window_position");
        if (savedPos) {
          const { x, y } = JSON.parse(savedPos);
          const numX = Number(x);
          const numY = Number(y);
          // Ensure coordinates are not Windows minimized state (-32000) or corrupt
          if (!isNaN(numX) && !isNaN(numY) && numX > -2000 && numX < 30000 && numY > -2000 && numY < 30000) {
            await win.setPosition(new LogicalPosition(numX, numY));
          }
        }
      } catch (err) {
        console.error("Failed to restore window state:", err);
      }
    }

    async function setupListeners() {
      try {
        unlistenResize = await win.onResized(async () => {
          if (!active) return;
          try {
            const size = await win.innerSize();
            const factor = await win.scaleFactor();
            if (factor > 0) {
              const logicalWidth = size.width / factor;
              const logicalHeight = size.height / factor;
              // Only save if window is active and meets minimum dimensions (ignore minimized 0x0 states)
              if (logicalWidth >= MIN_WINDOW_WIDTH && logicalHeight >= MIN_WINDOW_HEIGHT) {
                localStorage.setItem(
                  "window_size",
                  JSON.stringify({ width: logicalWidth, height: logicalHeight })
                );
              }
            }
          } catch (err) {
            console.error("Failed to save window size:", err);
          }
        });

        unlistenMove = await win.onMoved(async () => {
          if (!active) return;
          try {
            const pos = await win.innerPosition();
            const factor = await win.scaleFactor();
            if (factor > 0) {
              const logicalX = pos.x / factor;
              const logicalY = pos.y / factor;
              // Ignore Windows minimized positions like -32000
              if (logicalX > -2000 && logicalY > -2000) {
                localStorage.setItem(
                  "window_position",
                  JSON.stringify({ x: logicalX, y: logicalY })
                );
              }
            }
          } catch (err) {
            console.error("Failed to save window position:", err);
          }
        });

        unlistenClose = await win.onCloseRequested(async (event) => {
          if (runningTasksRef.current.size > 0) {
            event.preventDefault();
            setShowCloseConfirm(true);
          }
        });
      } catch (err) {
        console.error("Failed to setup window listeners:", err);
      }
    }

    restoreWindow();
    setupListeners();

    return () => {
      active = false;
      if (unlistenResize) unlistenResize();
      if (unlistenMove) unlistenMove();
      if (unlistenClose) unlistenClose();
    };
  }, []);

  useEffect(() => {
    let unlistenFn;
    listen("task-status", (event) => {
      const { task_id, status } = event.payload || {};
      if (status === "RUNNING") {
        setRunningTasks((prev) => {
          const next = new Set(prev);
          next.add(task_id);
          return next;
        });
      } else {
        setRunningTasks((prev) => {
          const next = new Set(prev);
          next.delete(task_id);
          return next;
        });
      }
    }).then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleUpdateTask = (updatedTask) => {
    const updated = tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
    setTasks(updated);
    saveTasksConfig(updated);
  };

  const handleAddTask = () => {
    const newTask = {
      id: `task-${Date.now()}`,
      title: "New Command",
      cwd: ".",
      command: "npm run dev",
      autoScroll: true
    };
    const updated = [...tasks, newTask];
    setTasks(updated);
    saveTasksConfig(updated);
  };

  const handleExport = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `dev-command-shortcuts-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error("Failed to export configuration:", err);
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed)) {
          const validated = parsed.filter(t => t.id && t.title && t.command);
          if (validated.length > 0) {
            const merged = [...tasks];
            validated.forEach(newT => {
              if (!merged.some(existing => existing.id === newT.id)) {
                merged.push(newT);
              } else {
                const idx = merged.findIndex(existing => existing.id === newT.id);
                merged[idx] = newT;
              }
            });
            setTasks(merged);
            saveTasksConfig(merged);
          } else {
            alert("Invalid configuration file format.");
          }
        } else {
          alert("Configuration file must contain an array of commands.");
        }
      } catch (err) {
        console.error("Failed to parse imported JSON:", err);
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDeleteTask = (taskId) => {
    setTaskToDelete(taskId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (taskToDelete) {
      const isRunning = await isTaskRunningBackend(taskToDelete);
      if (isRunning) {
        await stopTaskProcess(taskToDelete);
      }
      const updated = tasks.filter((t) => t.id !== taskToDelete);
      setTasks(updated);
      saveTasksConfig(updated);
    }
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
  };

  const handleConfirmClose = async () => {
    for (const taskId of runningTasks) {
      try {
        await stopTaskProcess(taskId);
      } catch (err) {
        console.warn("Failed to stop process during application exit:", err);
      }
    }
    await invoke("exit_app");
  };

  const handleWindowClose = async () => {
    if (runningTasks.size > 0) {
      setShowCloseConfirm(true);
    } else {
      const win = getCurrentWindow();
      await win.close();
    }
  };

  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    const element = document.getElementById(`card-${taskId}`);
    if (element) {
      e.dataTransfer.setDragImage(element, 20, 20);
      setTimeout(() => {
        element.classList.add("dragging");
      }, 0);
    }
  };

  const handleDragEnter = (e, taskId) => {
    e.preventDefault();
    if (draggedTaskId && draggedTaskId !== taskId) {
      setDragOverTaskId(taskId);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDragLeave = (taskId) => {
    if (dragOverTaskId === taskId) {
      setDragOverTaskId(null);
    }
  };

  const handleDrop = (e, targetTaskId) => {
    e.preventDefault();
    setDragOverTaskId(null);
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;

    const draggedIndex = tasks.findIndex((t) => t.id === draggedTaskId);
    const targetIndex = tasks.findIndex((t) => t.id === targetTaskId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const updated = [...tasks];
      const [draggedItem] = updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, draggedItem);
      setTasks(updated);
      saveTasksConfig(updated);
    }
  };

  const handleDragEnd = () => {
    if (draggedTaskId) {
      const element = document.getElementById(`card-${draggedTaskId}`);
      if (element) element.classList.remove("dragging");
    }
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const handleCollapseAll = () => {
    const updated = tasks.map((t) => ({ ...t, isCollapsed: true }));
    setTasks(updated);
    saveTasksConfig(updated);
  };

  const handleExpandAll = () => {
    const updated = tasks.map((t) => ({ ...t, isCollapsed: false }));
    setTasks(updated);
    saveTasksConfig(updated);
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    return (
      (t.title && t.title.toLowerCase().includes(query)) ||
      (t.cwd && t.cwd.toLowerCase().includes(query)) ||
      (t.command && t.command.toLowerCase().includes(query))
    );
  });

  const isTauri = typeof window !== "undefined" && (
    window.__TAURI_INTERNALS__ !== undefined ||
    window.__TAURI_IPC__ !== undefined ||
    window.__TAURI__ !== undefined
  );

  return (
    <div className="app-container">
      {!isTauri && (
        <div className="browser-warning-box">
          ⚠️ <strong>Aplikasi dibuka di Web Browser biasa!</strong> Browser web tidak diizinkan mengeksekusi PowerShell/Node/Docker di OS.
          Untuk menjalankan perintah desktop, jalankan di terminal: <code className="browser-warning-code">npm run tauri dev</code>
        </div>
      )}

      <Titlebar
        onAddTask={handleAddTask}
        onExport={handleExport}
        onImport={handleImport}
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
        onClose={handleWindowClose}
      />

      <div className="task-grid">
        {filteredTasks.length === 0 ? (
          <div className="empty-tasks-container">
            No command tasks found. Click <strong>+ Add Task</strong> to create one.
          </div>
        ) : (
          filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onDragStart={(e) => handleDragStart(e, task.id)}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, task.id)}
              onDragLeave={() => handleDragLeave(task.id)}
              onDrop={(e) => handleDrop(e, task.id)}
              onDragEnd={handleDragEnd}
              isDragOver={dragOverTaskId === task.id}
              shouldAutoRun={shouldAutoRun}
            />
          ))
        )}
      </div>

      <footer className="statusbar" data-tauri-drag-region>
        <div className="statusbar-left" data-tauri-drag-region>
          <span className="status-item" data-tauri-drag-region>
            <span className="status-dot status-dot-running"></span>
            <strong data-tauri-drag-region>{runningTasks.size}</strong> Running
          </span>
          <span className="status-item" data-tauri-drag-region>
            <span className="status-dot status-dot-idle"></span>
            <strong data-tauri-drag-region>{tasks.length - runningTasks.size}</strong> Idle
          </span>
        </div>
        <div className="statusbar-right" data-tauri-drag-region>
          <span data-tauri-drag-region>v1.0.2</span>
        </div>
      </footer>

      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete Command</h3>
            <p>Are you sure you want to delete this command?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => {
                setShowDeleteConfirm(false);
                setTaskToDelete(null);
              }}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Active Processes Running</h3>
            <p>Some command tasks are still running. Are you sure you want to close and terminate all processes?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCloseConfirm(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleConfirmClose}>
                Terminate & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
