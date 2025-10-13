# Earth Viewer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ドローンのような自由な視点操作で、3D 空間のビューを記録・共有するツール。

![アプリケーションのメイン画面](./images/main_screen.png)

## What is this?

Google Earth のカメラ操作は、ある地点を周回する「オービット」が中心です。そのため、真横へのスライドや、真上への上昇といった、ドローンのような自由なカメラワークは直感的ではありませんでした。

Earth Viewer は、この純粋な**パン・ドリー（垂直・水平移動）操作**に特化しています。

キーボードで意のままに視点を動かし、気に入ったアングルを「ビュー」として保存。ビュー同士を瞬時に切り替えながら比較し、最終的には KML で書き出して Google Earth で共有することもできます。

建築・不動産の眺望確認や、映像制作でのアングル探求など、より緻密な視点操作が求められるシーンで役立ちます。

## Features

- 🚀 **自由なカメラワーク:** キーボードによる直感的な垂直・水平移動。
- 📷 **ビューの保存と比較:** 気に入ったアングルを名前を付けて保存し、ワンクリックで切り替え。
- ⇄ **KML 連携:** 保存したビューリストを KML でエクスポート。KML ファイルのインポートにも対応。
- 🛰️ **詳細なカメラ情報:** 緯度経度、海抜高度、カメラの向きなどをリアルタイム表示。
- 🌊 **正確な海抜高度:** EGM96 ジオイドモデルを考慮した、実践的な海抜高度計算。

## How to Use

1.  **探す:** マウスとキーボードで、ドローンを飛ばすように好きなアングルを探します。
2.  **保存する:** 「現在のビューを保存」ボタンで、名前を付けてビューを記録します。
3.  **切り替える:** 保存したビューリストをクリックすれば、その視点にジャンプします。
4.  **連携する:** 「KML エクスポート/インポート」で、Google Earth など他のツールと視点を共有できます。

![UIのスクリーンショット](./images/ui_overview.png)
_(↑ ここにビュー保存パネルや KML ボタンを含む UI 全体のスクリーンショットを挿入すると分かりやすいです)_

---

## For Developers

### Tech Stack

- React
- Cesium.js
- egm96-universal

### Getting Started

1.  **Get Cesium Ion Access Token**

    - [Cesium Ion](https://cesium.com/ion/) でアカウント（無料プランで OK）を作成し、アクセストークンをコピーします。

2.  **Create `.env` file**

    - プロジェクトのルートに `.env` ファイルを作成し、以下を記述します。

    ```.env
    VITE_CESIUM_ION_ACCESS_TOKEN="YOUR_ACCESS_TOKEN_HERE"
    ```

3.  **Install & Run**

    ```bash
    # Clone this repository
    git clone [repository_url]
    cd [repository_name]

    # Install dependencies
    npm install

    # Run the app
    npm start
    ```

    Now open `http://localhost:3000` in your browser.

## Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk.

## License

[MIT](LICENSE)
