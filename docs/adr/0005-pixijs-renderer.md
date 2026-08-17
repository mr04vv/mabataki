# ADR-0005: レンダラは PixiJS v8 を借り、コアはレンダラ非依存に保つ

- ステータス: Accepted
- 日付: 2026-08-16
- 関連: [ADR-0006](0006-zero-dependency-core.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md)

## 背景

Renderer を自前 WebGL で書くか、既存ライブラリを使うかの判断。現段階の目的は
「手動 Key Pose + 補間で品質が出るか」の検証であり、描画基盤の自作ではない。

## 決定

デモ側で PixiJS v8 を使う。テクスチャ読み込み、シーングラフ、Mesh プリミティブ、
マスク、GPU 描画を借りる。実装は `MeshGeometry`(positions / uvs / indices)+ `Mesh` で、
毎フレーム `geometry.getBuffer('aPosition')` を更新する。

`src/` には持ち込まない。将来 dependency size / batching / multi-avatar 最適化が
ボトルネックになった時点で、独自 Renderer を再検討する。

## 影響

- 品質検証に集中できる
- コアは `Float32Array` を返すだけなので、レンダラ差し替えのコストが低い
  → [ADR-0009](0009-renderer-agnostic-runtime-api.md)
- PixiJS はデモ側の依存であり、コアの利用者には強制されない

## 却下した代替案

- **最初から自前 WebGL**: ボトルネックが分かる前に書くと、検証速度を落とすだけになる
