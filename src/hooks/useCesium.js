// src/hooks/useCesium.js
import { useState, useEffect } from "react";
import * as Cesium from "cesium";
import { INITIAL_CAMERA_POSITION, OSM_BUILDINGS_ASSET_ID } from "../constants";

/**
 * Cesium Viewerのインスタンスを生成・管理するカスタムフック
 * @param {React.RefObject<HTMLDivElement>} containerRef - ViewerをマウントするDOM要素のref
 * @returns {Cesium.Viewer | null} Viewerインスタンス
 */
export const useCesium = (containerRef) => {
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
          fullscreenButton: false,
          vrButton: false,
        });

        mountedViewer.scene.globe.enableLighting = true; // ライティングは有効のまま
        mountedViewer.clock.shouldAnimate = false; // クロックの進行を停止
        mountedViewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
          "2025-08-01T03:00:00Z"
        );

        const sscController = mountedViewer.scene.screenSpaceCameraController;
        sscController.enableRotate = false;
        sscController.enableTranslate = false;
        sscController.enableZoom = true;
        sscController.enableTilt = false;
        sscController.enableLook = false;

        const osmBuildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(
          OSM_BUILDINGS_ASSET_ID
        );
        mountedViewer.scene.primitives.add(osmBuildingsTileset);

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

        mountedViewer.camera.frustum.fov = Cesium.Math.toRadians(
          INITIAL_CAMERA_POSITION.fov
        );

        setViewer(mountedViewer);
      } catch (error) {
        console.error("Error initializing Cesium Viewer:", error);
      }
    };

    initializeViewer();

    return () => {
      if (mountedViewer && !mountedViewer.isDestroyed()) {
        mountedViewer.destroy();
        setViewer(null);
      }
    };
  }, [containerRef]);

  return viewer;
};
