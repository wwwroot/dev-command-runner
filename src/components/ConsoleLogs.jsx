import React, { useRef, useEffect } from "react";
import { Trash2, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";

export function ConsoleLogs({ logs = [], isCollapsed, onToggleCollapse, onClearLogs, autoScroll, setAutoScroll }) {
  const consoleEndRef = useRef(null);

  useEffect(() => {
    if (autoScroll && !isCollapsed && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll, isCollapsed]);

  return (
    <div className="console-wrapper">
      <div className="console-header" onClick={onToggleCollapse}>
        <div className="console-header-left">
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span>Console Output ({logs.length} lines)</span>
        </div>

        {!isCollapsed && (
          <div className="console-actions-group" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-icon btn-console-action"
              onClick={() => setAutoScroll(!autoScroll)}
              title="Toggle Auto-Scroll"
            >
              <ArrowDown size={12} color={autoScroll ? "#22c55e" : "#94a3b8"} />
              {autoScroll ? "Auto-Scroll ON" : "Auto-Scroll OFF"}
            </button>
            <button
              className="btn-icon btn-console-action"
              onClick={onClearLogs}
              title="Clear Logs"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="console-box">
          {logs.length === 0 ? (
            <div className="console-line is-sys">Console output will appear here when process runs...</div>
          ) : (
            logs.map((item, idx) => (
              <div
                key={idx}
                className={`console-line ${item.isError ? "is-error" : ""} ${item.text.startsWith("[SYS]") ? "is-sys" : ""}`}
              >
                {item.text}
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>
      )}
    </div>
  );
}
