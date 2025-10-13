// src/components/CameraInfoPanel.jsx
import React, { useState, useEffect, useCallback } from "react";
import * as Cesium from "cesium";

// ★緯度経度を度・分・秒（DMS）形式に変換するヘルパー関数
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
    <>
      {/* ★変更箇所: toFixed(6) から convertToDMS 関数呼び出しに変更 */}
      <div>緯度: {convertToDMS(cameraInfo.lat, "lat")}</div>
      <div>経度: {convertToDMS(cameraInfo.lon, "lon")}</div>
      <div>高度: {Math.round(cameraInfo.height)}m</div>
      <div>方位: {Math.round(cameraInfo.heading)}°</div>
      <div>ピッチ: {Math.round(cameraInfo.pitch)}°</div>
      <div className="fov-control">
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
        <div className="speed-control">
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
    </>
  );
}
