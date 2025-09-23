// cesium_earth_viewer_react.jsx
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import "./cesium-app.css";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

// =================================================================
// 定数とグローバル設定
// =================================================================

// Cesium Ionのアクセストークンを環境変数から読み込み
const CESIUM_ION_ACCESS_TOKEN = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;
// Cesium OSM BuildingsのIONアセットID
const OSM_BUILDINGS_ASSET_ID = 96188;
// カメラの初期位置 (東京駅周辺)
const INITIAL_CAMERA_POSITION = {
  lon: 139.767052,
  lat: 35.681167,
  height: 1500,
  heading: 0,
  pitch: -45,
  roll: 0,
};
// カメラ移動のアニメーション時間（秒）
const CAMERA_FLY_DURATION = 0.1;

// カメラ移動速度の設定（メートル/秒）
const CAMERA_MOVE_SPEED = 100.0;
const CAMERA_VERTICAL_SPEED = 50.0;

// Cesiumのグローバル設定
window.CESIUM_BASE_URL = "/Cesium/";
if (CESIUM_ION_ACCESS_TOKEN) {
  Cesium.Ion.defaultAccessToken = CESIUM_ION_ACCESS_TOKEN;
} else {
  console.error(
    "Cesium Ion Access Token is not set. Please set VITE_CESIUM_ION_ACCESS_TOKEN in your .env file."
  );
}

// =================================================================
// ヘルパー関数
// =================================================================

/**
 * 角度を 0-360 の範囲に正規化します。
 * @param {number} degrees - 正規化する角度
 * @returns {number} 0から360の間の角度
 */
const normalizeDegrees = (degrees) => ((degrees % 360) + 360) % 360;

// =================================================================
// カスタムフック
// =================================================================

/**
 * Cesium Viewerの初期化と破棄を管理するカスタムフック。
 * Viewerインスタンスをstateとして返し、初期化が完了するとコンポーネントを再レンダリングさせる。
 * @param {React.RefObject<HTMLDivElement>} containerRef - ViewerをマウントするDOM要素のref
 * @returns {Cesium.Viewer | null} 初期化されたViewerインスタンス、または初期化中はnull
 */
const useCesium = (containerRef) => {
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    if (!containerRef.current || viewer) {
      return;
    }

    let mountedViewer;

    const initializeViewer = async () => {
      try {
        const terrainProvider = await Cesium.createWorldTerrainAsync();

        mountedViewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider,
          timeline: false,
          animation: false,
          baseLayerPicker: false,
          geocoder: true,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          fullscreenButton: true,
          vrButton: false,
        });

        mountedViewer.scene.globe.enableLighting = true;

        const osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(
          OSM_BUILDINGS_ASSET_ID
        );
        // mountedViewer.scene.primitives.add(osmBuildingsTileset);

        mountedViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            INITIAL_CAMERA_POSITION.lon,
            INITIAL_CAMERA_POSITION.lat,
            INITIAL_CAMERA_POSITION.height
          ),
          orientation: {
            heading: Cesium.Math.toRadians(INITIAL_CAMERA_POSITION.heading),
            pitch: Cesium.Math.toRadians(INITIAL_CAMERA_POSITION.pitch),
            roll: Cesium.Math.toRadians(INITIAL_CAMERA_POSITION.roll),
          },
          duration: 1,
        });

        setViewer(mountedViewer);
      } catch (error) {
        console.error("Error initializing Cesium Viewer:", error);
      }
    };

    initializeViewer();

    return () => {
      if (mountedViewer && !mountedViewer.isDestroyed()) {
        mountedViewer.destroy();
      }
      setViewer(null);
    };
  }, [containerRef]);

  return viewer;
};

/**
 * カメラ情報の状態を管理し、定期的に更新するカスタムフック。
 * @param {Cesium.Viewer | null} viewer - Viewerインスタンス
 * @returns {object} 現在のカメラ情報
 */
const useCameraInfo = (viewer) => {
  const [cameraInfo, setCameraInfo] = useState(INITIAL_CAMERA_POSITION);

  const updateCameraInfo = useCallback(() => {
    if (!viewer) return;

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
      });
    }
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;

    const tickHandler = viewer.clock.onTick.addEventListener(updateCameraInfo);

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.clock.onTick.removeEventListener(tickHandler);
      }
    };
  }, [viewer, updateCameraInfo]);

  return cameraInfo;
};

/**
 * カメラのキーボード操作を管理するカスタムフック。
 * @param {Cesium.Viewer | null} viewer - Viewerインスタンス
 */
const useCameraControls = (viewer) => {
  useEffect(() => {
    if (!viewer) {
      return;
    }

    const container = viewer.container;
    container.setAttribute("tabIndex", "0");
    container.style.outline = "none";
    container.onclick = () => {
      container.focus();
    };

    const keyStates = new Set();
    const camera = viewer.camera;

    const sscController = viewer.scene.screenSpaceCameraController;
    sscController.enableRotate = true;
    sscController.enableTranslate = true;
    sscController.enableZoom = true;
    sscController.enableTilt = true;

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e"].includes(key)) {
        event.preventDefault();
        keyStates.add(key);
      }
    };

    const handleKeyUp = (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e"].includes(key)) {
        event.preventDefault();
        keyStates.delete(key);
      }
    };

    const handleCameraUpdate = () => {
      if (keyStates.size === 0) return;
      const deltaTime = 1.0;
      const moveRate = CAMERA_MOVE_SPEED * deltaTime;
      const verticalRate = CAMERA_VERTICAL_SPEED * deltaTime;

      // Cesiumのベクトル操作用ユーティリティを短縮
      const C3 = Cesium.Cartesian3;

      // 計算用のスクラッチ変数（パフォーマンス最適化のため）
      const scratchLocalUp = new C3();
      const scratchHorizontalDirection = new C3();
      const scratchDirectionWC = new C3();

      // -----------------------------------------------------------------------
      // 1. 絶対的な垂直方向への移動 (Q/E)
      // -----------------------------------------------------------------------
      const localUp = C3.normalize(camera.positionWC, scratchLocalUp);

      if (keyStates.has("q")) {
        // Q: 上昇 (真上方向へ移動)
        camera.move(localUp, verticalRate);
      }
      if (keyStates.has("e")) {
        // E: 下降 (真下方向へ移動)
        const localDown = C3.negate(localUp, new C3());
        camera.move(localDown, verticalRate);
      }

      // -----------------------------------------------------------------------
      // 2. 水平方向への平行移動 (A/D)
      // -----------------------------------------------------------------------
      const rightWC = camera.rightWC;

      if (keyStates.has("a")) {
        // A: 左移動 (rightWCの逆方向)
        const leftWC = C3.negate(rightWC, new C3());
        camera.move(leftWC, moveRate);
      }
      if (keyStates.has("d")) {
        // D: 右移動 (rightWC方向)
        camera.move(rightWC, moveRate);
      }

      // -----------------------------------------------------------------------
      // 3. 純粋な水平方向への前後移動 (W/S)
      // -----------------------------------------------------------------------
      const currentDirectionWC = C3.clone(
        camera.directionWC,
        scratchDirectionWC
      );

      // 3b. 視線ベクトルから垂直成分を抽出（ドット積を使用）
      const dotProduct = C3.dot(currentDirectionWC, localUp);
      const verticalComponent = C3.multiplyByScalar(
        localUp,
        dotProduct,
        new C3()
      );

      // 3c. 視線ベクトルから垂直成分を引いて、水平方向ベクトルを計算し、正規化する
      const horizontalDirection = C3.subtract(
        currentDirectionWC,
        verticalComponent,
        scratchHorizontalDirection
      );
      C3.normalize(horizontalDirection, horizontalDirection);

      if (keyStates.has("w")) {
        // W: 水平前進
        camera.move(horizontalDirection, moveRate);
      }
      if (keyStates.has("s")) {
        // S: 水平後退 (水平方向ベクトルの逆)
        const horizontalBackward = C3.negate(horizontalDirection, new C3());
        camera.move(horizontalBackward, moveRate);
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    container.addEventListener("keyup", handleKeyUp);
    const tickListener =
      viewer.clock.onTick.addEventListener(handleCameraUpdate);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      container.removeEventListener("keyup", handleKeyUp);
      if (viewer && !viewer.isDestroyed()) {
        viewer.clock.onTick.removeEventListener(tickListener);
      }
    };
  }, [viewer]); // viewerインスタンスが利用可能になったらエフェクトを実行
};

// =================================================================
// メインコンポーネント
// =================================================================

export default function CesiumEarthViewer() {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // useCesiumフックはviewerインスタンスをstateとして返す
  const viewer = useCesium(containerRef);
  // viewerインスタンスを直接他のフックに渡す
  const cameraInfo = useCameraInfo(viewer);
  useCameraControls(viewer);

  const [savedCameras, setSavedCameras] = useState([]);

  const restoreCamera = useCallback(
    (cameraObj) => {
      // viewerインスタンスが準備できていなければ何もしない
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
    [viewer] // viewerを依存配列に追加
  );

  // (省略) ... 他の関数は変更なし
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

    const kmlPlacemarks = savedCameras
      .map((cam) => {
        const tilt = Math.abs(cam.pitch - 90);
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
    a.click();
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
            const height = parseFloat(
              lookAt.querySelector("altitude")?.textContent || 1000
            );
            const heading = parseFloat(
              lookAt.querySelector("heading")?.textContent || 0
            );
            const tilt = parseFloat(
              lookAt.querySelector("tilt")?.textContent || 0
            );

            const pitch = tilt - 90;

            return {
              id: Date.now() + index,
              name,
              lon,
              lat,
              height,
              heading,
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

  const handleSavedRightClick = useCallback((e, cameraToDelete) => {
    e.preventDefault();
    if (window.confirm(`ビュー "${cameraToDelete.name}" を削除しますか？`)) {
      setSavedCameras((prev) =>
        prev.filter((cam) => cam.id !== cameraToDelete.id)
      );
    }
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
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

  const displayInfo = useMemo(
    () => ({
      ...cameraInfo,
      height: Math.round(cameraInfo.height),
      heading: Math.round(cameraInfo.heading),
      pitch: Math.round(cameraInfo.pitch),
    }),
    [cameraInfo]
  );

  return (
    <div className="cesium-app-root">
      <div className="topbar">
        <div>緯度: {displayInfo.lat.toFixed(6)}</div>
        <div>経度: {displayInfo.lon.toFixed(6)}</div>
        <div>高度: {displayInfo.height}m</div>
        <div>方位: {displayInfo.heading}°</div>
        <div>ピッチ: {displayInfo.pitch}°</div>

        <div className="controls">
          <button onClick={handleSaveCurrent}>保存</button>
          <input
            type="file"
            accept=".kml"
            ref={fileInputRef}
            hidden
            onChange={handleFileChange}
          />
          <button type="button" onClick={handleImportClick}>
            インポート
          </button>
          <button onClick={exportKML}>エクスポート</button>
        </div>
      </div>

      <div ref={containerRef} id="cesiumContainer" tabIndex={0} />

      <div className="saved-list">
        {savedCameras.length > 0 ? (
          savedCameras.map((s) => (
            <div
              key={s.id}
              className="saved-list-item"
              onClick={() => restoreCamera(s)}
              onContextMenu={(e) => handleSavedRightClick(e, s)}
              title="クリックで移動、右クリックで削除"
            >
              {s.name}
            </div>
          ))
        ) : (
          <div className="no-saved-views">保存されたビューはありません。</div>
        )}
      </div>
    </div>
  );
}
