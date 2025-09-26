// src/components/ControlPanel.jsx
import React, { forwardRef } from "react";

const ControlPanel = forwardRef(
  ({ onImportClick, onExport, onFileChange }, ref) => {
    return (
      <div className="controls">
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
