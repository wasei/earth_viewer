// ビューの正本と永続化（IndexedDB）、サムネイル生成。

const DB = "earthviewer";
const open = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("views", { keyPath: "id" });
      r.result.createObjectStore("thumbs", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

export const loadViews = async () =>
  ((await run("views", "readonly", (s) => s.getAll())) ?? []).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
export const putView = (v) => run("views", "readwrite", (s) => s.put(v));
export const putViews = (list) => run("views", "readwrite", (s) => { list.forEach((v) => s.put(v)); });
export const getThumb = async (id) => (await run("thumbs", "readonly", (s) => s.get(id)))?.blob;
export const putThumb = (id, blob) => run("thumbs", "readwrite", (s) => s.put({ id, blob }));
export async function deleteView(id) {
  await run("views", "readwrite", (s) => s.delete(id));
  await run("thumbs", "readwrite", (s) => s.delete(id));
}

/** camera: camera.getState() の戻り値 */
export const createView = (name, camera) => ({
  id: crypto.randomUUID(),
  name,
  note: "",
  createdAt: Date.now(),
  order: Date.now(), // 並び順。並び替え後は 0,1,2… に振り直す
  camera,
});

/** 今の描画をそのまま縮小JPEGにする（待たない）。描画直後の同じタスク内でコピーする（真っ黒対策） */
export function captureNow(viewer, maxW = 320) {
  viewer.render();
  const src = viewer.canvas;
  const w = Math.min(maxW, src.width);
  const h = Math.round((w * src.height) / src.width);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.8));
}
