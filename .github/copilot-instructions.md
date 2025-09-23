# Copilot Instructions for Cesiumjs Earth Viewer (React + Vite)

## プロジェクト概要

- **React + Vite** 構成。`src/`配下に主要な React コンポーネント。
- **Cesium** を使った地球ビューア。`cesium_earth_viewer_react.jsx`がコア。
- Vite の HMR（Hot Module Replacement）と ESLint による品質管理。

## 主要ファイル・ディレクトリ

- `src/cesium_earth_viewer_react.jsx`: Cesium 地球ビューアの全ロジック。アクセストークンやカメラ初期位置など定数多数。
- `src/App.jsx`, `src/main.jsx`: React アプリのエントリーポイント。
- `vite.config.js`: Vite と Cesium プラグインの設定。`vite-plugin-cesium`必須。
- `eslint.config.js`: ESLint の設定。未使用変数は大文字・アンダースコア始まりのみ許容。
- `.env`: Cesium Ion アクセストークンは `VITE_CESIUM_ION_ACCESS_TOKEN` で管理（ファイルは未検出、必要なら新規作成）。

## ビルド・開発・Lint

- 開発サーバー起動: `npm run dev`
- 本番ビルド: `npm run build`
- Lint 実行: `npm run lint`
- プレビュー: `npm run preview`

## コーディング規約・パターン

- React 関数コンポーネントのみ使用。
- Cesium のグローバル設定は `window.CESIUM_BASE_URL` で指定。
- カメラ初期位置やアセット ID 等は定数で管理。
- 環境変数は `import.meta.env` で取得。
- CSS は各コンポーネントで個別インポート。
- 未使用変数は大文字・アンダースコア始まりのみ許容（ESLint 設定参照）。

## 外部連携・依存

- Cesium 公式 npm パッケージ利用。
- Vite 用 Cesium プラグイン（`vite-plugin-cesium`）必須。
- React 19 系。

## よくある落とし穴

- Cesium Ion アクセストークンが未設定だと地図表示不可。
- `window.CESIUM_BASE_URL`の指定漏れでリソースロード失敗。
- Vite プラグイン未設定だと Cesium が正しく動作しない。

## 参考コマンド

```bash
npm run dev      # 開発サーバー
npm run build    # 本番ビルド
npm run lint     # Lintチェック
npm run preview  # ビルド後のプレビュー
```

## 追加情報

- 主要なロジックは `src/cesium_earth_viewer_react.jsx` に集約。
- ルート直下の `README.md` も参照可能。
- 質問や不明点はこのファイルに追記・修正してください。
