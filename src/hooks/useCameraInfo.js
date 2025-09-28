import { useState, useEffect } from "react";
import * as Cesium from "cesium";
import * as egm96 from "egm96-universal";

export function useCameraInfo(viewer) {
  const [cameraInfo, setCameraInfo] = useState({
    lat: 0,
    lon: 0,
    height: 0,
    heading: 0,
    pitch: 0,
    fov: 0,
  });

  useEffect(() => {
    if (!viewer) return;

    const preRenderListener = () => {
      const camera = viewer.camera;

      // Cartesian -> Cartographic
      const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(
        camera.position
      );

      // 緯度経度（ラジアン→度）
      const latitude = Cesium.Math.toDegrees(carto.latitude);
      const longitude = Cesium.Math.toDegrees(carto.longitude);

      // EGM96 ジオイド高を取得
      const geoidHeight = egm96.meanSeaLevel(latitude, longitude);

      // 海抜高度を計算
      const altitudeASL = carto.height - geoidHeight;

      // 新しいカメラ情報を取得
      const newInfo = {
        lat: latitude,
        lon: longitude,
        height: altitudeASL,
        heading: Cesium.Math.toDegrees(camera.heading),
        pitch: Cesium.Math.toDegrees(camera.pitch),
        fov: Cesium.Math.toDegrees(camera.frustum.fov),
      };

      // stateを更新してUIを再レンダリング
      setCameraInfo(newInfo);
    };

    // preRenderイベントに登録
    viewer.scene.preRender.addEventListener(preRenderListener);

    // クリーンアップ関数
    return () => {
      viewer.scene.preRender.removeEventListener(preRenderListener);
    };
  }, [viewer]);

  return cameraInfo;
}
