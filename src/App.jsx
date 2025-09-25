// src/App.jsx
import React, { useState, useRef, useCallback } from "react";
import * as Cesium from "cesium";

import { useCesium } from "./hooks/useCesium";
import { useCameraInfo } from "./hooks/useCameraInfo";
import { useCameraControls } from "./hooks/useCameraControls";

import CesiumViewer from "./components/CesiumViewer";
import CameraInfoPanel from "./components/CameraInfoPanel";
import ControlPanel from "./components/ControlPanel";
import SavedViewsPanel from "./components/SavedViewsPanel";

import {
  setupCesium,
  CAMERA_FLY_DURATION,
  CAMERA_MOVE_SPEED,
} from "./constants";
import "./styles/App.css";

// アプリケーションの初期化処理
setupCesium();

export default function App() {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [savedCameras, setSavedCameras] = useState([]);
  const [cameraSpeed, setCameraSpeed] = useState(CAMERA_MOVE_SPEED);

  const viewer = useCesium(containerRef);
  const cameraInfo = useCameraInfo(viewer);
  useCameraControls(viewer, cameraSpeed);

  const restoreCamera = useCallback(
    (cameraObj) => {
      if (!viewer) return;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          cameraObj.lon,
          cameraObj.lat,
          cameraObj.height
        ),
        orientation: {
          heading: Cesium.Math.toRadians(cameraObj.heading),
          pitch: Cesium.Math.toRadians(cameraObj.pitch),
          roll: Cesium.Math.toRadians(cameraObj.roll),
        },
        duration: CAMERA_FLY_DURATION,
      });
    },
    [viewer]
  );

  const handleSaveCurrent = useCallback(() => {
    const name = prompt(
      "このビューの名前を入力してください:",
      `ビュー ${savedCameras.length + 1}`
    );
    if (name) {
      const newCamera = { id: Date.now(), name, ...cameraInfo };
      setSavedCameras((prev) => [...prev, newCamera]);
    }
  }, [cameraInfo, savedCameras]);

  const exportKML = useCallback(() => {
    if (savedCameras.length === 0) {
      alert("エクスポートする保存済みビューがありません。");
      return;
    }
    // ... (exportKMLのロジックは元のファイルと同じ)
    const kmlPlacemarks = savedCameras
      .map((cam) => {
        const tilt = 90.0 + cam.pitch;
        const range =
          cam.height / Math.cos(Cesium.Math.toRadians(Math.abs(cam.pitch)));
        return `
      <Placemark>
        <name>${cam.name}</name>
        <LookAt>
          <longitude>${cam.lon}</longitude>
          <latitude>${cam.lat}</latitude>
          <altitude>${cam.height}</altitude>
          <heading>${cam.heading}</heading>
          <tilt>${tilt}</tilt>
          <range>${range}</range>
          <altitudeMode>absolute</altitudeMode>
        </LookAt>
      </Placemark>
    `;
      })
      .join("");
    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
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
      // ... (importKMLのロジックは元のファイルと同じ)
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
            const tilt = parseFloat(
              lookAt.querySelector("tilt")?.textContent || 0
            );
            const pitch = tilt - 90.0;
            return {
              id: Date.now() + index,
              name,
              lon: parseFloat(
                lookAt.querySelector("longitude")?.textContent || 0
              ),
              lat: parseFloat(
                lookAt.querySelector("latitude")?.textContent || 0
              ),
              height: parseFloat(
                lookAt.querySelector("altitude")?.textContent || 1000
              ),
              heading: parseFloat(
                lookAt.querySelector("heading")?.textContent || 0
              ),
              pitch,
              roll: 0,
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
        />
        <ControlPanel
          ref={fileInputRef}
          onSave={handleSaveCurrent}
          onImportClick={handleImportClick}
          onExport={exportKML}
          onFileChange={handleFileChange}
        />
      </div>

      <CesiumViewer ref={containerRef} />

      <SavedViewsPanel
        savedCameras={savedCameras}
        onRestore={restoreCamera}
        onDelete={handleDeleteSaved}
      />
    </div>
  );
}
