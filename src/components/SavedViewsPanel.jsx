// src/components/SavedViewsPanel.jsx
import React from "react";

export default function SavedViewsPanel({ savedCameras, onRestore, onDelete }) {
  return (
    <div className="saved-list">
      {savedCameras.length > 0 ? (
        savedCameras.map((s) => (
          <div
            key={s.id}
            className="saved-list-item"
            onClick={() => onRestore(s)}
            onContextMenu={(e) => {
              e.preventDefault();
              onDelete(s);
            }}
            title="クリックで移動、右クリックで削除"
          >
            {s.name}
          </div>
        ))
      ) : (
        <div className="no-saved-views">保存されたビューはありません。</div>
      )}
    </div>
  );
}
