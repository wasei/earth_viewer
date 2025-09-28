// src/hooks/useCameraControls.js
import { useEffect } from "react";
import * as Cesium from "cesium";

/**
 * キーボードとマウスによるカメラ操作を実装するカスタムフック
 * @param {Cesium.Viewer | null} viewer - Viewerインスタンス
 * @param {number} cameraSpeed - カメラの移動速度
 * @param {boolean} enabled - このフックによるカメラ制御を有効にするか
 */
export const useCameraControls = (viewer, cameraSpeed, enabled) => {
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) {
      return;
    }

    const scene = viewer.scene;
    const screenSpaceCameraController = scene.screenSpaceCameraController;

    // ★変更: enabledフラグに応じて処理を分岐
    if (enabled) {
      // --- フリーカメラモード ---
      // 1. Cesiumのデフォルトのカメラコントローラーを無効化
      screenSpaceCameraController.enableRotate = false;
      screenSpaceCameraController.enableTranslate = false;
      screenSpaceCameraController.enableZoom = false;
      screenSpaceCameraController.enableTilt = false;
      screenSpaceCameraController.enableLook = false;

      // 2. カスタムのイベントハンドラを登録
      const canvas = viewer.canvas;
      const camera = viewer.camera;

      canvas.setAttribute("tabIndex", "0");
      canvas.style.outline = "none";
      canvas.focus();

      const keyStates = new Set();
      const flags = { looking: false };
      let currentMousePosition;
      let previousMousePosition;

      const handler = new Cesium.ScreenSpaceEventHandler(canvas);

      handler.setInputAction((movement) => {
        flags.looking = true;
        currentMousePosition = Cesium.Cartesian2.clone(movement.position);
        previousMousePosition = Cesium.Cartesian2.clone(movement.position);
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

      handler.setInputAction((movement) => {
        if (flags.looking) {
          Cesium.Cartesian2.clone(movement.endPosition, currentMousePosition);
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction(() => {
        flags.looking = false;
      }, Cesium.ScreenSpaceEventType.LEFT_UP);

      const handleKeyDown = (event) => {
        const key = event.key.toLowerCase();
        if (["w", "a", "s", "d", "q", "e"].includes(key)) {
          event.preventDefault();
          event.stopPropagation();
          keyStates.add(key);
        }
      };

      const handleKeyUp = (event) => {
        const key = event.key.toLowerCase();
        if (["w", "a", "s", "d", "q", "e"].includes(key)) {
          event.preventDefault();
          event.stopPropagation();
          keyStates.delete(key);
        }
      };

      const handleMouseEnter = () => {
        canvas.focus();
      };

      const onTick = () => {
        if (!viewer || viewer.isDestroyed()) {
          return;
        }
        if (flags.looking && currentMousePosition && previousMousePosition) {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          const rotationSpeed = -1.0;
          const deltaX =
            (currentMousePosition.x - previousMousePosition.x) / width;
          const deltaY =
            (currentMousePosition.y - previousMousePosition.y) / height;
          if (deltaY !== 0) camera.lookUp(-deltaY * rotationSpeed);
          if (deltaX !== 0) {
            const worldUp = Cesium.Cartesian3.normalize(
              camera.positionWC,
              new Cesium.Cartesian3()
            );
            camera.look(worldUp, deltaX * rotationSpeed);
          }
          Cesium.Cartesian2.clone(currentMousePosition, previousMousePosition);
        }
        if (keyStates.size > 0) {
          const moveRate = cameraSpeed;
          const verticalRate = cameraSpeed;
          const C3 = Cesium.Cartesian3;
          const localUp = C3.normalize(camera.positionWC, new C3());
          if (keyStates.has("q")) camera.move(localUp, verticalRate);
          if (keyStates.has("e"))
            camera.move(C3.negate(localUp, new C3()), verticalRate);
          if (keyStates.has("a")) camera.moveLeft(moveRate);
          if (keyStates.has("d")) camera.moveRight(moveRate);
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
          if (keyStates.has("w")) camera.move(horizontalDirection, moveRate);
          if (keyStates.has("s"))
            camera.move(C3.negate(horizontalDirection, new C3()), moveRate);
        }
      };

      canvas.addEventListener("keydown", handleKeyDown);
      canvas.addEventListener("keyup", handleKeyUp);
      canvas.addEventListener("mouseenter", handleMouseEnter);
      const removeTickListener = viewer.clock.onTick.addEventListener(onTick);

      // クリーンアップ関数: イベントリスナを削除し、デフォルト設定に戻す
      return () => {
        canvas.removeEventListener("keydown", handleKeyDown);
        canvas.removeEventListener("keyup", handleKeyUp);
        canvas.removeEventListener("mouseenter", handleMouseEnter);
        removeTickListener();
        if (handler && !handler.isDestroyed()) {
          handler.destroy();
        }

        if (!viewer.isDestroyed()) {
          screenSpaceCameraController.enableRotate = true;
          screenSpaceCameraController.enableTranslate = true;
          screenSpaceCameraController.enableZoom = true;
          screenSpaceCameraController.enableTilt = true;
          screenSpaceCameraController.enableLook = true;
        }
      };
    } else {
      // --- オービットモード ---
      // Cesiumのデフォルトのカメラコントローラーを有効化
      screenSpaceCameraController.enableRotate = true;
      screenSpaceCameraController.enableTranslate = true;
      screenSpaceCameraController.enableZoom = true;
      screenSpaceCameraController.enableTilt = true;
      screenSpaceCameraController.enableLook = true;
    }
  }, [viewer, cameraSpeed, enabled]); // enabledを依存配列に追加
};
