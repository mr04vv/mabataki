# ADR-0009: 公開 Runtime API はレンダラ非依存にし、変形済み頂点バッファを返す

- ステータス: Accepted
- 日付: 2026-08-16
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0005](0005-pixijs-renderer.md), [ADR-0010](0010-smoothing-outside-runtime.md), [ADR-0011](0011-spring-bindings-for-secondary-motion.md), [ADR-0015](0015-web-first-minimal-runtime.md), [ADR-0017](0017-camera-space-transform-outside-runtime.md)

## 背景

`validateModel` / `ParameterStore` / `applyDeformations` は揃っていたが、それらを束ねる公開 API が
無く、デモが個別に組み立てていた。v0.0.1 のマイルストーンを
「ソースコードを書き換えず、モデルデータの変更だけでキャラクターの動きを変えられる状態」と定義した。

## 決定

レンダラを含まない Runtime API を公開する。

```ts
const model = await loadModel('/models/character/model.json')
const runtime = new MabatakiRuntime(model)

runtime.update({ headYaw: -0.4, mouthOpen: 0.72 })  // 未宣言 id は無視、宣言済みは clamp
runtime.step(16.7)                                   // 任意のスプリング物理を進める
const positions = runtime.getPartVertices('face')    // レンダラはこれを描くだけ
```

- `getPartVertices` は再利用バッファを返す(read-only 規約。保持するならコピーする)
- dirty フラグを持ち、`update` / `step` が無ければ再計算しない
- `loadModel` は fetch + `validateModel` のみ。**テクスチャ解決はしない**
  (コアの依存ゼロを守るため。ファイル名からの画像解決はレンダラ側の責務)

## 影響

- `viewer.html` がモデル固有のコードを一切持たずに動く。これが「データ駆動である」ことの証明になっている
- tracking 30fps / rendering 60fps のとき、変形計算がフレームごとに走らない
- バッファ再利用によりフレームごとのアロケーションが無い
- エディタ(`demo/main.ts`)は Runtime 経由に書き換えていない。エディタは
  「選択中のキーポーズを生で表示する」という Runtime とは異なる表示モードを持つ、正当な別経路

## 却下した代替案

- **`createAvatar({ canvas, model })` 型のレンダラ込みファサード**: 呼び出しは短くなるが、
  Runtime とレンダラが再結合し、[ADR-0005](0005-pixijs-renderer.md) の差し替え余地を失う
- **`loadModel` がテクスチャまで解決する**: コアがブラウザの画像 API に依存してしまう
