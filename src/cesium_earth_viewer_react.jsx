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
// カメラ情報更新のスロットリング間隔 (ミリ秒)
const CAMERA_UPDATE_THROTTLE = 100;
// カメラ移動のアニメーション時間（秒）
const CAMERA_FLY_DURATION = 1.5;

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
 * Cesium Viewerの初期化と破棄を管理するカスタムフック
 * @param {React.RefObject<HTMLDivElement>} containerRef - ViewerをマウントするDOM要素のref
 * @returns {React.MutableRefObject<Cesium.Viewer | null>} Viewerインスタンスを保持するref
 */
const useCesium = (containerRef) => {
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let viewer; // クリーンアップ関数で参照できるよう、スコープの外で宣言

    const initializeViewer = async () => {
      try {
        // Cesium World Terrain (地形データ) を非同期で生成
        const terrainProvider = await Cesium.createWorldTerrainAsync();

        // Viewerインスタンスを生成
        viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider: terrainProvider,
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

        // =================================================================
        // ★修正: デフォルトのカメラ操作を無効化し、指定の操作に限定
        // =================================================================
        const sscController = viewer.scene.screenSpaceCameraController;
        sscController.enableRotate = true; // マウス左ドラッグでの視点回転は有効
        sscController.enableTranslate = false; // マウス中/右ドラッグでの並行移動は無効
        sscController.enableZoom = false; // マウスホイールでのズームは無効
        sscController.enableTilt = false; // マウス中/右ドラッグ+Ctrlでのチルトは無効

        // Cesium OSM Buildings (3D建物データ) を非同期で取得し、シーンに追加
        const osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(
          OSM_BUILDINGS_ASSET_ID
        );
        viewer.scene.primitives.add(osmBuildingsTileset);

        // ライティングを有効化して建物を立体的に見せる
        viewer.scene.globe.enableLighting = true;

        // 初期視点へカメラを移動
        viewer.camera.flyTo({
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
          duration: 3,
        });

        viewerRef.current = viewer;
      } catch (error) {
        console.error("Cesium Viewerの初期化に失敗しました。", error);
      }
    };

    initializeViewer();

    // コンポーネントのアンマウント時に実行されるクリーンアップ関数
    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, [containerRef]); // containerRefの変更時のみ再実行

  return viewerRef;
};

/**
 * カメラ情報の状態を管理し、定期的に更新するカスタムフック
 * @param {React.MutableRefObject<Cesium.Viewer | null>} viewerRef - Viewerインスタンスのref
 * @returns {object} 現在のカメラ情報
 */
const useCameraInfo = (viewerRef) => {
  const [cameraInfo, setCameraInfo] = useState({
    lat: INITIAL_CAMERA_POSITION.lat,
    lon: INITIAL_CAMERA_POSITION.lon,
    height: INITIAL_CAMERA_POSITION.height,
    heading: INITIAL_CAMERA_POSITION.heading,
    pitch: INITIAL_CAMERA_POSITION.pitch,
    roll: INITIAL_CAMERA_POSITION.roll,
  });
  const lastUpdateTime = useRef(0);

  const updateCameraInfo = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // パフォーマンス向上のため、指定した間隔で処理を間引く (スロットリング)
    const now = Date.now();
    if (now - lastUpdateTime.current < CAMERA_UPDATE_THROTTLE) return;
    lastUpdateTime.current = now;

    const cam = viewer.camera;
    const carto = Cesium.Cartographic.fromCartesian(cam.position);
    const newInfo = {
      lat: +Cesium.Math.toDegrees(carto.latitude).toFixed(6),
      lon: +Cesium.Math.toDegrees(carto.longitude).toFixed(6),
      height: +carto.height.toFixed(2),
      heading: +normalizeDegrees(Cesium.Math.toDegrees(cam.heading)).toFixed(2),
      pitch: +Cesium.Math.toDegrees(cam.pitch).toFixed(2),
      roll: +Cesium.Math.toDegrees(cam.roll).toFixed(2),
    };

    // =================================================================
    // ★修正: 厳密すぎた比較を廃止し、常に新しい情報でステートを更新
    // =================================================================
    setCameraInfo(newInfo);
  }, [viewerRef]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // レンダリングループの各フレームでカメラ情報を更新
    const tickHandler = viewer.clock.onTick.addEventListener(updateCameraInfo);

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.clock.onTick.removeEventListener(tickHandler);
      }
    };
  }, [viewerRef, updateCameraInfo]);

  return cameraInfo;
};

/**
 * カメラのキーボード操作を管理するカスタムフック
 * @param {React.MutableRefObject<Cesium.Viewer | null>} viewerRef - Viewerインスタンスのref
 */
// =================================================================
// ★修正: 移動速度UIが不要になったため、フックを簡略化
// =================================================================
const useCameraControls = (viewerRef) => {
  const moveSpeed = 50; // 移動速度を50mに固定

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // キーボード操作のハンドラ
    const keyDownHandler = (e) => {
      const cam = viewer.camera;

      const keyMap = {
        w: () => cam.moveForward(moveSpeed),
        s: () => cam.moveBackward(moveSpeed),
        a: () => cam.moveLeft(moveSpeed),
        d: () => cam.moveRight(moveSpeed),
        q: () => cam.moveUp(moveSpeed), // 上昇
        e: () => cam.moveDown(moveSpeed), // 下降
      };

      let key = e.key.toLowerCase();
      if (e.key === "ArrowUp") key = "w";
      if (e.key === "ArrowDown") key = "s";
      if (e.key === "ArrowLeft") key = "a";
      if (e.key === "ArrowRight") key = "d";

      if (keyMap[key]) {
        e.preventDefault(); // デフォルトのブラウザ動作をキャンセル
        keyMap[key]();
      }
    };

    window.addEventListener("keydown", keyDownHandler);

    return () => {
      window.removeEventListener("keydown", keyDownHandler);
    };
  }, [viewerRef]); // Viewerが変更された場合にのみ再設定
};

// =================================================================
// メインコンポーネント
// =================================================================

export default function CesiumEarthViewer() {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // カスタムフックを使用してCesiumの各機能を管理
  const viewerRef = useCesium(containerRef);
  const cameraInfo = useCameraInfo(viewerRef);
  // ★修正: useCameraControlsはUIを返さなくなったので、呼び出しのみ
  useCameraControls(viewerRef);

  // 保存されたカメラ位置の状態
  const [savedCameras, setSavedCameras] = useState([]);

  // =================================================================
  // ★修正: useCallbackを削除し、常に最新のviewerRefを参照できるようにする
  // =================================================================
  const restoreCamera = (cameraObj) => {
    const viewer = viewerRef.current;
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
  };

  const handleSaveCurrent = useCallback(() => {
    const name = prompt(
      "このビューの名前を入力してください:",
      `ビュー ${savedCameras.length + 1}`
    );
    if (name) {
      const newCamera = {
        id: Date.now(),
        name,
        ...cameraInfo,
      };
      setSavedCameras((prev) => [...prev, newCamera]);
    }
  }, [cameraInfo, savedCameras.length]);

  const exportKML = useCallback(() => {
    if (savedCameras.length === 0) {
      alert("エクスポートする保存済みビューがありません。");
      return;
    }

    const kmlPlacemarks = savedCameras
      .map((cam) => {
        // Cesiumのpitch(-90 to 90)をKMLのtilt(0 to 90)に変換
        const tilt = Math.abs(cam.pitch - 90);
        // heightからrangeを概算
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

            // KMLのtilt(0 to 90)をCesiumのpitch(-90 to 0)に変換
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
          .filter(Boolean); // nullを除外

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

  // ファイル選択ダイアログを開くハンドラ
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ファイルが選択されたときのハンドラ
  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) {
        importKML(file);
      }
      // 同じファイルを連続で選択できるように値をリセット
      e.target.value = "";
    },
    [importKML]
  );

  // 表示用のカメラ情報をメモ化
  const displayInfo = useMemo(
    () => ({
      ...cameraInfo,
      height: Math.round(cameraInfo.height),
    }),
    [cameraInfo]
  );

  return (
    <div className="cesium-app-root">
      <div className="topbar">
        {/* カメラ情報の表示 */}
        <div>緯度: {displayInfo.lat}</div>
        <div>経度: {displayInfo.lon}</div>
        <div>高度: {displayInfo.height}m</div>
        <div>方位: {displayInfo.heading}°</div>
        <div>ピッチ: {displayInfo.pitch}°</div>

        {/* 操作パネル */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          {/* ★修正: 移動速度のUIを削除 */}
          <button onClick={handleSaveCurrent}>保存</button>
          <input
            type="file"
            accept=".kml,.kmz"
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

      {/* Cesiumビューアーのコンテナ */}
      <div ref={containerRef} id="cesiumContainer" />

      {/* 保存済み視点リスト */}
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
