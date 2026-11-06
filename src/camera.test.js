// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as Cesium from "cesium";
import { orbitBegin, orbitApply } from "./camera.js";

const { Camera, Cartesian3, Ellipsoid, GeographicProjection, Math: M } = Cesium;

function makeCamera() {
  const scene = {
    canvas: { clientWidth: 1200, clientHeight: 800 },
    drawingBufferWidth: 1200, drawingBufferHeight: 800,
    mapProjection: new GeographicProjection(Ellipsoid.WGS84),
    mode: Cesium.SceneMode.SCENE3D, ellipsoid: Ellipsoid.WGS84,
    frameState: { mode: Cesium.SceneMode.SCENE3D, mapProjection: new GeographicProjection() },
  };
  const cam = new Camera(scene);
  cam.setView({
    destination: Cartesian3.fromDegrees(139.7671, 35.6812, 200),
    orientation: { heading: 0.3, pitch: M.toRadians(-35), roll: 0 },
  });
  return cam;
}

describe("オービット", () => {
  it("何度回しても、注視点との距離が変わらず、ロールも出ない", () => {
    const cam = makeCamera();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    for (let g = 0; g < 20; g++) {
      const pivot = Cartesian3.fromDegrees(139.7671 + rnd() * 0.001, 35.6812 + rnd() * 0.001, 20);
      const s = orbitBegin(cam, pivot);
      const r0 = Cartesian3.distance(cam.positionWC, pivot);
      for (let i = 0; i < 50; i++) {
        s.az += rnd() * 0.08;
        s.el = Math.min(M.toRadians(89), Math.max(M.toRadians(-5), s.el + rnd() * 0.08));
        orbitApply(cam, s);
        expect(Cartesian3.distance(cam.positionWC, pivot)).toBeCloseTo(r0, 4);
      }
      // カメラは注視点を向いている
      const toPivot = Cartesian3.normalize(Cartesian3.subtract(pivot, cam.positionWC, new Cartesian3()), new Cartesian3());
      expect(M.toDegrees(Math.acos(Math.min(1, Cartesian3.dot(toPivot, cam.directionWC))))).toBeLessThan(0.05);
      const roll = ((M.toDegrees(cam.roll) + 540) % 360) - 180;
      expect(Math.abs(roll)).toBeLessThan(0.01);
    }
  });
});
