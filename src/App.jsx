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

  // ★★★ 修正箇所: KMLエクスポートのロジックを簡素化 ★★★
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

    // --- Cesiumのカメラパラメータを直接取得 ---
    const heading = Cesium.Math.toDegrees(camera.heading);
    const pitch = Cesium.Math.toDegrees(camera.pitch);
    const roll = Cesium.Math.toDegrees(camera.roll);
    const fov = Cesium.Math.toDegrees(camera.frustum.fov);

    // --- KML用の値を計算 ---
    // 複雑な条件分岐をなくし、常に直接的な変換を行う
    const tiltKML = pitch + 90.0;

    const newCamera = {
      id: Date.now(),
      name,
      // アプリ内での復元には、Cesiumの生の値をそのまま使う
      cesium: {
        lon: cameraLon,
        lat: cameraLat,
        height: cameraAltitudeASL,
        heading,
        pitch,
        roll,
        fov,
      },
      // KMLエクスポートには、標準的な変換を適用した値を使う
      kml: {
        lon: cameraLon,
        lat: cameraLat,
        altitude: cameraAltitudeASL,
        heading: heading, // headingはそのまま
        tilt: tiltKML, // tiltは常に pitch + 90
        roll: roll, // rollはそのまま
        fov,
      },
    };
    setSavedCameras((prev) => [...prev, newCamera]);
  }, [viewer, savedCameras.length]);

  // KMLエクスポート関数 (変更なし)
  const exportKML = useCallback(() => {
    if (savedCameras.length === 0) {
      alert("エクスポートする保存済みビューがありません。");
      return;
    }

    const kmlTours = savedCameras
      .map((cam) => {
        const kml = cam.kml;
        // 各ビューを <gx:Tour> 形式で出力
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

    // KML全体の構造をサンプルに合わせる
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

  // KMLインポート関数 (変更なし)
  const importKML = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const kmlText = e.target.result;
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(kmlText, "text/xml");

        // <Camera> タグを直接すべて探し、そこから情報を組み立てる
        const cameraNodes = kmlDoc.querySelectorAll("Camera");

        if (cameraNodes.length === 0) {
          alert("KMLファイルに有効なカメラビューが見つかりませんでした。");
          return;
        }

        const newCameras = Array.from(cameraNodes)
          .map((camera, index) => {
            // 親を辿って名前を探す (<gx:Tour> or <Placemark>)
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
            const heading = parseFloat(
              camera.querySelector("heading")?.textContent || 0
            );
            const tilt = parseFloat(
              camera.querySelector("tilt")?.textContent || 0
            );
            const roll = 0; // Rollは0に固定
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

  // --- これ以降のコンポーネント部分は変更なし ---

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
