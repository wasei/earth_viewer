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
  const cameraInfo = useCameraInfo(viewer); // UI表示用として引き続き使用
  useCameraControls(viewer, cameraSpeed, isFreeCamera);

  const restoreCamera = useCallback(
    (cameraObj) => {
      if (!viewer) return;

      const cesiumData = cameraObj.cesium;

      // ★★★ ここから修正 ★★★
      // 1. 保存されている緯度経度から、その地点のEGM96ジオイド高を計算します。
      const geoidHeight = egm96.meanSeaLevel(cesiumData.lat, cesiumData.lon);

      // 2. 保存されている海抜高度 (cesiumData.height) にジオイド高を足し合わせ、
      //    Cesiumがカメラ位置として要求する楕円体高 (height WGS84) を算出します。
      const heightWGS84 = cesiumData.height + geoidHeight;
      // ★★★ ここまで修正 ★★★

      if (cesiumData.fov) {
        viewer.camera.frustum.fov = Cesium.Math.toRadians(cesiumData.fov);
      }

      viewer.camera.flyTo({
        // 算出した楕円体高 (heightWGS84) を使用します。
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

  // ★★★ ここから修正 (handleSaveCurrent) ★★★
  // src/App.jsx

  // ★★★ ここから修正 (handleSaveCurrent) ★★★
  const handleSaveCurrent = useCallback(() => {
    if (!viewer) return;

    const camera = viewer.camera;
    const scene = viewer.scene;

    // 1. 画面中心からレイ（光線）を生成
    const windowPosition = new Cesium.Cartesian2(
      viewer.canvas.clientWidth / 2,
      viewer.canvas.clientHeight / 2
    );
    const pickRay = camera.getPickRay(windowPosition);

    // 2. 注視点（ターゲット）を決定する
    let pickPosition;

    // まず、地形との交点を試す（最も正確）
    pickPosition = scene.globe.pick(pickRay, scene);

    // 地形と交差しない場合（空や水平線を見ている）、地球の楕円体との交点を計算
    if (!Cesium.defined(pickPosition)) {
      const intersection = Cesium.IntersectionTests.rayEllipsoid(
        pickRay,
        Cesium.Ellipsoid.WGS84
      );
      if (intersection) {
        pickPosition = Cesium.Ray.getPoint(pickRay, intersection.start);
      }
    }

    // それでも交点が見つからない場合（地球の裏側を向いているなど）、最終手段としてカメラ直下をターゲットに
    if (!Cesium.defined(pickPosition)) {
      console.warn(
        "注視点が地球上で特定できませんでした。カメラ直下の地点を基準に保存します。"
      );
      const cameraCartographic = Cesium.Cartographic.fromCartesian(
        camera.position
      );
      pickPosition = Cesium.Cartesian3.fromRadians(
        cameraCartographic.longitude,
        cameraCartographic.latitude,
        0.0
      );
    }

    const name = prompt(
      "このビューの名前を入力してください:",
      `ビュー ${savedCameras.length + 1}`
    );

    if (name) {
      // --- KML用データの計算 ---
      const pickCartographic = Cesium.Cartographic.fromCartesian(pickPosition);
      const targetLon = Cesium.Math.toDegrees(pickCartographic.longitude);
      const targetLat = Cesium.Math.toDegrees(pickCartographic.latitude);
      const geoidHeightKML = egm96.meanSeaLevel(targetLat, targetLon);
      const targetAltitude = pickCartographic.height - geoidHeightKML;

      const range = Cesium.Cartesian3.distance(camera.position, pickPosition);
      const heading = Cesium.Math.toDegrees(camera.heading);
      const pitch = Cesium.Math.toDegrees(camera.pitch);

      // ★ 修正点: Cesiumのpitch (-90°=真下, 0°=水平) から
      // KMLのtilt (0°=真下, 90°=水平) へ正しく変換する。
      // これにより、isLookingUpフラグが不要になり、常に正しい角度が計算される。
      const tilt = pitch + 90.0;
      const fov = Cesium.Math.toDegrees(camera.frustum.fov);

      // --- アプリ内復元用のデータ計算 ---
      const cameraCartographic = Cesium.Cartographic.fromCartesian(
        camera.position
      );
      const cameraLon = Cesium.Math.toDegrees(cameraCartographic.longitude);
      const cameraLat = Cesium.Math.toDegrees(cameraCartographic.latitude);
      const geoidHeightCamera = egm96.meanSeaLevel(cameraLat, cameraLon);
      const cameraAltitudeASL = cameraCartographic.height - geoidHeightCamera;

      const newCamera = {
        id: Date.now(),
        name,
        // アプリ内復元用データ
        cesium: {
          lon: cameraLon,
          lat: cameraLat,
          height: cameraAltitudeASL,
          heading: heading,
          pitch: pitch,
          roll: Cesium.Math.toDegrees(camera.roll),
          fov: fov,
        },
        // KMLエクスポート用データ
        kml: {
          lon: targetLon,
          lat: targetLat,
          altitude: targetAltitude,
          heading: heading,
          tilt: tilt,
          range: range,
          fov: fov,
        },
      };

      setSavedCameras((prev) => [...prev, newCamera]);
    }
  }, [viewer, savedCameras.length]); // 依存配列に savedCameras.length を追加
  // ★★★ ここまで修正 (handleSaveCurrent) ★★★
  // ★★★ ここまで修正 (handleSaveCurrent) ★★★

  const exportKML = useCallback(() => {
    if (savedCameras.length === 0) {
      alert("エクスポートする保存済みビューがありません。");
      return;
    }

    const kmlPlacemarks = savedCameras
      .map((cam) => {
        const kml = cam.kml;
        return `
      <Placemark>
        <name>${cam.name}</name>
        <LookAt>
          <longitude>${kml.lon}</longitude>
          <latitude>${kml.lat}</latitude>
          <altitude>${kml.altitude}</altitude>
          <heading>${kml.heading}</heading>
          <tilt>${kml.tilt}</tilt>
          <range>${kml.range}</range>
          <altitudeMode>absolute</altitudeMode>
          <gx:horizFov>${kml.fov || INITIAL_CAMERA_POSITION.fov}</gx:horizFov>
        </LookAt>
      </Placemark>
    `;
      })
      .join("");

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>Cesium Views</name>
    ${kmlPlacemarks}
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
            const lookAt = pm.querySelector("LookAt");
            if (!lookAt) return null;

            const lon = parseFloat(
              lookAt.querySelector("longitude")?.textContent || 0
            );
            const lat = parseFloat(
              lookAt.querySelector("latitude")?.textContent || 0
            );
            const altitude = parseFloat(
              lookAt.querySelector("altitude")?.textContent || 1000
            );
            const heading = parseFloat(
              lookAt.querySelector("heading")?.textContent || 0
            );
            const tilt = parseFloat(
              lookAt.querySelector("tilt")?.textContent || 0
            );
            const range = parseFloat(
              lookAt.querySelector("range")?.textContent || 1000
            );
            const fov = parseFloat(
              lookAt.querySelector("horizFov")?.textContent ||
                INITIAL_CAMERA_POSITION.fov
            );
            const pitch = tilt - 90.0;

            const targetPosition = Cesium.Cartesian3.fromDegrees(
              lon,
              lat,
              altitude
            );
            const hpr = new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(heading),
              Cesium.Math.toRadians(pitch),
              range
            );
            const cameraPosition =
              Cesium.Transforms.headingPitchRangeToFixedFrame(
                targetPosition,
                hpr,
                Cesium.Ellipsoid.WGS84,
                Cesium.Transforms.eastNorthUpToFixedFrame,
                new Cesium.Cartesian3()
              );
            const cameraCartographic =
              Cesium.Cartographic.fromCartesian(cameraPosition);

            // インポート時も、カメラ位置のEGM96補正を行うことで、UI表示との一貫性を保つ
            const importedCameraLon = Cesium.Math.toDegrees(
              cameraCartographic.longitude
            );
            const importedCameraLat = Cesium.Math.toDegrees(
              cameraCartographic.latitude
            );
            const geoidHeight = egm96.meanSeaLevel(
              importedCameraLat,
              importedCameraLon
            );
            const cameraAltitudeASL = cameraCartographic.height - geoidHeight;

            return {
              id: Date.now() + index,
              name,
              cesium: {
                lon: importedCameraLon,
                lat: importedCameraLat,
                height: cameraAltitudeASL, // EGM96補正後の高度を保存
                heading: heading,
                pitch: pitch,
                roll: 0,
                fov: fov,
              },
              kml: {
                lon,
                lat,
                altitude,
                heading,
                tilt,
                range,
                fov,
              },
            };
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
        />{" "}
        <Footer />
      </div>
    </div>
  );
}
