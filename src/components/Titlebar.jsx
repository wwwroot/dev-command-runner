import React, { useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Plus, Minus, Square, X, Terminal, Download, Upload, ChevronsUp, ChevronsDown, Menu } from "lucide-react";

const appWindow = getCurrentWindow();

export function Titlebar({ onAddTask, onExport, onImport, searchFilter, setSearchFilter, onCollapseAll, onExpandAll, onClose }) {
  const fileInputRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="titlebar">
      <div className="titlebar-drag-handle" data-tauri-drag-region />
      <div className="titlebar-left">
        <Terminal size={16} color="#3b82f6" />
        <span className="titlebar-title" data-tauri-drag-region>Dev Command Runner</span>
        
        <div className="titlebar-actions-inline">
          <button
            className="btn-action-icon"
            onClick={onAddTask}
            title="Add Command"
            data-tooltip="Add Command"
          >
            <Plus size={15} />
          </button>
          <button
            className="btn-action-icon"
            onClick={handleImportClick}
            title="Import JSON Shortcuts"
            data-tooltip="Import JSON"
          >
            <Upload size={15} />
          </button>
          <button
            className="btn-action-icon"
            onClick={onExport}
            title="Export JSON Shortcuts"
            data-tooltip="Export JSON"
          >
            <Download size={15} />
          </button>
          <button
            className="btn-action-icon"
            onClick={onExpandAll}
            title="Expand All Cards"
            data-tooltip="Expand All"
          >
            <ChevronsDown size={15} />
          </button>
          <button
            className="btn-action-icon"
            onClick={onCollapseAll}
            title="Collapse All Cards"
            data-tooltip="Collapse All"
          >
            <ChevronsUp size={15} />
          </button>
        </div>

        <div className="titlebar-actions-dropdown">
          <button
            className="btn-action-icon"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu size={15} />
          </button>
          {isMenuOpen && (
            <div className="titlebar-dropdown-menu">
              <button className="dropdown-item" onClick={() => { onAddTask(); setIsMenuOpen(false); }}>
                <Plus size={13} /> Add Command
              </button>
              <button className="dropdown-item" onClick={() => { handleImportClick(); setIsMenuOpen(false); }}>
                <Upload size={13} /> Import JSON
              </button>
              <button className="dropdown-item" onClick={() => { onExport(); setIsMenuOpen(false); }}>
                <Download size={13} /> Export JSON
              </button>
              <button className="dropdown-item" onClick={() => { onExpandAll(); setIsMenuOpen(false); }}>
                <ChevronsDown size={13} /> Expand All
              </button>
              <button className="dropdown-item" onClick={() => { onCollapseAll(); setIsMenuOpen(false); }}>
                <ChevronsUp size={13} /> Collapse All
              </button>
            </div>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          accept=".json"
          onChange={onImport}
        />
      </div>

      <div className="titlebar-center">
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search command or path..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="titlebar-right">
        <button className="window-control-btn" onClick={handleMinimize}>
          <Minus size={14} />
        </button>
        <button className="window-control-btn" onClick={handleToggleMaximize}>
          <Square size={12} />
        </button>
        <button className="window-control-btn btn-close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
