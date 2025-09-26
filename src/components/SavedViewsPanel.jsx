// src/components/SavedViewsPanel.jsx
import React from "react";

export default function SavedViewsPanel({
  onSave,
  savedCameras,
  onRestore,
  onDelete,
}) {
  return (
    <div className="saved-list">
      <button onClick={onSave}>ビューを保存</button>

      {/* ↓ スクロール用のコンテナを追加 */}
      <div className="saved-views-container">
        {savedCameras.length > 0 ? (
          savedCameras.map((s) => (
            <div
              key={s.id}
              className="saved-view-item" // ← クラス名を変更
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
    </div>
  );
}
