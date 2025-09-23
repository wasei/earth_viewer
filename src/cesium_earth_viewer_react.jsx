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

// カメラ移動速度の設定（メートル/秒）
const CAMERA_MOVE_SPEED = 100.0;
const CAMERA_ROTATE_SPEED = 0.5;
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
 * Cesium Viewerの初期化と破棄を管理するカスタムフック
 * @param {React.RefObject<HTMLDivElement>} containerRef - ViewerをマウントするDOM要素のref
 * @returns {React.MutableRefObject<Cesium.Viewer | null>} Viewerインスタンスを保持するref
 */
const useCesium = (containerRef) => {
  const viewerRef = useRef(null);

  useEffect(() => {
    console.log("useCesium useEffect started"); // Log: useEffect開始
    if (!containerRef.current) {
      console.log("containerRef is not yet available."); // Log: コンテナrefがまだない
      return;
    }

    // スコープ外で変数を宣言
    let viewer;
    const keyStates = new Set();
    let tickHandler;

    // キーボードイベントハンドラ
    const handleKeyDown = (event) => {
      if (["w", "a", "s", "d", "q", "e"].includes(event.key.toLowerCase())) {
        keyStates.add(event.key.toLowerCase());
        event.preventDefault();
      }
    };

    const handleKeyUp = (event) => {
      if (["w", "a", "s", "d", "q", "e"].includes(event.key.toLowerCase())) {
        keyStates.delete(event.key.toLowerCase());
        event.preventDefault();
      }
    };

    // キーボードイベントのリスナーを追加
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    const initializeViewer = async () => {
      try {
        console.log("Initializing Cesium Viewer..."); // Log: Viewer初期化開始
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

        console.log("Cesium Viewer initialized successfully.", viewer); // Log: Viewer初期化成功

        // =================================================================
        // カメラ制御の設定とキーボード操作の実装
        // =================================================================
        const sscController = viewer.scene.screenSpaceCameraController;
        sscController.enableRotate = true; // マウス左ドラッグでの視点回転は有効
        sscController.enableTranslate = false; // マウス中/右ドラッグでの並行移動は無効
        sscController.enableZoom = false; // マウスホイールでのズームは無効
        sscController.enableTilt = false; // マウス中/右ドラッグ+Ctrlでのチルトは無効

        // カメラの初期設定
        viewer.scene.globe.enableLighting = true;
        viewer.camera.setView({
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
        });

        // キーボードイベントハンドラ
        const handleKeyDown = (event) => {
          if (
            ["w", "a", "s", "d", "q", "e"].includes(event.key.toLowerCase())
          ) {
            keyStates.add(event.key.toLowerCase());
            event.preventDefault();
          }
        };

        const handleKeyUp = (event) => {
          if (
            ["w", "a", "s", "d", "q", "e"].includes(event.key.toLowerCase())
          ) {
            keyStates.delete(event.key.toLowerCase());
            event.preventDefault();
          }
        };

        // キーボードイベントのリスナーを追加
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("keyup", handleKeyUp);

        // カメラ移動を制御する関数
        const handleCameraUpdate = () => {
          const camera = viewer.camera;
          const deltaTime = 1.0 / 60.0; // 60FPSを想定

          // カメラの現在位置をCartographicに変換（緯度、経度、高度）
          const cartographic = Cesium.Cartographic.fromCartesian(
            camera.position
          );

          // 移動量を計算（メートル単位）
          const moveRate = CAMERA_MOVE_SPEED * deltaTime;
          const verticalRate = CAMERA_VERTICAL_SPEED * deltaTime;

          // カメラの位置を更新する前の安全性チェック
          if (!Cesium.defined(cartographic)) {
            console.warn("Invalid camera position");
            return;
          }

          // 現在の緯度、経度、高度を取得
          let latitude = Cesium.Math.toDegrees(cartographic.latitude);
          let longitude = Cesium.Math.toDegrees(cartographic.longitude);
          let height = cartographic.height;

          // WASDキーによる移動
          // WASDキーによる移動（北を基準とした絶対方向）
          if (keyStates.has("w")) {
            // 北に移動（緯度を増加）
            latitude -= moveRate / 111000.0; // 1度あたり約111km
          }
          if (keyStates.has("s")) {
            // 南に移動（緯度を減少）
            latitude += moveRate / 111000.0;
          }
          if (keyStates.has("d")) {
            // 東に移動（経度を増加）
            longitude -=
              moveRate / (111000.0 * Math.cos(Cesium.Math.toRadians(latitude)));
          }
          if (keyStates.has("a")) {
            // 西に移動（経度を減少）
            longitude +=
              moveRate / (111000.0 * Math.cos(Cesium.Math.toRadians(latitude)));
          }

          // QEキーによる上昇・下降
          if (keyStates.has("q")) {
            height += verticalRate;
          }
          if (keyStates.has("e")) {
            height -= verticalRate;
          }

          // 新しい位置を設定
          const newPosition = Cesium.Cartesian3.fromDegrees(
            longitude,
            latitude,
            height
          );
          camera.position = newPosition;

          // カメラの向きを計算（デフォルトは下向き）
          const diff = Cesium.Cartesian3.subtract(
            camera.position,
            camera.positionWC,
            new Cesium.Cartesian3()
          );

          // 位置の差分が十分にある場合のみ正規化を行う
          if (Cesium.Cartesian3.magnitude(diff) > 1e-10) {
            camera.direction = Cesium.Cartesian3.normalize(
              diff,
              new Cesium.Cartesian3()
            );
          } else {
            // デフォルトの向き（下向き）を設定
            camera.direction = new Cesium.Cartesian3(0, 0, -1);
          }
        };

        // カメラ更新のイベントリスナーを追加
        tickHandler = viewer.clock.onTick.addEventListener(handleCameraUpdate);

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
        tickHandler = viewer.clock.onTick.addEventListener(handleCameraUpdate);
      } catch (error) {
        console.error("Error initializing Cesium Viewer:", error); // Log: Viewer初期化エラー
      }
    };

    initializeViewer();

    const currentViewer = viewerRef.current;
    // コンポーネントのアンマウント時に実行されるクリーンアップ関数
    return () => {
      console.log("Cleaning up useCesium effect."); // Log: クリーンアップ開始
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      if (viewer && !viewer.isDestroyed()) {
        if (tickHandler) {
          viewer.clock.onTick.removeEventListener(tickHandler);
        }
        viewer.destroy();
        console.log("Cesium Viewer destroyed."); // Log: Viewer破棄
      }
      if (currentViewer) {
        // クリーンアップ
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
  const [cameraInfo, setCameraInfo] = useState(INITIAL_CAMERA_POSITION);

  const updateCameraInfo = useCallback(() => {
    if (!viewerRef.current) return;
    const camera = viewerRef.current.camera;
    const cartographic = Cesium.Cartographic.fromCartesian(camera.position);

    if (cartographic) {
      const newInfo = {
        lon: Cesium.Math.toDegrees(cartographic.longitude),
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        height: cartographic.height,
        heading: normalizeDegrees(Cesium.Math.toDegrees(camera.heading)),
        pitch: Cesium.Math.toDegrees(camera.pitch),
        roll: normalizeDegrees(Cesium.Math.toDegrees(camera.roll)),
      };
      setCameraInfo(newInfo);
      console.log("Camera info updated:", newInfo); // Log: カメラ情報更新
    }
  }, [viewerRef]);

  useEffect(() => {
    if (!viewerRef.current) return;

    // レンダリングループの各フレームでカメラ情報を更新
    const tickHandler =
      viewerRef.current.clock.onTick.addEventListener(updateCameraInfo);

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.clock.onTick.removeEventListener(tickHandler);
      }
    };
  }, [viewerRef, updateCameraInfo]);

  return cameraInfo;
};

/**
 * カメラのキーボード操作を管理するカスタムフック
 * @param {React.MutableRefObject<Cesium.Viewer | null>} viewerRef - Viewerインスタンスのref
 */
const useCameraControls = (viewerRef) => {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const keyStates = new Set();

    const handleKeyDown = (event) => {
      keyStates.add(event.key.toLowerCase());
      if (["w", "a", "s", "d", "q", "e"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };

    const handleKeyUp = (event) => {
      keyStates.delete(event.key.toLowerCase());
      if (["w", "a", "s", "d", "q", "e"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };

    const handleCameraUpdate = () => {
      if (!viewer || viewer.isDestroyed()) return;

      const camera = viewer.camera;
      if (!camera) return;

      const deltaTime = 1.0 / 60.0; // 60FPSを想定
      const moveRate = CAMERA_MOVE_SPEED * deltaTime;
      const heightRate = CAMERA_VERTICAL_SPEED * deltaTime;

      try {
        // 現在のカメラ位置を取得
        const cartesian = camera.position;
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        if (!cartographic) return;

        // 現在の座標を取得
        let latitude = Cesium.Math.toDegrees(cartographic.latitude);
        let longitude = Cesium.Math.toDegrees(cartographic.longitude);
        let height = cartographic.height;

        // 移動計算
        let hasMovement = false;

        if (keyStates.has("w")) {
          latitude += moveRate / 111111.0; // 北へ
          hasMovement = true;
        }
        if (keyStates.has("s")) {
          latitude -= moveRate / 111111.0; // 南へ
          hasMovement = true;
        }
        if (keyStates.has("d")) {
          const metersPerDegree =
            111111.0 * Math.cos(Cesium.Math.toRadians(latitude));
          longitude += moveRate / metersPerDegree; // 東へ
          hasMovement = true;
        }
        if (keyStates.has("a")) {
          const metersPerDegree =
            111111.0 * Math.cos(Cesium.Math.toRadians(latitude));
          longitude -= moveRate / metersPerDegree; // 西へ
          hasMovement = true;
        }
        if (keyStates.has("q")) {
          height = Math.min(10000, height + heightRate); // 上昇（最高10000m）
          hasMovement = true;
        }
        if (keyStates.has("e")) {
          height = Math.max(100, height - heightRate); // 下降（最低100m）
          hasMovement = true;
        }

        // 移動がある場合のみカメラを更新
        if (hasMovement) {
          camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
              longitude,
              latitude,
              height
            ),
            orientation: {
              heading: camera.heading,
              pitch: camera.pitch,
              roll: camera.roll,
            },
          });
        }
      } catch (error) {
        console.warn("Camera update error:", error);
      }
    };

    // イベントリスナーを追加
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    const tickListener =
      viewer.clock.onTick.addEventListener(handleCameraUpdate);

    // クリーンアップ関数を返す
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      if (viewer && !viewer.isDestroyed()) {
        viewer.clock.onTick.removeEventListener(tickListener);
      }
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
