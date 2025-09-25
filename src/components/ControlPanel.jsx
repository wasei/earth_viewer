// src/components/ControlPanel.jsx
import React, { forwardRef } from "react";

const ControlPanel = forwardRef(
  ({ onSave, onImportClick, onExport, onFileChange }, ref) => {
    return (
      <div className="controls">
        <button onClick={onSave}>現在地を保存</button>
        <input
          type="file"
          accept=".kml"
          ref={ref}
          hidden
          onChange={onFileChange}
        />
        <button type="button" onClick={onImportClick}>
          KMLインポート
        </button>
        <button onClick={onExport}>KMLエクスポート</button>
      </div>
    );
  }
);

export default ControlPanel;
