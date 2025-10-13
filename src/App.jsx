// src/App.jsx

import React, { useState, useRef, useCallback } from "react";
import * as Cesium from "cesium";
import * as egm96 from "egm96-universal";

import { useCesium } from "./hooks/useCesium";
import { useCameraInfo } from "./hooks/useCameraInfo";
import { useCameraControls } from "./hooks/useCameraControls";

import CesiumViewer from "./components/CesiumViewer";
import CameraInfoPanel from "./components/CameraInfoPanel";
import ControlPanel from "./components/ControlPanel";
import SavedViewsPanel from "./components/SavedViewsPanel";
import Footer from "./components/Footer";

import {
  setupCesium,
  CAMERA_FLY_DURATION,
  CAMERA_MOVE_SPEED,
  INITIAL_CAMERA_POSITION,
} from "./constants";
import { normalizeDegrees } from "./utils/cesiumHelpers";

import "./styles/App.css";

// アプリケーションの初期化処理
setupCesium();

export default function App() {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [savedCameras, setSavedCameras] = useState([]);
  const [cameraSpeed, setCameraSpeed] = useState(CAMERA_MOVE_SPEED);
  const [isFreeCamera, setIsFreeCamera] = useState(false);

  const viewer = useCesium(containerRef);
  const cameraInfo = useCameraInfo(viewer);
  useCameraControls(viewer, cameraSpeed, isFreeCamera);

  const restoreCamera = useCallback(
    (cameraObj) => {
      if (!viewer) return;
      const cesiumData = cameraObj.cesium;
      const geoidHeight = egm96.meanSeaLevel(cesiumData.lat, cesiumData.lon);
      const heightWGS84 = cesiumData.height + geoidHeight;

      if (cesiumData.fov) {
        viewer.camera.frustum.fov = Cesium.Math.toRadians(cesiumData.fov);
      }

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          cesiumData.lon,
          cesiumData.lat,
          heightWGS84
        ),
        orientation: {
          heading: Cesium.Math.toRadians(cesiumData.heading),
          pitch: Cesium.Math.toRadians(cesiumData.pitch),
          roll: Cesium.Math.toRadians(cesiumData.roll),
        },
        duration: CAMERA_FLY_DURATION,
      });
    },
    [viewer]
  );

  const handleSaveCurrent = useCallback(() => {
    if (!viewer) return;
    const camera = viewer.camera;
    const name = prompt(
      "このビューの名前を入力してください:",
      `ビュー ${savedCameras.length + 1}`
    );
    if (!name) return;

    const cameraCartographic = Cesium.Cartographic.fromCartesian(
      camera.position
    );
    const cameraLon = Cesium.Math.toDegrees(cameraCartographic.longitude);
    const cameraLat = Cesium.Math.toDegrees(cameraCartographic.latitude);
    const cameraAltitudeEllipsoid = cameraCartographic.height;

    const geoidHeightCamera = egm96.meanSeaLevel(cameraLat, cameraLon);
    const cameraAltitudeASL = cameraAltitudeEllipsoid - geoidHeightCamera;

    // ★★★ 修正箇所: KML変換ロジックを最終版に更新 ★★★

    // カメラの基本ベクトルをローカル座標系（East-North-Up）に変換
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(
      camera.position
    );
    const inverseTransform = Cesium.Matrix4.inverse(
      transform,
      new Cesium.Matrix4()
    );
    const localDirection = Cesium.Matrix4.multiplyByPointAsVector(
      inverseTransform,
      camera.direction,
      new Cesium.Cartesian3()
    );
    const localUp = Cesium.Matrix4.multiplyByPointAsVector(
      inverseTransform,
      camera.up,
      new Cesium.Cartesian3()
    );

    // Tiltの計算：真下(0度)から水平(90度)までの角度を正確に計算
    // localDirectionと真下ベクトル(0,0,-1)との間の角度を求める
    const kmlTilt = Cesium.Math.toDegrees(Math.acos(-localDirection.z));

    let kmlHeading;
    const epsilon = 1.0; // 判定の閾値（1度）

    // Tiltが真下(0)または真上(180)に近いか判定
    if (kmlTilt < epsilon || Math.abs(kmlTilt - 180.0) < epsilon) {
      // 真下/真上ビューの場合：Headingはカメラの「上方向」ベクトルから決定する
      // これにより、画面の回転が正しくHeadingに反映される
      kmlHeading = Cesium.Math.toDegrees(Math.atan2(localUp.x, localUp.y));
    } else {
      // 通常の斜めビューの場合：Headingはカメラの「視線方向」ベクトルから決定する
      kmlHeading = Cesium.Math.toDegrees(
        Math.atan2(localDirection.x, localDirection.y)
      );
    }

    if (kmlHeading < 0) {
      kmlHeading += 360.0;
    }

    // Rollは常に0に固定して、意図しない回転を完全に防ぐ
    const kmlRoll = 0;

    // アプリ内復元用のCesiumの生の値も保存しておく
    const cesiumHeading = Cesium.Math.toDegrees(camera.heading);
    const cesiumPitch = Cesium.Math.toDegrees(camera.pitch);
    const cesiumRoll = Cesium.Math.toDegrees(camera.roll);
    const cesiumFov = Cesium.Math.toDegrees(camera.frustum.fov);

    const newCamera = {
      id: Date.now(),
      name,
      cesium: {
        lon: cameraLon,
        lat: cameraLat,
        height: cameraAltitudeASL,
        heading: cesiumHeading,
        pitch: cesiumPitch,
        roll: cesiumRoll,
        fov: cesiumFov,
      },
      kml: {
        lon: cameraLon,
        lat: cameraLat,
        altitude: cameraAltitudeASL,
        heading: kmlHeading,
        tilt: kmlTilt,
        roll: kmlRoll,
        fov: cesiumFov,
      },
    };
    setSavedCameras((prev) => [...prev, newCamera]);
  }, [viewer, savedCameras.length]);

  const exportKML = useCallback(() => {
    if (savedCameras.length === 0) {
      alert("エクスポートする保存済みビューがありません。");
      return;
    }

    const kmlTours = savedCameras
      .map((cam) => {
        const kml = cam.kml;
        return `
    <gx:Tour>
      <name>${cam.name}</name>
      <gx:Playlist>
        <gx:FlyTo>
          <Camera>
            <longitude>${kml.lon}</longitude>
            <latitude>${kml.lat}</latitude>
            <altitude>${kml.altitude}</altitude>
            <heading>${kml.heading}</heading>
            <tilt>${kml.tilt}</tilt>
            <roll>${kml.roll}</roll>
            <gx:altitudeMode>absolute</gx:altitudeMode>
            <gx:horizFov>${kml.fov}</gx:horizFov>
          </Camera>
        </gx:FlyTo>
      </gx:Playlist>
    </gx:Tour>`;
      })
      .join("");

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
  <Folder>
    <name>Cesium Saved Views</name>
    <open>1</open>${kmlTours}
  </Folder>
</kml>`;

    const blob = new Blob([kmlContent], {
      type: "application/vnd.google-earth.kml+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cesium-views-${Date.now()}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [savedCameras]);

  const importKML = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const kmlText = e.target.result;
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(kmlText, "text/xml");
        const cameraNodes = kmlDoc.querySelectorAll("Camera");

        if (cameraNodes.length === 0) {
          alert("KMLファイルに有効なカメラビューが見つかりませんでした。");
          return;
        }

        const newCameras = Array.from(cameraNodes)
          .map((camera, index) => {
            const tourParent = camera.closest("Tour, gx\\:Tour");
            const placemarkParent = camera.closest("Placemark");
            let name = `インポートビュー ${index + 1}`;
            if (tourParent) {
              name = tourParent.querySelector("name")?.textContent || name;
            } else if (placemarkParent) {
              name = placemarkParent.querySelector("name")?.textContent || name;
            }

            const lon = parseFloat(
              camera.querySelector("longitude")?.textContent || 0
            );
            const lat = parseFloat(
              camera.querySelector("latitude")?.textContent || 0
            );
            const altitudeKML = parseFloat(
              camera.querySelector("altitude")?.textContent || 0
            );
            const headingKML = parseFloat(
              camera.querySelector("heading")?.textContent || 0
            );
            const tiltKML = parseFloat(
              camera.querySelector("tilt")?.textContent || 0
            );
            const rollKML = parseFloat(
              camera.querySelector("roll")?.textContent || 0
            );
            const fov = parseFloat(
              camera.querySelector("gx\\:horizFov, horizFov")?.textContent ||
                INITIAL_CAMERA_POSITION.fov
            );

            const altitudeASL = altitudeKML;
            const heading = normalizeDegrees(headingKML);
            const pitch = tiltKML - 90.0;
            const roll = normalizeDegrees(rollKML);

            return {
              id: Date.now() + index,
              name,
              cesium: {
                lon,
                lat,
                height: altitudeASL,
                heading,
                pitch,
                roll,
                fov,
              },
              kml: {
                lon,
                lat,
                altitude: altitudeKML,
                heading: headingKML,
                tilt: tiltKML,
                roll: rollKML,
                fov,
              },
            };
          })
          .filter(Boolean);

        if (newCameras.length > 0) {
          setSavedCameras((prev) => [...prev, ...newCameras]);
          alert(`${newCameras.length}個のビューをインポートしました。`);
        } else {
          alert("KMLファイルから有効なカメラ情報を抽出できませんでした。");
        }
      } catch (error) {
        console.error("KMLファイルのパースに失敗しました。", error);
        alert("KMLファイルの読み込みに失敗しました。");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) {
        importKML(file);
      }
      e.target.value = "";
    },
    [importKML]
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDeleteSaved = useCallback((cameraToDelete) => {
    if (window.confirm(`ビュー "${cameraToDelete.name}" を削除しますか？`)) {
      setSavedCameras((prev) =>
        prev.filter((cam) => cam.id !== cameraToDelete.id)
      );
    }
  }, []);

  const handleSpeedChange = useCallback((newSpeed) => {
    setCameraSpeed(newSpeed);
  }, []);

  return (
    <div className="cesium-app-root">
      <div className="topbar">
        <CameraInfoPanel
          cameraInfo={cameraInfo}
          viewer={viewer}
          cameraSpeed={cameraSpeed}
          onSpeedChange={handleSpeedChange}
          isFreeCamera={isFreeCamera}
          onCameraModeChange={setIsFreeCamera}
        />
        <ControlPanel
          ref={fileInputRef}
          onImportClick={handleImportClick}
          onExport={exportKML}
          onFileChange={handleFileChange}
        />
      </div>

      <div className="main-content">
        <CesiumViewer ref={containerRef} />
      </div>

      <div className="bottom-panel">
        <SavedViewsPanel
          onSave={handleSaveCurrent}
          savedCameras={savedCameras}
          onRestore={restoreCamera}
          onDelete={handleDeleteSaved}
        />
        <Footer />
      </div>
    </div>
  );
}
