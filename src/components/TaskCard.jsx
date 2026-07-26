import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, RotateCw, Square, FolderOpen, Trash2, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { ConsoleLogs } from "./ConsoleLogs";
import { runTaskProcess, stopTaskProcess } from "../services/processRunner";

function stripAnsi(str) {
  if (!str) return "";
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function extractUrls(text) {
  if (!text) return [];
  const urlRegex = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[a-zA-Z0-9.-]+)(?::\d+)?(?:\/[^\s"'<>]*)?)/gi;
  const matches = text.match(urlRegex);
  return matches ? matches : [];
}

export function TaskCard({
  task,
  onUpdateTask,
  onDeleteTask,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDragOver,
  shouldAutoRun
}) {
  const [status, setStatus] = useState("IDLE");
  const [logs, setLogs] = useState([]);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const isCardCollapsed = !!task.isCollapsed;
  const [detectedUrls, setDetectedUrls] = useState([]);

  const isRunning = status === "RUNNING";

  useEffect(() => {
    if (shouldAutoRun && task.autoRun && task.command) {
      const timer = setTimeout(() => {
        handleRun();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoRun]);

  const handleLog = (rawText, isError) => {
    const cleanText = stripAnsi(rawText);
    const foundUrls = extractUrls(cleanText);
    if (foundUrls.length > 0) {
      setDetectedUrls((prev) => {
        const nextSet = new Set([...prev, ...foundUrls]);
        return Array.from(nextSet);
      });
    }
    setLogs((prev) => [...prev.slice(-999), { text: cleanText, isError }]);
  };

  const handleOpenUrl = async (url) => {
    try {
      await invoke("open_in_browser", { url });
    } catch (err) {
      console.warn("Failed to open URL in browser:", err);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Working Directory"
      });
      if (selected && typeof selected === "string") {
        onUpdateTask({ ...task, cwd: selected });
      }
    } catch (err) {
      console.warn("Folder picker unavailable or cancelled:", err);
    }
  };

  const handleRun = async () => {
    setDetectedUrls([]);
    runTaskProcess(task, handleLog, setStatus);
  };

  const handleRestart = async () => {
    setDetectedUrls([]);
    handleLog("[SYS] Restarting process...", false);
    await stopTaskProcess(task.id, handleLog);
    setTimeout(() => {
      runTaskProcess(task, handleLog, setStatus);
    }, 500);
  };

  const handleStop = async () => {
    await stopTaskProcess(task.id, handleLog);
    setStatus("STOPPED");
    setDetectedUrls([]);
  };

  const getStatusBadge = () => {
    switch (status) {
      case "RUNNING":
        return <span className="badge badge-running">RUNNING</span>;
      case "STOPPED":
        return <span className="badge badge-stopped">STOPPED</span>;
      case "SUCCESS":
        return <span className="badge badge-success">SUCCESS</span>;
      case "FAILED":
        return <span className="badge badge-failed">FAILED</span>;
      default:
        return <span className="badge badge-idle">IDLE</span>;
    }
  };

  return (
    <div
      id={`card-${task.id}`}
      className={`task-card ${isRunning ? "is-running" : ""} ${isDragOver ? "is-drag-over" : ""}`}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="task-header">
        <div className="task-title-group">
          <div
            className="drag-handle"
            title="Drag to reorder card"
            draggable={true}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <GripVertical size={14} />
          </div>
          <button
            className="btn-action-icon btn-collapse-toggle"
            onClick={() => onUpdateTask({ ...task, isCollapsed: !isCardCollapsed })}
          >
            {isCardCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>

          <input
            type="text"
            className="task-title-input"
            value={task.title}
            onChange={(e) => onUpdateTask({ ...task, title: e.target.value })}
            placeholder="Task Name"
          />
        </div>

        <div className="task-actions-row">
          {getStatusBadge()}

          {!isRunning ? (
            <button className="btn-action-icon btn-run" onClick={handleRun} title="Run Command" data-tooltip="Run">
              <Play size={15} />
            </button>
          ) : (
            <button className="btn-action-icon btn-stop" onClick={handleStop} title="Stop Command" data-tooltip="Stop">
              <Square size={15} />
            </button>
          )}

          <button
            className="btn-action-icon btn-restart"
            onClick={handleRestart}
            title="Restart Command"
            disabled={!isRunning}
            data-tooltip="Restart"
          >
            <RotateCw size={15} />
          </button>

          <button
            className="btn-action-icon btn-delete"
            onClick={() => onDeleteTask(task.id)}
            title="Delete Task Command"
            disabled={isRunning}
            data-tooltip="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {!isCardCollapsed && (
        <>
          <div className="task-row">
            <div className="field-group field-group-cwd">
              <label className="field-label">Working Directory Path</label>
              <div className="input-with-btn">
                <input
                  type="text"
                  className="text-input"
                  value={task.cwd || ""}
                  onChange={(e) => onUpdateTask({ ...task, cwd: e.target.value })}
                  placeholder="E:\Github\project-path"
                />
                <button className="btn-icon" onClick={handleBrowseFolder}>
                  <FolderOpen size={13} />
                  Browse
                </button>
              </div>
            </div>

            <div className="field-group field-group-command">
              <label className="field-label">Command to Execute</label>
              <input
                type="text"
                className="text-input"
                value={task.command || ""}
                onChange={(e) => onUpdateTask({ ...task, command: e.target.value })}
                placeholder="node --env-file=.env server.js"
              />
            </div>
          </div>

          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={task.autoRun || false}
              onChange={(e) => onUpdateTask({ ...task, autoRun: e.target.checked })}
            />
            <span className="checkbox-custom"></span>
            <span className="checkbox-label">Auto-run when application starts</span>
          </label>


          {detectedUrls.length > 0 && isRunning && (
            <div className="detected-urls-group">
              {detectedUrls.map((url, idx) => (
                <button
                  key={idx}
                  className="btn-primary btn-url-opener"
                  onClick={() => handleOpenUrl(url)}
                  title={`Open ${url} in Browser`}
                  data-tooltip="Open in Browser"
                >
                  <span>{url}</span>
                </button>
              ))}
            </div>
          )}

          <ConsoleLogs
            logs={logs}
            isCollapsed={isConsoleCollapsed}
            onToggleCollapse={() => setIsConsoleCollapsed(!isConsoleCollapsed)}
            onClearLogs={() => setLogs([])}
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
          />
        </>
      )}
    </div>
  );
}
