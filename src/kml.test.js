import { describe, it, expect } from "vitest";
import { viewsToKml, kmlToViews } from "./kml.js";

const mk = (name, c) => ({
  id: name, name, note: "", createdAt: 0,
  camera: { roll: 0, fov: 60, groundHeightEllipsoid: 40, ...c },
});
const views = [
  mk("9階 南向き", { lon: 139.7671, lat: 35.6812, heightEllipsoid: 96.5, heading: 180, pitch: -5 }),
  mk("A&B <test>", { lon: 135.5, lat: 34.7, heightEllipsoid: 250, heading: 12.345, pitch: -35.5 }),
  mk("真下", { lon: -122.4, lat: 37.8, heightEllipsoid: 1200, heading: 359.9, pitch: -90 }),
];

describe("KML 往復", () => {
  it("absolute: 保存→書き出し→読込で値が戻る", () => {
    const { views: out } = kmlToViews(viewsToKml(views));
    expect(out).toHaveLength(3);
    out.forEach((o, i) => {
      const a = views[i].camera, b = o.camera;
      expect(o.name).toBe(views[i].name);
      for (const k of ["lon", "lat", "heightEllipsoid", "heading", "pitch", "fov"]) {
        expect(b[k]).toBeCloseTo(a[k], 6);
      }
    });
  });
  it("altitudeMode は標準要素で出力する", () => {
    const kml = viewsToKml(views);
    expect(kml).toContain("<altitudeMode>absolute</altitudeMode>");
    expect(kml).not.toContain("gx:altitudeMode");
  });
  it("relativeToGround: 地上高で出し、読込で pendingAgl になる", () => {
    const { views: out } = kmlToViews(viewsToKml(views, { altitudeMode: "relativeToGround" }));
    expect(out[0].camera.pendingAgl).toBeCloseTo(96.5 - 40, 6);
    expect(out[0].camera.heightEllipsoid).toBeNull();
  });
  it("高さの意味を説明するdescriptionが付く", () => {
    const kml = viewsToKml(views);
    expect(kml).toContain("<description>地上高 約57m / 画角 60°</description>");
    expect(kml).not.toContain("視点の高度");
    expect(kml).not.toContain("ツアーを再生");
  });
  it("画角はツアーの FlyTo 内 LookAt(gx:horizFov)に出し、読込では重複しない", () => {
    const kml = viewsToKml(views);
    expect(kml.match(/<gx:FlyTo>/g)).toHaveLength(3);
    expect(kml).not.toContain("<gx:duration>1</gx:duration>"); // アニメーション指定は出さない
    expect(kml.match(/<LookAt>\s*<gx:horizFov>60<\/gx:horizFov>/g)).toHaveLength(3);
    expect(kmlToViews(kml).views).toHaveLength(3);
  });
  it("ツアーの LookAt からカメラ位置・向きが戻る（range 100m）", () => {
    const { views: out } = kmlToViews(viewsToKml(views).replace(/<Placemark>[\s\S]*?<\/Placemark>/g, ""));
    expect(out).toHaveLength(3);
    out.forEach((o, i) => {
      expect(o.camera.lat).toBeCloseTo(views[i].camera.lat, 4);
      expect(o.camera.lon).toBeCloseTo(views[i].camera.lon, 4);
      expect(o.camera.pitch).toBeCloseTo(views[i].camera.pitch, 4);
    });
  });
  it("LookAt を読める", () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>L</name>
      <LookAt><longitude>139.7</longitude><latitude>35.6</latitude><altitude>0</altitude>
      <heading>0</heading><tilt>45</tilt><range>100</range><altitudeMode>absolute</altitudeMode></LookAt></Placemark></kml>`;
    const { views: out } = kmlToViews(kml);
    expect(out[0].camera.pitch).toBeCloseTo(-45, 6);
    expect(out[0].camera.lat).toBeLessThan(35.6); // 北向きの注視点なので、カメラは南側
  });
});
