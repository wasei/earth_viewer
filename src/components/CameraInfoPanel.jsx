// src/components/CameraInfoPanel.jsx
import React, { useMemo, useCallback } from "react";
import * as Cesium from "cesium";

export default function CameraInfoPanel({ cameraInfo, viewer }) {
  const displayInfo = useMemo(
    () => ({
      ...cameraInfo,
      height: Math.round(cameraInfo.height),
      heading: Math.round(cameraInfo.heading),
      pitch: Math.round(cameraInfo.pitch),
      fov: Math.round(cameraInfo.fov),
    }),
    [cameraInfo]
  );

  const handleFovChange = useCallback(
    (e) => {
      if (!viewer) return;
      const newFovDegrees = parseFloat(e.target.value);
      viewer.camera.frustum.fov = Cesium.Math.toRadians(newFovDegrees);
    },
    [viewer]
  );

  return (
    <>
      <div>緯度: {displayInfo.lat.toFixed(6)}</div>
      <div>経度: {displayInfo.lon.toFixed(6)}</div>
      <div>高度: {displayInfo.height}m</div>
      <div>方位: {displayInfo.heading}°</div>
      <div>ピッチ: {displayInfo.pitch}°</div>
      <div className="fov-control">
        <label htmlFor="fov-slider">画角: {displayInfo.fov}°</label>
        <input
          id="fov-slider"
          type="range"
          min="10"
          max="120"
          step="1"
          value={displayInfo.fov}
          onChange={handleFovChange}
          title="カメラの画角を変更"
        />
      </div>
    </>
  );
}
