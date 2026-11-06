import { describe, it, expect, vi } from "vitest";
import { createUI } from "./ui.js";

const make = () => {
  const root = document.createElement("div");
  document.body.append(root);
  const cb = Object.fromEntries(
    ["onFov", "onLock", "onLimit", "onBasis", "onPreset", "onSave", "onSearch", "onRestore", "onRename", "onDelete", "onReorder", "onExport", "onImport", "onQuality"].map((k) => [k, vi.fn()])
  );
  return { root, cb, ui: createUI(root, cb) };
};
const view = (id, name) => ({ id, name });

describe("UI スモークテスト", () => {
  it("情報とコンパスを更新できる", () => {
    const { root, ui } = make();
    ui.update({ agl: 25.34, asl: 61.2, lat: 35.68, lon: 139.76, pitch: -35, fov: 60, heading: 272 });
    expect(root.querySelector(".hero-v").textContent).toBe("25 m"); // 高さは整数表示
    expect(root.querySelector(".compass-read").textContent).toBe("272°");
    expect(root.textContent).not.toContain("方位"); // 方位は情報欄から外した
  });
  it("速度プリセットと高さ制限・ロックのコールバック", () => {
    const { root, cb } = make();
    const segs = [...root.querySelectorAll(".seg")];
    expect(segs.map((b) => b.textContent)).toEqual(["精密", "低速", "高速"]);
    expect(segs[2].classList.contains("on")).toBe(true); // 初期は「高速」
    expect(root.textContent).toContain("移動速度");
    segs[1].click();
    expect(cb.onPreset).toHaveBeenCalledWith("walk");
    expect(segs[1].classList.contains("on")).toBe(true);
    const chips = Object.fromEntries([...root.querySelectorAll(".chip")].map((b) => [b.textContent, b]));
    expect(chips["高さ制限"].classList.contains("on")).toBe(true); // 初期ON
    chips["高さ制限"].click();
    expect(cb.onLimit).toHaveBeenCalledWith(false);
    expect(chips["高さ固定"].classList.contains("on")).toBe(false); // 初期は自由移動
    chips["高さ固定"].click();
    expect(cb.onLock).toHaveBeenCalledWith(true);
  });
  it("高さの基準を切り替えると、大きく出す値が 地上高 ⇄ 海抜 に入れ替わる", () => {
    const { root, ui, cb } = make();
    ui.update({ agl: 107.2, asl: 116.4, lat: 35.68, lon: 139.76, pitch: -35, fov: 60, heading: 0 });
    expect(root.querySelector(".hero .l").textContent).toBe("地上高");
    expect(root.querySelector(".hero-v").textContent).toBe("107 m");
    [...root.querySelectorAll(".chip")].find((b) => b.textContent.startsWith("基準")).click();
    expect(cb.onBasis).toHaveBeenCalledWith("sea");
    expect(root.querySelector(".hero .l").textContent).toBe("海抜");
    expect(root.querySelector(".hero-v").textContent).toBe("116 m"); // Google Earth Proの「視点の高度」と同じ値
  });
  it("ガイドはクロスだけで、フレーム比率の選択肢は無い", () => {
    const { root } = make();
    expect(root.querySelector("select")).toBeNull();
    const cross = [...root.querySelectorAll(".chip")].find((b) => b.textContent === "クロス");
    const guide = root.querySelector(".guide");
    expect(guide.hidden).toBe(true);
    cross.click();
    expect(guide.hidden).toBe(false);
    cross.click();
    expect(guide.hidden).toBe(true);
  });
  it("ビューを描画し、ドロップで並び替えコールバックが呼ばれる", () => {
    const { root, ui, cb } = make();
    ui.renderViews([view("a", "A"), view("b", "B")], new Map());
    const cards = root.querySelectorAll(".card");
    expect(cards).toHaveLength(2);
    const ev = (type) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      dataTransfer: { setData() {}, effectAllowed: "" }, clientX: 0,
    });
    cards[0].dispatchEvent(ev("dragstart"));
    cards[1].dispatchEvent(ev("drop"));
    expect(cb.onReorder).toHaveBeenCalledWith("a", "b", false);
  });
  it("削除は2回クリックで確定する", () => {
    const { root, ui, cb } = make();
    ui.renderViews([view("a", "A")], new Map());
    const del = root.querySelector(".del");
    del.click();
    expect(cb.onDelete).not.toHaveBeenCalled();
    del.click();
    expect(cb.onDelete).toHaveBeenCalledWith("a");
  });
  it("3D品質は5段階のスライダーで、最軽量が初期値", () => {
    const { root, cb } = make();
    const group = [...root.querySelectorAll(".group")].find((g) => g.textContent.includes("3D品質"));
    const s = group.querySelector("input[type=range]");
    expect(s.value).toBe("0");
    expect(group.textContent).toContain("最軽量");
    s.value = "4";
    s.dispatchEvent(new Event("input"));
    expect(cb.onQuality).toHaveBeenCalledWith(4);
    expect(group.textContent).toContain("最高精細");
  });
  it("設定は枠付きのグループにまとまっている", () => {
    const { root } = make();
    const titles = [...root.querySelectorAll(".group > .l")].map((n) => n.textContent);
    expect(titles).toEqual(["カメラ", "移動速度", "高さ", "ガイド", "3D品質"]);
  });
  it("初回の読み込み表示は、閉じたら再表示しない", () => {
    const { root, ui } = make();
    const el = root.querySelector(".loading");
    expect(el.hidden).toBe(true);
    ui.setLoading(true);
    expect(el.hidden).toBe(false);
    el.click(); // クリックで閉じる
    expect(el.hidden).toBe(true);
    ui.setLoading(false);
    ui.setLoading(true);
    expect(el.hidden).toBe(true);
  });
});
