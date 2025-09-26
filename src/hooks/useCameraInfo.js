// src/hooks/useCameraInfo.js
import { useState, useEffect } from "react";
import * as Cesium from "cesium";
import { INITIAL_CAMERA_POSITION } from "../constants";

export function useCameraInfo(viewer) {
  const [cameraInfo, setCameraInfo] = useState({
    lat: INITIAL_CAMERA_POSITION.lat,
    lon: INITIAL_CAMERA_POSITION.lon,
    height: INITIAL_CAMERA_POSITION.height,
    heading: INITIAL_CAMERA_POSITION.heading,
    pitch: INITIAL_CAMERA_POSITION.pitch,
    fov: INITIAL_CAMERA_POSITION.fov,
  });

  useEffect(() => {
    if (!viewer) return;

    // preRenderイベントリスナーを登録
    // このイベントは毎フレーム呼び出されるため、UIが滑らかに更新されます
    const removeEventListener = viewer.scene.preRender.addEventListener(() => {
      const camera = viewer.camera;
      const positionCartographic = Cesium.Cartographic.fromCartesian(
        camera.position
      );

      // 新しいカメラ情報を取得
      const newInfo = {
        lon: Cesium.Math.toDegrees(positionCartographic.longitude),
        lat: Cesium.Math.toDegrees(positionCartographic.latitude),
        height: positionCartographic.height,
        heading: Cesium.Math.toDegrees(camera.heading),
        pitch: Cesium.Math.toDegrees(camera.pitch),
        fov: Cesium.Math.toDegrees(camera.frustum.fov),
      };

      // stateを更新してUIを再レンダリング
      setCameraInfo(newInfo);
    });

    // クリーンアップ関数
    // コンポーネントがアンマウントされる際にイベントリスナーを解除します
    return () => {
      removeEventListener();
    };
  }, [viewer]); // viewerが変更された場合にのみeffectを再実行

  return cameraInfo;
}
