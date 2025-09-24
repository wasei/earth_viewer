// cesium_earth_viewer_react_fixed.jsx
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

// .envファイルからCesium Ionのアクセストークンを読み込む
const CESIUM_ION_ACCESS_TOKEN = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;
// OpenStreetMap 3D Buildings のアセットID
const OSM_BUILDINGS_ASSET_ID = 96188;

// カメラの初期位置（東京駅周辺）
const INITIAL_CAMERA_POSITION = {
  lon: 139.767052,
  lat: 35.681167,
  height: 1500,
  heading: 0,
  pitch: -45,
  roll: 0,
};

// カメラの移動アニメーション時間
const CAMERA_FLY_DURATION = 1.0;
// キーボード操作によるカメラの移動速度
const CAMERA_MOVE_SPEED = 50.0;
// キーボード操作によるカメラの垂直移動速度
const CAMERA_VERTICAL_SPEED = 50.0;

// CesiumのベースURLを設定
window.CESIUM_BASE_URL = "/Cesium/";
// Cesium Ionのデフォルトアクセストークンを設定
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
 * 角度を0-360の範囲に正規化する
 * @param {number} degrees - 角度
 * @returns {number} 正規化された角度
 */
const normalizeDegrees = (degrees) => ((degrees % 360) + 360) % 360;

// =================================================================
// カスタムフック
// =================================================================

/**
 * Cesium Viewerのインスタンスを生成・管理するカスタムフック
 * @param {React.RefObject<HTMLDivElement>} containerRef - ViewerをマウントするDOM要素のref
 * @returns {Cesium.Viewer | null} Viewerインスタンス
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
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          fullscreenButton: false,
          vrButton: false,
          // 常にレンダリングを続けるモードに設定
          requestRenderMode: false,
          maximumRenderTimeChange: Infinity,
        });

        mountedViewer.scene.globe.enableLighting = true;

        // デフォルトのカメラコントロールを無効化し、カスタムコントロールに置き換える
        const sscController = mountedViewer.scene.screenSpaceCameraController;
        sscController.enableRotate = false;
        sscController.enableTranslate = false;
        sscController.enableZoom = true;
        sscController.enableTilt = false;
        sscController.enableLook = false;

        // OpenStreetMapの3Dビルディングを追加
        const osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(
          OSM_BUILDINGS_ASSET_ID
        );
        mountedViewer.scene.primitives.add(osmBuildingsTileset);

        // カメラを初期位置へ移動
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
          duration: 1.5,
        });

        setViewer(mountedViewer);
      } catch (error) {
        console.error("Error initializing Cesium Viewer:", error);
      }
    };

    initializeViewer();

    // コンポーネントのアンマウント時にViewerを破棄する
    return () => {
      if (mountedViewer && !mountedViewer.isDestroyed()) {
        mountedViewer.destroy();
        setViewer(null);
      }
    };
    // 依存配列はcontainerRefのみ。viewerが更新されても再実行しない
  }, [containerRef]);

  return viewer;
};

/**
 * カメラ情報をリアルタイムで取得・更新するカスタムフック
 * @param {Cesium.Viewer | null} viewer - Viewerインスタンス
 * @returns {object} 現在のカメラ情報
 */
const useCameraInfo = (viewer) => {
  const [cameraInfo, setCameraInfo] = useState(INITIAL_CAMERA_POSITION);

  const updateCameraInfo = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;

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

    // カメラが変更されたタイミングで情報を更新する
    const cameraMoveHandler =
      viewer.camera.changed.addEventListener(updateCameraInfo);
    // 初回レンダリング時にも情報を更新
    updateCameraInfo();

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.changed.removeEventListener(cameraMoveHandler);
      }
    };
  }, [viewer, updateCameraInfo]);

  return cameraInfo;
};

/**
 * キーボードとマウスによるカメラ操作を実装するカスタムフック
 * @param {Cesium.Viewer | null} viewer - Viewerインスタンス
 */
const useCameraControls = (viewer) => {
  useEffect(() => {
    // viewerインスタンスが存在しない場合は何もしない
    if (!viewer || viewer.isDestroyed()) {
      return;
    }

    const canvas = viewer.canvas;
    const camera = viewer.camera;

    // canvasがフォーカスを受け取れるように設定
    canvas.setAttribute("tabIndex", "0");
    canvas.style.outline = "none";
    canvas.focus();

    // --- 状態管理用の変数 ---
    const keyStates = new Set();
    const flags = { looking: false };
    let currentMousePosition;
    let previousMousePosition;

    // --- イベントハンドラの定義 ---

    // マウス操作用のイベントハンドラ
    const handler = new Cesium.ScreenSpaceEventHandler(canvas);

    // マウス左ボタンダウン：視点操作開始
    handler.setInputAction((movement) => {
      flags.looking = true;
      // startMousePositionとcurrentMousePositionを初期化
      currentMousePosition = Cesium.Cartesian2.clone(movement.position);
      // previousMousePositionも現在の位置で初期化
      previousMousePosition = Cesium.Cartesian2.clone(movement.position);
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    // マウスムーブ：視点操作中のマウス位置を更新
    handler.setInputAction((movement) => {
      if (flags.looking) {
        // 現在のマウス位置を更新
        Cesium.Cartesian2.clone(movement.endPosition, currentMousePosition);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // マウス左ボタンアップ：視点操作終了
    handler.setInputAction(() => {
      flags.looking = false;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // キーボード押下時の処理
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e"].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
        keyStates.add(key);
      }
    };

    // キーボード解放時の処理
    const handleKeyUp = (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e"].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
        keyStates.delete(key);
      }
    };

    // --- 毎フレームの更新処理 ---
    const onTick = () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      // 1. マウスによる視点操作
      if (flags.looking && currentMousePosition && previousMousePosition) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const rotationSpeed = -1.0; // 回転が速すぎる場合はこの値を小さくする

        // マウスの移動量を計算
        const deltaX =
          (currentMousePosition.x - previousMousePosition.x) / width;
        const deltaY =
          (currentMousePosition.y - previousMousePosition.y) / height;

        // 上下の視点移動 (Pitch)
        if (deltaY !== 0) {
          camera.lookUp(-deltaY * rotationSpeed);
        }

        // 左右の視点移動 (Yaw)
        if (deltaX !== 0) {
          const worldUp = Cesium.Cartesian3.normalize(
            camera.positionWC,
            new Cesium.Cartesian3()
          );
          camera.look(worldUp, deltaX * rotationSpeed);
        }

        // 現在のマウス位置を次のフレームのために保存
        Cesium.Cartesian2.clone(currentMousePosition, previousMousePosition);
      }

      // 2. キーボードによるカメラ移動
      if (keyStates.size > 0) {
        const moveRate = CAMERA_MOVE_SPEED;
        const verticalRate = CAMERA_VERTICAL_SPEED;

        // ユーティリティ変数の準備
        const C3 = Cesium.Cartesian3;
        const localUp = C3.normalize(camera.positionWC, new C3());

        // 垂直移動 (Q/E)
        if (keyStates.has("q")) {
          camera.move(localUp, verticalRate);
        }
        if (keyStates.has("e")) {
          const localDown = C3.negate(localUp, new C3());
          camera.move(localDown, verticalRate);
        }

        // 左右移動 (A/D)
        if (keyStates.has("a")) {
          camera.moveLeft(moveRate);
        }
        if (keyStates.has("d")) {
          camera.moveRight(moveRate);
        }

        // 前後移動 (W/S) - 水平方向を維持
        const currentDirectionWC = camera.directionWC;
        const dotProduct = C3.dot(currentDirectionWC, localUp);
        const verticalComponent = C3.multiplyByScalar(
          localUp,
          dotProduct,
          new C3()
        );
        const horizontalDirection = C3.subtract(
          currentDirectionWC,
          verticalComponent,
          new C3()
        );
        C3.normalize(horizontalDirection, horizontalDirection);

        if (keyStates.has("w")) {
          camera.move(horizontalDirection, moveRate);
        }
        if (keyStates.has("s")) {
          const horizontalBackward = C3.negate(horizontalDirection, new C3());
          camera.move(horizontalBackward, moveRate);
        }
      }
    };

    // --- イベントリスナーの登録 ---
    canvas.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("keyup", handleKeyUp);
    // onTick関数をClockの更新イベントに登録し、解除用の関数を受け取る
    const removeTickListener = viewer.clock.onTick.addEventListener(onTick);

    // --- クリーンアップ処理 ---
    // このuseEffectが再実行されるか、コンポーネントがアンマウントされるときに実行される
    return () => {
      // 登録したイベントリスナーをすべて解除する
      canvas.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("keyup", handleKeyUp);

      // onTickイベントのリスナーを解除
      removeTickListener();

      // ScreenSpaceEventHandlerを破棄
      if (handler && !handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [viewer]); // viewerが変更されたときのみ、このeffectを再実行する
};

// =================================================================
// メインコンポーネント
// =================================================================

export default function CesiumEarthViewer() {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const viewer = useCesium(containerRef);
  const cameraInfo = useCameraInfo(viewer);
  useCameraControls(viewer);

  const [savedCameras, setSavedCameras] = useState([]);

  /**
   * 保存されたカメラ位置に移動する
   */
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

  /**
   * 現在のカメラビューを保存する
   */
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

  /**
   * 保存されたビューをKMLファイルとしてエクスポートする
   */
  const exportKML = useCallback(() => {
    if (savedCameras.length === 0) {
      alert("エクスポートする保存済みビューがありません。");
      return;
    }

    const kmlPlacemarks = savedCameras
      .map((cam) => {
        // Cesiumのpitch(水平が0°, 下向きが-)をKMLのtilt(垂直が0°, 水平が90°)に変換
        const tilt = 90.0 + cam.pitch;
        // rangeは視点から注視点までの距離。ここではheightを近似値として使用
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

  /**
   * KMLファイルをインポートしてビューを追加する
   */
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

            // KMLのtiltからCesiumのpitchに変換
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
              roll: 0, // KMLのLookAtにはrollに相当する概念がないため0に設定
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
      // 同じファイルを連続で選択できるように値をリセット
      e.target.value = "";
    },
    [importKML]
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleSavedRightClick = useCallback((e, cameraToDelete) => {
    e.preventDefault();
    if (window.confirm(`ビュー "${cameraToDelete.name}" を削除しますか？`)) {
      setSavedCameras((prev) =>
        prev.filter((cam) => cam.id !== cameraToDelete.id)
      );
    }
  }, []);

  // 表示用に数値を丸める
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
          <button onClick={handleSaveCurrent}>現在地を保存</button>
          <input
            type="file"
            accept=".kml"
            ref={fileInputRef}
            hidden
            onChange={handleFileChange}
          />
          <button type="button" onClick={handleImportClick}>
            KMLインポート
          </button>
          <button onClick={exportKML}>KMLエクスポート</button>
        </div>
      </div>

      <div ref={containerRef} id="cesiumContainer" />

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
