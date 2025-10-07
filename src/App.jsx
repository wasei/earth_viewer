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
import "./components/Footer.css";

import {
  setupCesium,
  CAMERA_FLY_DURATION,
  CAMERA_MOVE_SPEED,
  INITIAL_CAMERA_POSITION,
} from "./constants";
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

  // カメラを復元する関数
  const restoreCamera = useCallback(
    (cameraObj) => {
      if (!viewer) return;
      const cesiumData = cameraObj.cesium;
      // アプリ内で保持している高さは「海抜(ASL)」。
      // Cesiumにセットするためにジオイド高を足して「楕円体高」に変換する。
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

  // ★★★ 現在のビューを保存する関数 (修正版) ★★★
  const handleSaveCurrent = useCallback(() => {
    if (!viewer) return;
    const camera = viewer.camera;
    const name = prompt(
      "このビューの名前を入力してください:",
      `ビュー ${savedCameras.length + 1}`
    );
    if (!name) return;

    // Cesiumの現在の位置（楕円体基準）を取得
    const cameraCartographic = Cesium.Cartographic.fromCartesian(
      camera.position
    );
    const cameraLon = Cesium.Math.toDegrees(cameraCartographic.longitude);
    const cameraLat = Cesium.Math.toDegrees(cameraCartographic.latitude);
    const cameraAltitudeEllipsoid = cameraCartographic.height;

    // ジオイド高を計算し、海抜高度(ASL)を算出する
    const geoidHeightCamera = egm96.meanSeaLevel(cameraLat, cameraLon);
    const cameraAltitudeASL = cameraAltitudeEllipsoid - geoidHeightCamera;

    // --- 向きの計算を修正 ---

    // Headingはcameraプロパティから取得
    const heading = Cesium.Math.toDegrees(camera.heading);
    // Rollは意図しない傾きを防ぐため0に固定
    const roll = 0;
    // FOVもcameraプロパティから取得
    const fov = Cesium.Math.toDegrees(camera.frustum.fov);

    // Tiltをカメラのベクトルから直接計算する（より正確な方法）
    // 1. カメラの位置における天頂（真上）ベクトルを計算
    const zenithVector = Cesium.Cartesian3.normalize(
      camera.position,
      new Cesium.Cartesian3()
    );
    // 2. 天頂ベクトルとカメラの視線ベクトルのなす角を計算。これがKMLのTiltに相当する。
    const angleRad = Cesium.Cartesian3.angleBetween(
      zenithVector,
      camera.direction
    );
    const tilt = Cesium.Math.toDegrees(angleRad);

    // 3. アプリ内部で利用するCesiumのPitchは、計算したTiltから逆算して整合性を保つ
    const pitch = tilt - 90.0;

    const newCamera = {
      id: Date.now(),
      name,
      // アプリ内データ：海抜高度を使用
      cesium: {
        lon: cameraLon,
        lat: cameraLat,
        height: cameraAltitudeASL,
        heading,
        pitch, // Tiltから逆算したpitch
        roll,
        fov,
      },
      // KMLエクスポートデータ
      kml: {
        lon: cameraLon,
        lat: cameraLat,
        altitude: cameraAltitudeASL,
        heading,
        tilt, // ベクトル計算から得られた正確なtilt
        roll,
        fov,
      },
    };
    setSavedCameras((prev) => [...prev, newCamera]);
  }, [viewer, savedCameras.length]);

  // KMLエクスポート関数（変更なし）
  const exportKML = useCallback(() => {
    if (savedCameras.length === 0) {
      alert("エクスポートする保存済みビューがありません。");
      return;
    }
    const kmlPlacemarks = savedCameras
      .map((cam) => {
        const kml = cam.kml;
        // 常に<Camera>タグを使用。altitudeには海抜高度が入る。
        const viewTag = `
        <Camera>
          <longitude>${kml.lon}</longitude>
          <latitude>${kml.lat}</latitude>
          <altitude>${kml.altitude}</altitude>
          <heading>${kml.heading}</heading>
          <tilt>${kml.tilt}</tilt>
          <roll>${kml.roll}</roll>
          <altitudeMode>absolute</altitudeMode>
          <gx:horizFov>${kml.fov}</gx:horizFov>
        </Camera>`;
        return `
      <Placemark>
        <name>${cam.name}</name>${viewTag}
      </Placemark>`;
      })
      .join("");
    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>Cesium Saved Views</name>
    <Folder>
      <name>Saved Views</name>
      ${kmlPlacemarks}
    </Folder>
  </Document>
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

  // KMLインポート関数（変更なし）
  const importKML = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const kmlText = e.target.result;
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(kmlText, "text/xml");
        const placemarks = kmlDoc.querySelectorAll("Placemark");

        if (placemarks.length === 0) {
          alert("KMLファイルに有効な<Placemark>が見つかりませんでした。");
          return;
        }

        const newCameras = Array.from(placemarks)
          .map((pm, index) => {
            const name =
              pm.querySelector("name")?.textContent ||
              `インポートビュー ${index + 1}`;
            const camera = pm.querySelector("Camera");

            if (camera) {
              const lon = parseFloat(
                camera.querySelector("longitude")?.textContent || 0
              );
              const lat = parseFloat(
                camera.querySelector("latitude")?.textContent || 0
              );
              const altitudeKML = parseFloat(
                camera.querySelector("altitude")?.textContent || 0
              );

              const heading = parseFloat(
                camera.querySelector("heading")?.textContent || 0
              );
              const tilt = parseFloat(
                camera.querySelector("tilt")?.textContent || 0
              );
              const roll = 0;
              const fov = parseFloat(
                camera.querySelector("gx\\:horizFov, horizFov")?.textContent ||
                  INITIAL_CAMERA_POSITION.fov
              );

              const altitudeASL = altitudeKML;
              const pitch = tilt - 90.0;

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
                  heading,
                  tilt,
                  roll,
                  fov,
                },
              };
            }
            return null;
          })
          .filter(Boolean);

        setSavedCameras((prev) => [...prev, ...newCameras]);
        alert(`${newCameras.length}個のビューをインポートしました。`);
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
