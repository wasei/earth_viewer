// src/utils/cesiumHelpers.js

/**
 * 角度を0-360の範囲に正規化する
 * @param {number} degrees - 角度
 * @returns {number} 正規化された角度
 */
export const normalizeDegrees = (degrees) => ((degrees % 360) + 360) % 360;
