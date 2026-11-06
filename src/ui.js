// パネルとオーバーレイ。フレームワークなし。値は変化したときだけDOMを書き換える。
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};

const HINTS = [
  ["左ドラッグ", "つかんで動かす"],
  ["右ドラッグ", "見回す"],
  ["中ボタン / Ctrl+左", "注視点を中心に回る"],
  ["ホイール", "前進・後退"],
  ["Shift+ホイール", "上昇・下降"],
  ["W A S D / Q E", "水平移動 / 上昇・下降"],
  ["Shift / Alt", "加速 / 減速"],
  ["ダブルクリック", "その地点へ移動"],
];
const CARDINAL = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };

/** 上部のコンパス帯。方位に合わせて目盛りが流れる */
function createCompass() {
  const cvs = el("canvas", { className: "compass-cvs" });
  const read = el("div", { className: "compass-read" }, "000°");
  const root = el("div", { className: "panel compass" }, cvs, el("div", { className: "compass-center" }), read);
  let last = null;

  function draw(h) {
    const w = cvs.clientWidth, ht = cvs.clientHeight;
    if (!w) return;
    const g = cvs.getContext?.("2d");
    if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    if (cvs.width !== Math.round(w * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(ht * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, ht);
    const ppd = 5, cx = w / 2, half = w / 2 / ppd + 1;
    g.textAlign = "center"; g.lineWidth = 1;
    for (let d = Math.ceil((h - half) / 5) * 5; d <= h + half; d += 5) {
      const n = ((d % 360) + 360) % 360;
      const x = Math.round(cx + (d - h) * ppd) + 0.5;
      const major = n % 45 === 0, mid = n % 15 === 0;
      const len = major ? 14 : mid ? 9 : 5;
      g.globalAlpha = major ? 1 : mid ? 0.8 : 0.45;
      g.strokeStyle = "#fff"; g.fillStyle = n === 0 ? "#f0883e" : "#fff";
      g.beginPath(); g.moveTo(x, ht); g.lineTo(x, ht - len); g.stroke();
      if (major) { g.font = `${n % 90 === 0 ? 700 : 500} ${n % 90 === 0 ? 15 : 11}px sans-serif`; g.fillText(CARDINAL[n], x, ht - 19); }
      else if (mid) { g.font = "500 10px sans-serif"; g.fillText(String(n), x, ht - 14); }
    }
    g.globalAlpha = 1;
  }

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => draw(last ?? 0)).observe(cvs);
  return {
    root,
    update(h) {
      if (last != null && Math.abs(h - last) < 0.05) return;
      last = h;
      read.textContent = `${String(Math.round(((h % 360) + 360) % 360) % 360).padStart(3, "0")}°`;
      draw(h);
    },
  };
}

export function createUI(root, cb) {
  // ---- 左: カメラ情報 ----
  const vals = {};
  const row = (key, label) => {
    vals[key] = el("span", { className: "v" }, "–");
    return el("div", { className: "row" }, el("span", { className: "l" }, label), vals[key]);
  };
  vals.agl = el("span", { className: "hero-v" }, "–");   // 大きく出す高さ（基準に応じて 地上高 / 海抜）
  vals.asl = el("span", { className: "v" }, "–");         // 小さく出す高さ
  const heroLabel = el("span", { className: "l" }, "地上高");
  const subLabel = el("span", { className: "l" }, "海抜");
  let basis = "ground", lastInfo = null;
  function renderHeights() {
    if (!lastInfo) return;
    const sea = basis === "sea";
    const big = sea ? lastInfo.asl : lastInfo.agl, small = sea ? lastInfo.agl : lastInfo.asl;
    heroLabel.textContent = sea ? "海抜" : "地上高";
    subLabel.textContent = sea ? "地上高" : "海抜";
    setText("agl", big == null ? "–" : `${Math.round(big)} m`);
    setText("asl", small == null ? "–" : `${Math.round(small)} m`);
  }
  vals.pos = el("span", { className: "v small" }, "–");

  const fov = el("input", { type: "range", min: 10, max: 160, step: 1, value: 60 });
  const fovLabel = el("span", { className: "v" }, "60°");
  fov.addEventListener("input", () => { fovLabel.textContent = `${fov.value}°`; cb.onFov(+fov.value); });

  // 移動速度のプリセット（微調整 / 人 / 車）
  const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const ICON = {
    fine: svg('<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'),
    walk: svg('<circle cx="13" cy="4.5" r="1.8"/><path d="M12 8.5l-3 4.5 2.5 2.5-1 5.5M12 8.5l3 3 3 .8M11.5 15.5l3.5 2 1 3.5"/>'),
    car: svg('<path d="M3 16v-3.5L5.2 7h13.6L21 12.5V16M3 16h18M3 16v2.5h3V16M18 16v2.5h3V16"/><circle cx="7.5" cy="13.5" r=".8"/><circle cx="16.5" cy="13.5" r=".8"/>'),
  };
  const PRESET_DEFS = [
    ["fine", "精密", "ホイール0.5m刻み・WASD 1m/秒"],
    ["walk", "低速", "ホイール2m刻み・WASD 12m/秒（高く上がるほど大きくなる）"],
    ["car", "高速", "ホイール10m刻み・WASD 40m/秒（高く上がるほど大きくなる）"],
  ];
  const presetBtns = PRESET_DEFS.map(([k, label, tip]) => {
    const b = el("button", { className: `seg${k === "car" ? " on" : ""}`, title: `${label}（${tip}）` });
    b.innerHTML = `${ICON[k]}<span>${label}</span>`; // ICONは上の固定文字列のみ
    b.addEventListener("click", () => {
      presetBtns.forEach((x) => x.classList.toggle("on", x === b));
      cb.onPreset(k);
    });
    return b;
  });

  // ON/OFFの小さなチップ
  const chip = (label, title, on, handler) => {
    const b = el("button", { className: `chip${on ? " on" : ""}`, title }, label);
    b.addEventListener("click", () => {
      const v = !b.classList.contains("on");
      b.classList.toggle("on", v);
      handler(v);
    });
    return b;
  };
  const lock = chip("高さ固定", "OFF: 自由移動（高さは自分で操作） / ON: 水平に動いても高さを保つ（基準は右のボタンで切り替え）", false, (v) => cb.onLock(v));
  const limit = chip("高さ制限", "ONの間は、地上5000mまでに制限する", true, (v) => cb.onLimit(v));
  const basisBtn = el("button", { className: "chip", title: "高さ固定の基準。地上: 地形に沿って地上高を保つ / 海抜: 海抜を保つ（Google Earth Proの「視点の高度」と同じ値）" }, "基準：地上");
  basisBtn.addEventListener("click", () => {
    basis = basis === "ground" ? "sea" : "ground";
    basisBtn.textContent = basis === "ground" ? "基準：地上" : "基準：海抜";
    renderHeights();
    cb.onBasis(basis);
  });
  // 3Dモデルの品質（5段階。Cesium3DTilesetのmaximumScreenSpaceErrorに対応。左ほど粗くて軽い）
  const QUALITY_NAMES = ["最軽量", "軽量", "標準", "高精細", "最高精細"];
  const quality = el("input", { type: "range", min: 0, max: QUALITY_NAMES.length - 1, step: 1, value: 0, title: "左: 粗いLODで軽い（初期値） / 右: 細部まで読み込む（通信・描画が重い）" });
  const qualityLabel = el("span", { className: "v" }, QUALITY_NAMES[0]);
  quality.addEventListener("input", () => { qualityLabel.textContent = QUALITY_NAMES[+quality.value]; cb.onQuality?.(+quality.value); });
  const crossBtn = chip("クロス", "画面中央に十字線を表示", false, () => layoutGuide());
  const cross = el("div", { className: "cross", hidden: true });
  const guide = el("div", { className: "guide", hidden: true }, cross);
  Object.assign(guide.style, { width: "100vw", height: "100vh" });

  // ガイド: 画面中央の十字線のみ（画面サイズで意味が変わるフレーム比率ガイドは廃止）
  function layoutGuide() {
    const on = crossBtn.classList.contains("on");
    cross.hidden = !on;
    guide.hidden = !on;
  }

  // 枠で囲んだグループ: カメラ / 移動速度 / 高さ / ガイド / 3D品質
  const group = (title, ...children) =>
    el("div", { className: "group" }, el("span", { className: "l small" }, title), ...children);
  const info = el("div", { className: "panel info" },
    el("div", { className: "hero" }, heroLabel, vals.agl),
    el("div", { className: "row", title: "Google Earth Proの「視点の高度」は海抜です" }, subLabel, vals.asl),
    el("div", { className: "row" }, el("span", { className: "l" }, "座標"), vals.pos),
    row("pitch", "ピッチ"),
    group("カメラ", el("div", { className: "row" }, el("span", { className: "l" }, "画角"), fov, fovLabel)),
    group("移動速度", el("div", { className: "segs" }, ...presetBtns)),
    group("高さ", el("div", { className: "chips" }, lock, limit), el("div", { className: "chips" }, basisBtn)),
    group("ガイド", el("div", { className: "chips" }, crossBtn)),
    group("3D品質", el("div", { className: "row" }, quality, qualityLabel)));

  // ---- 上: コンパス ----
  const compass = createCompass();

  // ---- 右: 検索（Cesium標準のgeocoderの代わり）・操作ヒント ----
  const input = el("input", { type: "search", className: "search-input", placeholder: "場所を検索（例: 東京駅）", autocomplete: "off" });
  const results = el("div", { className: "results", hidden: true });
  const search = el("div", { className: "panel search" }, input, results);
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") { results.hidden = true; input.blur(); return; }
    if (e.key !== "Enter" || !input.value.trim()) return;
    let items = [];
    try { items = await cb.onSearch(input.value.trim()); } catch (err) { console.warn(err); }
    if (!items.length) { results.hidden = true; return api.toast("見つかりませんでした。"); }
    items[0].go(); // 先頭候補へ移動し、他の候補は一覧から選べる
    results.replaceChildren(...items.map((it) => {
      const b = el("button", { className: "result" }, it.label);
      b.addEventListener("mousedown", (ev) => { ev.preventDefault(); it.go(); results.hidden = true; });
      return b;
    }));
    results.hidden = false;
  });
  input.addEventListener("blur", () => { results.hidden = true; });

  const hint = el("details", { className: "panel hint", open: localStorage.hintOpen !== "0" },
    el("summary", {}, "操作"),
    ...HINTS.map(([k, v]) => el("div", { className: "hrow" }, el("kbd", {}, k), el("span", {}, v))));
  hint.addEventListener("toggle", () => { localStorage.hintOpen = hint.open ? "1" : "0"; });
  const side = el("div", { className: "side" }, search, hint);

  // ---- 下: ビュー一覧 ----
  const fileInput = el("input", { type: "file", accept: ".kml", hidden: true });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) cb.onImport(fileInput.files[0]);
    fileInput.value = "";
  });
  const list = el("div", { className: "cards" });
  const strip = el("div", { className: "panel strip" },
    el("div", { className: "actions" },
      el("button", { className: "primary", onclick: () => cb.onSave() }, "ビューを保存"),
      el("button", { onclick: () => fileInput.click() }, "KML読込"),
      el("button", { onclick: () => cb.onExport() }, "KML書出"),
      fileInput),
    list);
  // Cesiumのクレジット表示が下のパネルに隠れないよう、パネルの高さを共有する
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => document.documentElement.style.setProperty("--strip-h", `${strip.offsetHeight + 8}px`)).observe(strip);
  }

  const toastEl = el("div", { className: "toast", hidden: true });
  // 初回の3D読み込み中だけ出す小さな表示。画面は隠さず、クリックで閉じられる
  const loadingEl = el("div", { className: "panel loading", hidden: true, title: "クリックで閉じる" },
    el("span", { className: "spin" }), el("span", {}, "3Dの地形を読み込み中…"));
  loadingEl.addEventListener("click", () => { loadingEl.hidden = true; });
  root.append(guide, info, compass.root, side, strip, toastEl, loadingEl);

  const setText = (k, t) => { if (vals[k].textContent !== t) vals[k].textContent = t; };
  let toastTimer, dragId = null, loadingClosed = false;
  const clearMarks = () => list.querySelectorAll(".drop-before, .drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));

  const api = {
    update(s) {
      // 高さは整数で表示（小数は精度以上の印象を与えるため）
      lastInfo = s;
      renderHeights();
      setText("pos", `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`);
      setText("pitch", `${Math.round(s.pitch)}°`);
      if (+fov.value !== Math.round(s.fov)) { fov.value = Math.round(s.fov); fovLabel.textContent = `${fov.value}°`; }
      compass.update(s.heading);
    },
    /** 初回読み込み中の表示。false で消す（一度閉じたら再表示しない） */
    setLoading(on) { if (on) { if (!loadingClosed) loadingEl.hidden = false; } else { loadingClosed = true; loadingEl.hidden = true; } },
    toast(msg) {
      toastEl.textContent = msg; toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toastEl.hidden = true), 3500);
    },
    /** thumbUrls: id → objectURL */
    renderViews(views, thumbUrls) {
      list.replaceChildren(...(views.length ? views.map((v) => {
        const name = el("span", { className: "name", title: "ダブルクリックで名前を変更 / ドラッグで並び替え" }, v.name);
        const del = el("button", { className: "del", title: "削除" }, "×");
        const thumb = thumbUrls.get(v.id);
        const card = el("div", { className: "card", draggable: true },
          thumb ? el("img", { src: thumb, alt: "", draggable: false }) : el("div", { className: "noimg" }),
          el("div", { className: "meta" }, name, del));

        name.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          card.draggable = false;
          const edit = el("input", { value: v.name, className: "rename" });
          const done = (ok) => {
            card.draggable = true;
            if (ok && edit.value.trim() && edit.value.trim() !== v.name) cb.onRename(v.id, edit.value.trim());
            else name.textContent = v.name;
            if (edit.isConnected) edit.replaceWith(name);
          };
          edit.addEventListener("keydown", (k) => { if (k.key === "Enter") done(true); if (k.key === "Escape") done(false); });
          edit.addEventListener("blur", () => done(true));
          edit.addEventListener("click", (c) => c.stopPropagation());
          name.replaceWith(edit); edit.focus(); edit.select();
        });

        let armed;
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!armed) {
            armed = setTimeout(() => { armed = null; del.textContent = "×"; del.classList.remove("armed"); }, 2000);
            del.textContent = "削除?"; del.classList.add("armed");
            return;
          }
          clearTimeout(armed); cb.onDelete(v.id);
        });
        card.addEventListener("click", () => cb.onRestore(v.id));

        // ドラッグ&ドロップで並び替え
        card.addEventListener("dragstart", (e) => {
          dragId = v.id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", v.id);
          requestAnimationFrame(() => card.classList.add("dragging"));
        });
        card.addEventListener("dragend", () => { dragId = null; card.classList.remove("dragging"); clearMarks(); });
        const isAfter = (e) => { const r = card.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; };
        card.addEventListener("dragover", (e) => {
          if (!dragId || dragId === v.id) return;
          e.preventDefault();
          clearMarks();
          card.classList.add(isAfter(e) ? "drop-after" : "drop-before");
        });
        card.addEventListener("dragleave", () => card.classList.remove("drop-before", "drop-after"));
        card.addEventListener("drop", (e) => {
          if (!dragId || dragId === v.id) return;
          e.preventDefault();
          const from = dragId, after = isAfter(e);
          clearMarks();
          cb.onReorder(from, v.id, after);
        });
        return card;
      }) : [el("div", { className: "empty" }, "ビューはまだありません。好きなアングルで「ビューを保存」を押してください。")]));
    },
  };
  return api;
}
