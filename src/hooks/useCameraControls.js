// src/hooks/useCameraControls.js
import { useEffect } from "react";
import * as Cesium from "cesium";
import { CAMERA_MOVE_SPEED, CAMERA_VERTICAL_SPEED } from "../constants";

/**
 * キーボードとマウスによるカメラ操作を実装するカスタムフック
 * @param {Cesium.Viewer | null} viewer - Viewerインスタンス
 */
export const useCameraControls = (viewer) => {
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) {
      return;
    }

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

    const onTick = () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }
      // ... (onTick内のロジックは元のファイルと同じ)
      // 1. マウスによる視点操作
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
      // 2. キーボードによるカメラ移動
      if (keyStates.size > 0) {
        const moveRate = CAMERA_MOVE_SPEED;
        const verticalRate = CAMERA_VERTICAL_SPEED;
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
    const removeTickListener = viewer.clock.onTick.addEventListener(onTick);

    return () => {
      canvas.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("keyup", handleKeyUp);
      removeTickListener();
      if (handler && !handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [viewer]);
};
