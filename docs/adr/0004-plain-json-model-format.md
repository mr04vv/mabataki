# ADR-0004: モデル形式 v1 はプレーン JSON にする

- ステータス: Accepted
- 日付: 2026-08-16
- 関連: [ADR-0002](0002-keyframe-list-interpolation.md), [ADR-0008](0008-rigid-parts-as-separate-parts.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md)

## 背景

独自バイナリ形式 `.avatar`(manifest + atlas + meshes.bin + deformations.bin)の構想があったが、
PoC 段階で優先すべきは品質仮説の検証であり、ロード効率ではない。

## 決定

`version` + `parameters[]` + `parts[]`(`mesh` / `bindings` / 任意の `springBindings`)を持つ
プレーン JSON を v1 とする。

- 頂点座標はテクスチャのピクセル空間
- テクスチャはファイル名参照のみで、モデルには同梱しない
- 外部から来た untrusted な JSON は `validateModel()` で構造検証し、問題があれば
  説明的なメッセージで throw する(パラメータ id / パート id の重複、UV と頂点数の不一致、
  範囲外のインデックス、未宣言パラメータへの binding、キーフレームの昇順違反、デルタ長の不一致)

## 影響

- 人間が読める・編集できる・AI が生成できる。エディタの export / import がそのまま動く
- ロードサイズは非効率(3 パートのサンプルで model.json が約 6000 行)。
  将来 atlas packing / mesh 最適化 / バイナリ化を行うコンパイラを足す余地は残してある
- Authoring 形式(可読性優先)と Runtime 形式(compact / GPU-friendly)を将来分けるとしても、
  現時点では同一で困らない

## 却下した代替案

- **最初から ZIP / バイナリコンテナ**: 早すぎる最適化。品質仮説が通る前に作る価値がない
- **`bindings` → `keyforms` へのリネーム**: 機能上のゲインがない変更で、既存の実装・テスト・
  サンプルモデルを一斉に壊すだけになる
