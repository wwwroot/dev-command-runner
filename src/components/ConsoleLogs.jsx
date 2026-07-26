import React, { useRef, useEffect, useState } from "react";
import { Trash2, ArrowDown, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

export function ConsoleLogs({ logs = [], isCollapsed, onToggleCollapse, onClearLogs, autoScroll, setAutoScroll }) {
  const consoleBoxRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textToCopy = logs.map(item => item.text).join("\n");
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy console logs:", err);
    }
  };

  useEffect(() => {
    if (autoScroll && !isCollapsed && consoleBoxRef.current) {
      consoleBoxRef.current.scrollTop = consoleBoxRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isCollapsed]);

  return (
    <div className="console-wrapper">
      <div className="console-header" onClick={onToggleCollapse}>
        <div className="console-header-left">
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span>Console Output ({logs.length} lines)</span>
        </div>

        <div className="console-actions-group" onClick={(e) => e.stopPropagation()}>
          {!isCollapsed && (
            <button
              className="btn-icon btn-console-action"
              onClick={() => setAutoScroll(!autoScroll)}
              title="Toggle Auto-Scroll"
            >
              <ArrowDown size={12} color={autoScroll ? "#22c55e" : "#94a3b8"} />
              {autoScroll ? "Auto-Scroll ON" : "Auto-Scroll OFF"}
            </button>
          )}
          <button
            className="btn-icon btn-console-action"
            onClick={handleCopy}
            title="Copy Output"
            disabled={logs.length === 0}
          >
            {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
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
      </div>

      {!isCollapsed && (
        <div className="console-box" ref={consoleBoxRef}>
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
        </div>
      )}
    </div>
  );
}
