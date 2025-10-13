// src/components/CameraInfoPanel.jsx
import React, { useState, useEffect, useCallback } from "react";
import * as Cesium from "cesium";

// 緯度経度を度・分・秒（DMS）形式に変換するヘルパー関数
const convertToDMS = (dd, type) => {
  const absolute = Math.abs(dd);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2);

  let direction;
  if (type === "lat") {
    direction = dd >= 0 ? "N" : "S"; // 北緯/南緯
  } else {
    direction = dd >= 0 ? "E" : "W"; // 東経/西経
  }

  return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
};

export default function CameraInfoPanel({
  cameraInfo,
  viewer,
  cameraSpeed,
  onSpeedChange,
  isFreeCamera,
  onCameraModeChange,
}) {
  const [sliderFov, setSliderFov] = useState(cameraInfo.fov);

  useEffect(() => {
    setSliderFov(cameraInfo.fov);
  }, [cameraInfo.fov]);

  const handleFovChange = useCallback(
    (e) => {
      if (!viewer) return;
      const newFovDegrees = parseFloat(e.target.value);
      setSliderFov(newFovDegrees);
      viewer.camera.frustum.fov = Cesium.Math.toRadians(newFovDegrees);
    },
    [viewer, setSliderFov]
  );

  const handleSpeedChange = useCallback(
    (e) => {
      const newSpeed = parseFloat(e.target.value);
      onSpeedChange(newSpeed);
    },
    [onSpeedChange]
  );

  const handleModeChange = useCallback(
    (e) => {
      onCameraModeChange(e.target.checked);
    },
    [onCameraModeChange]
  );

  return (
    <div className="camera-info-container">
      <div className="info-group">
        <div className="info-item">
          <span className="info-label">緯度:</span>
          <span className="info-value">
            {convertToDMS(cameraInfo.lat, "lat")}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">経度:</span>
          <span className="info-value">
            {convertToDMS(cameraInfo.lon, "lon")}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">高度:</span>
          <span className="info-value">{Math.round(cameraInfo.height)}m</span>
        </div>
        <div className="info-item">
          <span className="info-label">方位:</span>
          <span className="info-value">{Math.round(cameraInfo.heading)}°</span>
        </div>
        <div className="info-item">
          <span className="info-label">ピッチ:</span>
          <span className="info-value">{Math.round(cameraInfo.pitch)}°</span>
        </div>
      </div>

      <div className="info-group">
        <div className="control-item">
          <label htmlFor="fov-slider">画角: {Math.round(sliderFov)}°</label>
          <input
            id="fov-slider"
            type="range"
            min="10"
            max="120"
            step="1"
            value={sliderFov}
            onChange={handleFovChange}
            title="カメラの画角を変更"
          />
        </div>

        {isFreeCamera && (
          <div className="control-item">
            <label htmlFor="speed-slider">
              移動速度: {cameraSpeed.toFixed(1)}
            </label>
            <input
              id="speed-slider"
              type="range"
              min="0.1"
              max="7.0"
              step="0.1"
              value={cameraSpeed}
              onChange={handleSpeedChange}
              title="カメラの移動速度を変更"
            />
          </div>
        )}

        <div className="camera-mode-control">
          <span>オービット</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isFreeCamera}
              onChange={handleModeChange}
            />
            <span className="toggle-slider"></span>
          </label>
          <span>フリー</span>
        </div>
      </div>
    </div>
  );
}
