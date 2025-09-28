// src/constants.js
import * as Cesium from "cesium";

// .envファイルからCesium Ionのアクセストークンを読み込む
export const CESIUM_ION_ACCESS_TOKEN = import.meta.env
  .VITE_CESIUM_ION_ACCESS_TOKEN;
// OpenStreetMap 3D Buildings のアセットID
export const OSM_BUILDINGS_ASSET_ID = 2275207;

// カメラの初期位置（東京駅周辺）
export const INITIAL_CAMERA_POSITION = {
  lon: 137.865783,
  lat: 38.324098,
  height: 2500000,
  heading: 0,
  pitch: -90,
  roll: 0,
  fov: 60,
};

// カメラの移動アニメーション時間
export const CAMERA_FLY_DURATION = 1.0;
// キーボード操作によるカメラの移動速度
export const CAMERA_MOVE_SPEED = 1.0;
// キーボード操作によるカメラの垂直移動速度
export const CAMERA_VERTICAL_SPEED = 1.0;

// Cesiumの初期設定
export const setupCesium = () => {
  window.CESIUM_BASE_URL = "/Cesium/";
  if (CESIUM_ION_ACCESS_TOKEN) {
    Cesium.Ion.defaultAccessToken = CESIUM_ION_ACCESS_TOKEN;
  } else {
    console.error(
      "Cesium Ion Access Token is not set. Please set VITE_CESIUM_ION_ACCESS_TOKEN in your .env file."
    );
  }
};
