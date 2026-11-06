// KMLの入出力。Cesium・DOM(書き出し側)に依存しない純粋な変換のみ。
// 正本は楕円体高。KMLの海抜(absolute)へはEGM96で変換する。
import * as egm96 from "egm96-universal";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const norm = (d) => ((d % 360) + 360) % 360;
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now();

/** ツアー用の視点。pitch<=0 なら LookAt（Earth Proの書き出しと同じ形）、上向きは Camera */
function flyToXml(c, alt, mode) {
  const rangeM = 100;
  if (c.pitch > 0) {
    return `<Camera>
            <gx:horizFov>${c.fov}</gx:horizFov>
            <longitude>${c.lon}</longitude><latitude>${c.lat}</latitude><altitude>${alt}</altitude>
            <heading>${norm(c.heading)}</heading><tilt>${c.pitch + 90}</tilt><roll>0</roll>
            <altitudeMode>${mode}</altitudeMode>
          </Camera>`;
  }
  const t = ((c.pitch + 90) * Math.PI) / 180;
  const h = (norm(c.heading) * Math.PI) / 180;
  const d = rangeM * Math.sin(t);
  const lat = c.lat + (d * Math.cos(h)) / 110540;
  const lon = c.lon + (d * Math.sin(h)) / (111320 * Math.cos((c.lat * Math.PI) / 180));
  return `<LookAt>
            <gx:horizFov>${c.fov}</gx:horizFov>
            <longitude>${lon}</longitude>
            <latitude>${lat}</latitude>
            <altitude>${alt - rangeM * Math.cos(t)}</altitude>
            <heading>${norm(c.heading)}</heading>
            <tilt>${c.pitch + 90}</tilt>
            <range>${rangeM}</range>
            <altitudeMode>${mode}</altitudeMode>
          </LookAt>`;
}

/**
 * @param {Array} views 正本のビュー配列
 * @param {{altitudeMode?: "absolute"|"relativeToGround"}} opts
 */
export function viewsToKml(views, { altitudeMode = "absolute" } = {}) {
  const items = views.map((v) => {
    const c = v.camera;
    let mode = altitudeMode;
    let alt = c.heightEllipsoid - egm96.meanSeaLevel(c.lat, c.lon); // 海抜
    if (mode === "relativeToGround") {
      if (c.groundHeightEllipsoid == null) mode = "absolute"; // 地面高が無ければ海抜で出す
      else alt = c.heightEllipsoid - c.groundHeightEllipsoid; // 地上高
    }
    const fovText = `画角 ${Math.round(c.fov * 10) / 10}°`;
    const desc = c.groundHeightEllipsoid == null
      ? fovText
      : `地上高 約${Math.round(c.heightEllipsoid - c.groundHeightEllipsoid)}m / ${fovText}`;
    const camera = `<Camera>
        <longitude>${c.lon}</longitude>
        <latitude>${c.lat}</latitude>
        <altitude>${alt}</altitude>
        <heading>${norm(c.heading)}</heading>
        <tilt>${c.pitch + 90}</tilt>
        <roll>0</roll>
        <altitudeMode>${mode}</altitudeMode>
        <gx:horizFov>${c.fov}</gx:horizFov>
      </Camera>`;
    // Google Earth Pro は、ツアーの gx:FlyTo 内の LookAt でだけ画角(gx:horizFov)を反映する。
    // Earth Pro 自身が書き出すツアーと同じ形にするため、カメラ位置から range 100m 先の注視点を求めて LookAt にする。
    // （上向き=pitch>0 は LookAt で表せないので Camera のまま出す）
    const tour = flyToXml(c, alt, mode);
    return `
    <Placemark>
      <name>${esc(v.name)}</name>
      <description>${esc(desc)}</description>
      ${camera}
    </Placemark>
    <gx:Tour>
      <name>▶ ${esc(v.name)}</name>
      <gx:Playlist>
        <gx:FlyTo>
          ${tour}
        </gx:FlyTo>
        <gx:Wait><gx:duration>0.00002</gx:duration></gx:Wait>
      </gx:Playlist>
    </gx:Tour>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>EarthViewer Views</name>${items.join("")}
  </Document>
</kml>`;
}

const num = (el, tag, d = 0) => {
  const t = el.getElementsByTagName(tag)[0]?.textContent;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : d;
};

function nameOf(el, fallback) {
  let p = el.parentNode;
  while (p && !["Placemark", "gx:Tour"].includes(p.nodeName)) p = p.parentNode;
  return p?.getElementsByTagName("name")[0]?.textContent?.trim() || fallback;
}

/**
 * Camera / LookAt を読み込む。
 * absolute 以外は地面の高さが要るため camera.pendingAgl に地上高を入れ、
 * heightEllipsoid は null で返す（呼び出し側が地形サンプリングで解決する）。
 * LookAt は「注視点＋range」から近似的にカメラ位置を求める（数百mまでの範囲では十分）。
 */
export function kmlToViews(text, parser = new DOMParser()) {
  const doc = parser.parseFromString(text, "text/xml");
  const warnings = [];
  if (doc.getElementsByTagName("parsererror").length) {
    return { views: [], warnings: ["KMLを解析できませんでした。"] };
  }
  const all = [
    ...doc.getElementsByTagName("Camera"),
    ...doc.getElementsByTagName("LookAt"),
  ];
  // 書き出し時に付けるツアー内のCameraは、Placemark側と重複するので読み込まない（ツアーしか無いKMLなら使う）
  const inTour = (el) => { for (let p = el.parentNode; p; p = p.parentNode) if (p.nodeName === "gx:Tour") return true; return false; };
  const plain = all.filter((el) => !inTour(el));
  const nodes = plain.length ? plain : all;
  const views = nodes.map((el, i) => {
    const isLookAt = el.nodeName === "LookAt";
    let lon = num(el, "longitude");
    let lat = num(el, "latitude");
    let alt = num(el, "altitude");
    const heading = norm(num(el, "heading"));
    const tilt = num(el, "tilt");
    const mode = el.getElementsByTagName("altitudeMode")[0]?.textContent?.trim() || "clampToGround";
    if (el.getElementsByTagName("gx:altitudeMode").length) {
      warnings.push("海底基準のaltitudeModeは未対応です。");
    }

    if (isLookAt) {
      const range = num(el, "range", 500);
      const t = (tilt * Math.PI) / 180;
      const h = (heading * Math.PI) / 180;
      const d = range * Math.sin(t);
      const east = -d * Math.sin(h);
      const north = -d * Math.cos(h);
      lat += north / 110540;
      lon += east / (111320 * Math.cos((lat * Math.PI) / 180));
      alt += range * Math.cos(t);
    }

    const camera = {
      lon, lat, heading,
      pitch: tilt - 90,
      roll: 0,
      fov: num(el, "gx:horizFov", 60),
      groundHeightEllipsoid: null,
    };
    if (mode === "absolute") {
      camera.heightEllipsoid = alt + egm96.meanSeaLevel(lat, lon);
    } else {
      camera.heightEllipsoid = null;
      camera.pendingAgl = mode === "clampToGround" ? 0 : alt;
    }
    return {
      id: uid(),
      name: nameOf(el, `インポート ${i + 1}`),
      note: "",
      createdAt: Date.now(),
      order: Date.now() + i,
      camera,
    };
  });
  if (!views.length) warnings.push("カメラ情報が見つかりませんでした。");
  return { views, warnings };
}
