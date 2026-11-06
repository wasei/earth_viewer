import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
import * as Cesium from "cesium";
import * as egm96 from "egm96-universal";
import { createCameraController, createGroundSampler } from "./camera.js";
import { createUI } from "./ui.js";
import { viewsToKml, kmlToViews } from "./kml.js";
import { loadViews, putView, putViews, deleteView, putThumb, getThumb, createView, captureNow } from "./views.js";

let uiRef = null; // 起動中の通知用（UI作成前は null）

async function main() {
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (!token) throw Object.assign(new Error("no token"), { code: "NO_TOKEN" });
  Cesium.Ion.defaultAccessToken = token;

  const terrainProvider = await Cesium.createWorldTerrainAsync();
  const viewer = new Cesium.Viewer("cesium", {
    terrainProvider,
    timeline: false, animation: false, baseLayerPicker: false,
    geocoder: false, // 標準の検索窓は使わない（ui.js の自作検索に置き換え）
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    infoBox: false, selectionIndicator: false, fullscreenButton: false, vrButton: false,
  });

  // ---- 初期位置（東京湾岸・勝どき付近の上空から、北の銀座・丸の内方面を水平に見る。都心寄りだが手前は海で軽め） ----
  // 高さは海抜300m（楕円体高へはEGM96で変換）。水平線と空が見えるので、未読込のボケも判別しやすい
  const startLon = 139.775, startLat = 35.655;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(startLon, startLat, 300 + egm96.meanSeaLevel(startLat, startLon)),
    orientation: { heading: Cesium.Math.toRadians(340), pitch: 0, roll: 0 },
  });
  viewer.camera.frustum.fov = Cesium.Math.toRadians(60);

  const tilesets = [];
  // 3D品質。maximumScreenSpaceError（小さいほど精細で重い）。初期は一番粗い「軽量」
  const QUALITY = [48, 32, 16, 8, 4]; // 最軽量〜最高精細（UIのスライダー0〜4）
  let quality = 0;
  let loading = true; // 初回読み込み中（最初のタイルが揃うまで）。以後のストリーミングでは出さない
  const setLoading = (on) => { loading = on; uiRef?.setLoading(on); };
  const prepare = (t) => {
    t.maximumScreenSpaceError = QUALITY[quality];
    t.initialTilesLoaded.addEventListener(() => setLoading(false)); // 初回の分だけ発火する
  };
  const notes = [];
  let usingGoogle = false;
  const notify = (m) => (uiRef ? uiRef.toast(m) : notes.push(m));

  // ---- 3Dタイル: 待たずに画面を開く。LODで段階的にストリーミングされる（精細さはCesiumの既定） ----
  (async () => {
    try {
      const t = await Cesium.createGooglePhotorealistic3DTileset(
        { onlyUsingWithGoogleGeocoder: true }, // 検索はGoogleのジオコーダーを使う（利用条件）
        { enableCollision: false }             // 衝突判定は使わない
      );
      prepare(t);
      viewer.scene.primitives.add(t); tilesets.push(t);
      usingGoogle = true;
      // 最初のタイルが揃うまでは標準の地面を残す（地面が真っ黒になるのを避ける）。揃ったら二重表示を避けて隠す
      t.initialTilesLoaded.addEventListener(() => { viewer.scene.globe.show = false; });
    } catch (e) {
      console.warn("Google 3D Tilesを読み込めませんでした。OSM Buildingsで代替します。", e);
      notify("Googleの3Dタイルを読み込めなかったため、簡易な建物モデルで表示しています。");
      try {
        const t = await Cesium.createOsmBuildingsAsync();
        prepare(t);
        viewer.scene.primitives.add(t); tilesets.push(t);
      } catch (e2) {
        setLoading(false);
        console.warn("建物データも読み込めませんでした。", e2);
        notify("建物データを読み込めませんでした。");
      }
    }
  })();

  // ---- 状態 ----
  let views = await loadViews();
  const thumbUrls = new Map();
  const ground = createGroundSampler(viewer, terrainProvider);
  const controller = createCameraController(viewer, ground);
  const makeGeocoder = () =>
    new Cesium.IonGeocoderService({
      scene: viewer.scene,
      geocodeProviderType: usingGoogle ? Cesium.IonGeocodeProviderType.GOOGLE : Cesium.IonGeocodeProviderType.DEFAULT,
    });

  const ui = createUI(document.getElementById("ui"), {
    onFov: (d) => controller.setFov(d),
    onLock: (on) => (controller.heightLock = on),
    onLimit: (on) => (controller.heightLimit = on),
    onBasis: (b) => (controller.heightBasis = b),
    onPreset: (name) => controller.setPreset(name),
    onQuality: (q) => { quality = q; tilesets.forEach((t) => (t.maximumScreenSpaceError = QUALITY[q])); },
    onSave: saveCurrent,
    onSearch: search,
    onRestore: (id) => {
      const v = views.find((x) => x.id === id);
      if (!v) return;
      controller.flyToState(v.camera);
    },
    onRename: async (id, name) => {
      const v = views.find((x) => x.id === id);
      if (v) { v.name = name; await putView(v); }
      refresh();
    },
    onDelete: async (id) => {
      await deleteView(id);
      views = views.filter((v) => v.id !== id);
      URL.revokeObjectURL(thumbUrls.get(id)); thumbUrls.delete(id);
      refresh();
    },
    onReorder: async (fromId, toId, after) => {
      const from = views.find((v) => v.id === fromId);
      if (!from) return;
      views = views.filter((v) => v.id !== fromId);
      let i = views.findIndex((v) => v.id === toId);
      if (i < 0) i = views.length;
      views.splice(after ? i + 1 : i, 0, from);
      views.forEach((v, n) => (v.order = n));
      await putViews(views);
      refresh();
    },
    // Google Earth Pro で同じ状態になるよう、書き出しは常に海抜(absolute)
    onExport: () => {
      if (!views.length) return ui.toast("書き出すビューがありません。");
      download(viewsToKml(views), `earthviewer-${Date.now()}.kml`);
    },
    onImport: importKml,
  });

  uiRef = ui;
  if (loading) ui.setLoading(true);
  notes.forEach((n) => ui.toast(n));
  const refresh = () => ui.renderViews(views, thumbUrls);
  for (const v of views) {
    const blob = await getThumb(v.id);
    if (blob) thumbUrls.set(v.id, URL.createObjectURL(blob));
  }
  refresh();

  /** 次の連番。削除や読み込みがあっても重ならないよう、既存の最大値+1にする */
  function nextName() {
    const nums = views.map((v) => /^ビュー (\d+)$/.exec(v.name)).filter(Boolean).map((m) => +m[1]);
    return `ビュー ${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }

  async function setThumb(id, blob) {
    if (!blob) return;
    await putThumb(id, blob);
    const old = thumbUrls.get(id);
    thumbUrls.set(id, URL.createObjectURL(blob));
    if (old) URL.revokeObjectURL(old);
    refresh();
  }

  /** 保存は即時。サムネイルは先に今の描画で作り、タイルが読み込み途中ならカメラが動かない間だけ撮り直す */
  async function saveCurrent() {
    const state = controller.getState();
    const v = createView(nextName(), state);
    v.order = views.length ? Math.max(...views.map((x) => x.order ?? 0)) + 1 : 0;
    views.push(v); // 先に一覧へ入れる（連打しても番号が重ならない）
    refresh();
    ui.toast("ビューを保存しました。名前はダブルクリックで変更できます。");
    await putView(v);
    const needsRefine = tilesets.some((t) => !t.tilesLoaded);
    await setThumb(v.id, await captureNow(viewer));
    if (!needsRefine) return;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const now = controller.getState();
      const moved = Math.abs(now.lon - state.lon) > 1e-7 || Math.abs(now.lat - state.lat) > 1e-7 ||
        Math.abs(now.heightEllipsoid - state.heightEllipsoid) > 0.01 ||
        Math.abs(now.heading - state.heading) > 0.05 || Math.abs(now.pitch - state.pitch) > 0.05;
      if (moved) return; // カメラが動いたら、別の絵になってしまうので撮り直さない
      if (tilesets.every((t) => t.tilesLoaded)) { await setThumb(v.id, await captureNow(viewer)); return; }
    }
  }

  // ---- 検索 ----
  async function search(q) {
    const results = await makeGeocoder().geocode(q);
    return results.slice(0, 6).map((r) => ({ label: r.displayName, go: () => flyToResult(r) }));
  }
  function flyToResult(r) {
    const d = r.destination;
    const isRect = d instanceof Cesium.Rectangle;
    const sphere = isRect ? Cesium.BoundingSphere.fromRectangle3D(d) : new Cesium.BoundingSphere(d, 1);
    const range = isRect ? Math.max(sphere.radius * 2.5, 250) : 400;
    viewer.camera.flyToBoundingSphere(sphere, {
      offset: new Cesium.HeadingPitchRange(viewer.camera.heading, Cesium.Math.toRadians(-35), range),
      duration: 1.5,
    });
  }

  // ---- KML ----
  /** 地上高基準で書かれたビューを、地形サンプリングで楕円体高に解決する */
  async function resolvePending(v) {
    const c = v.camera;
    if (c.pendingAgl == null) return v;
    const [r] = await Cesium.sampleTerrainMostDetailed(terrainProvider, [Cesium.Cartographic.fromDegrees(c.lon, c.lat)]);
    c.groundHeightEllipsoid = r.height ?? 0;
    c.heightEllipsoid = c.groundHeightEllipsoid + c.pendingAgl;
    delete c.pendingAgl;
    return v;
  }

  async function importKml(file) {
    const { views: added, warnings } = kmlToViews(await file.text());
    for (const v of added) { await resolvePending(v); await putView(v); }
    views.push(...added);
    refresh();
    ui.toast(added.length ? `${added.length}件のビューを読み込みました。` : warnings.join(" "));
  }

  function download(text, name) {
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([text], { type: "application/vnd.google-earth.kml+xml" })),
      download: name,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---- 情報表示（コンパスは毎フレーム、数値は100msごと） ----
  let last = 0;
  viewer.scene.postRender.addEventListener(() => {
    const now = performance.now();
    if (now - last < 50) return;
    last = now;
    const s = controller.getState();
    ui.update({ ...s, asl: s.heightEllipsoid - egm96.meanSeaLevel(s.lat, s.lon) });
  });
}

function showFatal(e) {
  const status = e?.statusCode;
  const [title, body] =
    e?.code === "NO_TOKEN"
      ? ["Cesium ionのトークンが設定されていません", ".env に VITE_CESIUM_ION_TOKEN=（トークン）を書いて、開発サーバーを再起動してください。（.env.example をコピーして作れます）"]
      : e?.code === "TIMEOUT"
      ? [`${e.label}がタイムアウトしました`, "ネットワークを確認してください。VPN・社内ネットワーク・広告ブロッカーが、api.cesium.com や tile.googleapis.com への通信を止めていないか確認し、再読み込みしてください。"]
      : status === 401 || status === 403
      ? ["Cesium ionのトークンが使えません（401/403）", "トークンの有効期限・コピーミスを確認してください。トークンに許可アセットの制限がある場合は、Cesium World Terrain、OSM Buildings、Google Photorealistic 3D Tiles を許可してください。.env を直したら開発サーバーを再起動してください。"]
      : ["起動に失敗しました", "ネットワークとコンソールのエラーを確認してください。"];
  const box = document.createElement("div");
  box.className = "panel fatal";
  const h = document.createElement("strong"); h.textContent = title;
  const p = document.createElement("p"); p.textContent = body;
  box.append(h, p);
  document.getElementById("ui").replaceChildren(box);
}

main().catch((e) => {
  console.error(e);
  showFatal(e);
});
