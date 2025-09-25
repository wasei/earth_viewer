// src/hooks/useCameraInfo.js
import { useState, useEffect, useCallback } from "react";
import * as Cesium from "cesium";
import { INITIAL_CAMERA_POSITION } from "../constants";
import { normalizeDegrees } from "../utils/cesiumHelpers";

/**
 * カメラ情報をリアルタイムで取得・更新するカスタムフック
 * @param {Cesium.Viewer | null} viewer - Viewerインスタンス
 * @returns {object} 現在のカメラ情報
 */
export const useCameraInfo = (viewer) => {
  const [cameraInfo, setCameraInfo] = useState(INITIAL_CAMERA_POSITION);

  const updateCameraInfo = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const camera = viewer.camera;
    const cartographic = Cesium.Cartographic.fromCartesian(camera.position);

    if (cartographic) {
      setCameraInfo({
        lon: Cesium.Math.toDegrees(cartographic.longitude),
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        height: cartographic.height,
        heading: normalizeDegrees(Cesium.Math.toDegrees(camera.heading)),
        pitch: Cesium.Math.toDegrees(camera.pitch),
        roll: normalizeDegrees(Cesium.Math.toDegrees(camera.roll)),
        fov: Cesium.Math.toDegrees(camera.frustum.fov),
      });
    }
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;

    const cameraMoveHandler =
      viewer.camera.changed.addEventListener(updateCameraInfo);
    updateCameraInfo();

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.changed.removeEventListener(cameraMoveHandler);
      }
    };
  }, [viewer, updateCameraInfo]);

  return cameraInfo;
};
