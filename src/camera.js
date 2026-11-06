// 自前のカメラコントローラー。Cesium標準の入力は全て無効化し、1モードで運用する。
//   左ドラッグ: つかんで水平パン / 右ドラッグ(Ctrl+左): 見回す / 中ボタン(Alt+左): 注視点を中心に回る
//   ホイール: 前進後退 / Shift+ホイール: 上昇下降 / WASD: 水平移動 / Q・E: 上昇下降
//   Shift: 加速 / Alt: 減速 / ダブルクリック: その地点へ
// 地上高ロックON: 水平に動いても地面からの高さ(地上高)を保つ（地形に沿って上下する）。
import * as Cesium from "cesium";
import * as egm96 from "egm96-universal";

const { Cartesian3, Cartographic, Matrix4, Transforms } = Cesium;
const deg = Cesium.Math.toDegrees;
const rad = Cesium.Math.toRadians;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * 移動のプリセット（アイコン: fine=照準 / walk=人 / car=車。表示名は 精密 / 低速 / 高速）
 * speed: WASD・Q/Eの速度[m/s]、step: ホイール1ノッチの移動量[m]
 * scales: trueなら、高く上がるほど速度・刻みが比例して大きくなる（精密は常に一定）
 */
export const PRESETS = {
  fine: { speed: 1, step: 0.5, scales: false },  // 精密
  walk: { speed: 12, step: 2, scales: true },    // 低速
  car: { speed: 40, step: 10, scales: true },    // 高速
};

// ---- オービット（注視点まわりの回転）。方位・仰角・距離から位置を直接決めるのでロールが出ない ----
export function orbitBegin(camera, pivot) {
  const enu = Transforms.eastNorthUpToFixedFrame(pivot);
  const inv = Matrix4.inverseTransformation(enu, new Matrix4());
  const v = Matrix4.multiplyByPoint(inv, camera.positionWC, new Cartesian3());
  const r = Cartesian3.magnitude(v);
  return { enu, r, az: Math.atan2(v.x, v.y), el: Math.asin(clamp(v.z / r, -1, 1)) };
}
export function orbitApply(camera, s) {
  const ce = Math.cos(s.el);
  const local = new Cartesian3(s.r * ce * Math.sin(s.az), s.r * ce * Math.cos(s.az), s.r * Math.sin(s.el));
  camera.setView({
    destination: Matrix4.multiplyByPoint(s.enu, local, new Cartesian3()),
    orientation: { heading: s.az + Math.PI, pitch: -s.el, roll: 0 },
  });
}

/**
 * カメラ直下の地面の高さ（楕円体高）を、間引きながら非同期にサンプリングする。
 * 取得値は段差が出ないよう指数平滑して `height` として公開する（`raw` は最後の生値）。
 */
export function createGroundSampler(viewer, terrainProvider) {
  let raw = null, smooth = null, busy = false, last = 0, lastPos = null, prev = performance.now();
  viewer.scene.preRender.addEventListener(async () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (raw != null) smooth = smooth == null ? raw : smooth + (raw - smooth) * (1 - Math.exp(-dt * 10));

    const pos = viewer.camera.positionWC;
    const c = viewer.camera.positionCartographic;
    if (c.height > 2e5) { raw = 0; return; }              // 高空では地形を気にしない
    if (busy || now - last < 150) return;
    if (lastPos && Cartesian3.distance(lastPos, pos) < 0.5) return; // 動いていなければ再取得しない
    last = now; busy = true; lastPos = Cartesian3.clone(pos);
    try {
      const [r] = await Cesium.sampleTerrainMostDetailed(terrainProvider, [
        new Cartographic(c.longitude, c.latitude),
      ]);
      if (r.height != null) raw = r.height;
    } catch { /* 取得失敗は無視 */ } finally { busy = false; }
  });
  return {
    get height() { return smooth; },
    get raw() { return raw; },
    agl() { return Math.max(1, viewer.camera.positionCartographic.height - (smooth ?? 0)); },
  };
}

export function createCameraController(viewer, ground) {
  const { scene, camera, canvas } = viewer;
  const ssc = scene.screenSpaceCameraController;
  ssc.enableInputs = false;
  // 位置は全て自前で決める。標準の地形衝突補正が走ると、毎フレームカメラ位置を勝手に動かしてしまう
  ssc.enableCollisionDetection = false;
  ssc.enableRotate = ssc.enableTranslate = ssc.enableZoom = ssc.enableTilt = ssc.enableLook = false;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- 調整用パラメータ（触りながら詰める） ----
  const cfg = {
    maxAgl: 5000,    // 高さ制限ON時の上限（地上高 [m]）
    minAgl: -30,     // 下限。地形モデルが実際の地面より高い場所でも、地面まで降りられるよう余裕を持たせる
    refAgl: 300,     // この地上高を超えたら、速度・刻みを高さに比例して大きくする（精密を除く）
    fast: 4, slow: 0.25,
    settleMs: 700,   // 移動を止めた後、地面の平滑が収束するまで高さを追従させる時間
  };
  let preset = PRESETS.car; // 初期は高速
  let heightLock = false;  // 高さ固定（初期は自由移動）
  let heightBasis = "ground"; // 固定する高さの基準: "ground"=地上高（地形に沿う） / "sea"=海抜
  let limitOn = true;      // 高さ制限
  const keys = new Set();
  const mods = { shift: false, alt: false };
  let drag = null;
  let hold = null, holdT = 0; // 地上高ロック中に保つ地上高 [m] と、最後に動かした時刻

  // 高く上がるほど速く・粗く動く（精密は一定）。スカイツリーの高さでも、現実的な操作回数で上がれる
  const reach = () => (preset.scales ? Math.max(1, ground.agl() / cfg.refAgl) : 1);
  const speed = () => preset.speed * reach() * (mods.shift ? cfg.fast : 1) * (mods.alt ? cfg.slow : 1);
  const stepMeters = () => preset.step * reach();

  // ---- 基本操作 ----
  const orientation = () => ({ heading: camera.heading, pitch: camera.pitch, roll: camera.roll });

  function place(lon, lat, h, o = orientation()) {
    camera.setView({ destination: Cartesian3.fromRadians(lon, lat, h), orientation: o });
  }

  /**
   * 水平に動く。高さ固定ONなら、基準に応じて高さを保つ:
   *   ground: 地上高を保つ（地形に沿って上下する） / sea: 海抜を保つ（EGM96で補正）
   * 高さ固定OFFなら楕円体高を保つ。
   */
  function moveHorizontal(fwd, right) {
    const o = { ...orientation(), roll: 0 };
    const pos = camera.positionWC;
    const enu = Transforms.eastNorthUpToFixedFrame(pos);
    const sh = Math.sin(o.heading), ch = Math.cos(o.heading);
    const local = new Cartesian3(sh * fwd + ch * right, ch * fwd - sh * right, 0);
    const d = Matrix4.multiplyByPointAsVector(enu, local, new Cartesian3());
    const cur = Cartographic.fromCartesian(pos);
    const next = Cartographic.fromCartesian(Cartesian3.add(pos, d, new Cartesian3()));
    if (!next || !cur) return;
    let h = cur.height;
    if (heightLock) {
      const now = performance.now();
      const fresh = hold == null || now - holdT > cfg.settleMs; // 動き始め
      if (heightBasis === "ground" && ground.height != null) {
        if (fresh) hold = h - ground.height; // 現在の地上高を採用
        holdT = now;
        h = ground.height + hold;
      } else if (heightBasis === "sea") {
        if (fresh) hold = h - egm96.meanSeaLevel(deg(cur.latitude), deg(cur.longitude)); // 現在の海抜を採用
        holdT = now;
        h = hold + egm96.meanSeaLevel(deg(next.latitude), deg(next.longitude));
      }
    }
    place(next.longitude, next.latitude, h, o);
  }

  /** ユーザー操作で高さを変える（高さ制限を適用し、保つべき地上高は作り直す） */
  function setHeight(h) {
    hold = null;
    const c = camera.positionCartographic;
    const g = ground.height ?? 0;
    let hi = limitOn ? g + cfg.maxAgl : Infinity;
    if (c.height > hi) hi = c.height; // 制限を超えた状態でも、下げる操作は許す
    place(c.longitude, c.latitude, clamp(h, g + cfg.minAgl, hi));
  }

  const pxToRad = () => camera.frustum.fov / canvas.clientWidth;
  const metersPerPx = () =>
    (2 * ground.agl() * Math.tan(camera.frustum.fov / 2)) / canvas.clientWidth;

  const pick = (pos) =>
    (scene.pickPositionSupported && scene.pickPosition(pos)) || camera.pickEllipsoid(pos);

  /** ホイール量をノッチ数に換算（マウスは1ノッチ=1、トラックパッドは量に比例） */
  const notches = (dy) => {
    const a = Math.abs(dy);
    return Math.sign(dy) * (a >= 50 ? clamp(a / 100, 1, 3) : a / 100);
  };

  // ---- マウス ----
  canvas.addEventListener("pointerdown", (e) => {
    const type =
      e.button === 1 || (e.button === 0 && e.altKey) ? "orbit"
      : e.button === 2 || (e.button === 0 && e.ctrlKey) ? "look"  // MacではCtrl+クリックが右クリック扱い
      : e.button === 0 ? "pan" : null;
    if (!type) return;
    e.preventDefault();
    camera.cancelFlight(); // ビュー復元などの飛行が残っていると、位置が引っ張られて寄り引きのように見える
    if (!Matrix4.equals(camera.transform, Matrix4.IDENTITY)) camera.lookAtTransform(Matrix4.IDENTITY);
    drag = { type, x: e.clientX, y: e.clientY };
    hold = null;
    if (type === "look") drag.look = { pos: Cartesian3.clone(camera.positionWC), heading: camera.heading, pitch: camera.pitch };
    if (type === "orbit") {
      const pivot = pick(new Cesium.Cartesian2(e.offsetX, e.offsetY));
      if (!pivot) { drag = null; return; }
      drag.orbit = orbitBegin(camera, pivot);
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    const k = pxToRad();
    if (drag.type === "pan") {
      const m = metersPerPx();
      moveHorizontal(dy * m, -dx * m);
    } else if (drag.type === "look") {
      // 位置は一切変えず、その場で回転するだけ。ドラッグした方向へ「世界を引っ張る」向き
      // 位置は押した瞬間の値に固定し、向き(方位・ピッチ)だけを積算して setView する。
      // カメラの現在値を読み直さないので、位置が動く余地がない
      const L = drag.look;
      L.heading -= dx * k;
      L.pitch = clamp(L.pitch + dy * k, rad(-89.5), rad(89.5));
      camera.setView({ destination: L.pos, orientation: { heading: L.heading, pitch: L.pitch, roll: 0 } });
    } else if (drag.type === "orbit") {
      const o = drag.orbit;
      o.az += dx * k * 1.5;
      o.el = clamp(o.el - dy * k * 1.5, rad(-5), rad(89));
      orbitApply(camera, o);
    }
  });

  const endDrag = (e) => {
    if (!drag) return;
    if (drag.type === "orbit") hold = null;
    drag = null;
    if (e.pointerId != null && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    if (e.shiftKey) {
      const n = -notches((e.deltaX || e.deltaY) * unit); // Shift+ホイールは deltaX で来ることがある。手前に回す=下降
      setHeight(camera.positionCartographic.height + n * stepMeters());
    } else {
      const dist = -notches(e.deltaY * unit) * stepMeters(); // 奥へ回す=前進
      if (heightLock) moveHorizontal(dist, 0);
      else { hold = null; camera.move(camera.directionWC, dist); setHeight(camera.positionCartographic.height); }
    }
  }, { passive: false });

  canvas.addEventListener("dblclick", (e) => {
    const p = pick(new Cesium.Cartesian2(e.offsetX, e.offsetY));
    if (!p) return;
    hold = null;
    const range = clamp(Cartesian3.distance(camera.positionWC, p) / 2, 15, 1e7);
    camera.flyToBoundingSphere(new Cesium.BoundingSphere(p, 1), {
      offset: new Cesium.HeadingPitchRange(camera.heading, Math.max(camera.pitch, rad(-60)), range),
      duration: 1.0,
    });
  });

  // ---- キーボード ----
  const typing = (e) => e.target.closest?.("input, textarea, select, [contenteditable]");
  const KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"];
  window.addEventListener("keydown", (e) => {
    mods.shift = e.shiftKey; mods.alt = e.altKey;
    if (typing(e) || e.ctrlKey || e.metaKey) return;
    if (e.code === "AltLeft" || e.code === "AltRight") e.preventDefault(); // メニュー表示を抑止
    if (KEYS.includes(e.code)) { e.preventDefault(); keys.add(e.code); }
  });
  window.addEventListener("keyup", (e) => {
    mods.shift = e.shiftKey; mods.alt = e.altKey;
    if (e.code === "AltLeft" || e.code === "AltRight") e.preventDefault();
    keys.delete(e.code);
  });
  window.addEventListener("blur", () => { keys.clear(); mods.shift = mods.alt = false; endDrag({}); });

  let prev = performance.now();
  scene.preRender.addEventListener(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prev) / 1000);   // フレームレートに依存しない
    prev = now;

    if (keys.size && !drag) {
      const step = speed() * dt;
      const f = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
      const r = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
      const v = (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0);
      if (f || r) moveHorizontal(f * step, r * step);
      if (v) setHeight(camera.positionCartographic.height + v * step);
    }

    // 動きを止めた後も、地面の平滑が収束するまでは地上高を保つ
    if (hold != null) {
      if (now - holdT > cfg.settleMs) hold = null;
      else if (heightLock && heightBasis === "ground" && ground.height != null) {
        const c = camera.positionCartographic, want = ground.height + hold;
        if (Math.abs(want - c.height) > 0.01) place(c.longitude, c.latitude, want);
      }
    }

    // 水平を保つ: ロールがついていたら0に戻す（位置・方位・ピッチはそのまま）
    if (scene.tweens.length === 0 && Matrix4.equals(camera.transform, Matrix4.IDENTITY)) {
      const p = camera.pitch;
      const roll = ((camera.roll + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (Math.abs(p) < rad(88) && Math.abs(roll) > rad(0.02)) {
        const c = camera.positionCartographic;
        place(c.longitude, c.latitude, c.height, { heading: camera.heading, pitch: p, roll: 0 });
      }
    }
  });

  // ---- 外部API ----
  return {
    get heightLock() { return heightLock; },
    set heightLock(v) { heightLock = !!v; hold = null; },
    get heightBasis() { return heightBasis; },
    set heightBasis(v) { heightBasis = v === "sea" ? "sea" : "ground"; hold = null; },
    get heightLimit() { return limitOn; },
    set heightLimit(v) { limitOn = !!v; },
    setPreset(name) { preset = PRESETS[name] ?? preset; },
    getState() {
      const c = camera.positionCartographic;
      return {
        lon: deg(c.longitude), lat: deg(c.latitude), heightEllipsoid: c.height,
        heading: deg(camera.heading), pitch: deg(camera.pitch), roll: 0,
        fov: deg(camera.frustum.fov),
        groundHeightEllipsoid: ground.raw,
        agl: ground.height == null ? null : c.height - ground.height, // 表示用（平滑済みの地面高との差）
      };
    },
    setFov(d) { camera.frustum.fov = rad(d); },
    flyToState(s, duration = 1) {
      hold = null;
      camera.cancelFlight();
      camera.frustum.fov = rad(s.fov);
      const destination = Cartesian3.fromDegrees(s.lon, s.lat, s.heightEllipsoid);
      const orientation = { heading: rad(s.heading), pitch: rad(s.pitch), roll: rad(s.roll ?? 0) };
      const settle = () => { // 飛行の終端で、保存値そのものに確定させる（変換行列も初期状態に戻す）
        if (!Matrix4.equals(camera.transform, Matrix4.IDENTITY)) camera.lookAtTransform(Matrix4.IDENTITY);
        camera.setView({ destination, orientation });
      };
      camera.flyTo({ destination, orientation, duration, complete: settle });
    },
  };
}
