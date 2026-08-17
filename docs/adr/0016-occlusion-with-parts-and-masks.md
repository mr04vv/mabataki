# ADR-0016: 遮蔽表現は別 Part + Clip Mask で作る

- ステータス: Proposed
- 日付: 2026-08-17
- 関連: [ADR-0005](0005-pixijs-renderer.md), [ADR-0008](0008-rigid-parts-as-separate-parts.md), [ADR-0014](0014-editor-features-on-demand.md)

## 背景

左右独立の Blink を、白目・輪郭・肌色の上まぶたが一枚に焼き込まれた `eyes.png` の Mesh 変形で
試作した。目全体を中央へ圧縮すると、白目とまぶたが同時に細くなる。上まぶた領域だけを下へ伸ばす
方式でも、既存ピクセルを大きく引き伸ばすため、キャラクター固有の閉じ目として不自然になった。

ここで必要なのは変形だけではなく「上まぶたが白目を覆う」という遮蔽関係である。同じ Texture と
Mesh に描かれたピクセル同士では、一方だけを他方の前へ移動して隠すことができない。

## 提案

遮蔽を伴う表情は、意味の異なる画像を別 `part` に分け、遮蔽物へ Clip Mask を適用する。
Blink の最小構成は次とする。

```text
eye base (white / pupil)
  └─ eyelid-left / eyelid-right (moving occluders, clipped to each eye)
       └─ eye outline (drawn in front to hide seams)
```

- `eyeOpenLeft` / `eyeOpenRight` は左右のまぶた Part を独立して動かす
- まぶた画像は目より大きくてよい。目の内側を表す Mask から外れたピクセルは Renderer が捨てる
- 輪郭を最前面に描画し、Mask 境界やアンチエイリアスの継ぎ目を隠す
- Runtime は引き続き頂点と Parameter を評価するだけとし、Mask の適用は Renderer の責務にする
- Model Format の Mask 参照方法と PixiJS での実装を検証してから Accepted に変更する

## 期待される影響

- 既存のまぶた絵を引き伸ばさず、作者が描いた閉じ目の形を保持できる
- 左右独立の Blink と中間状態を、同じ Parameter / Key Pose 経路で扱える
- Model Format に Part 間の Mask 参照、Renderer に Alpha または Geometry Mask が必要になる
- Authoring Tool に Mask 対象と描画順を設定する UI が必要になる

## 却下した代替案

- **単一 Mesh の上下圧縮**: 白目・輪郭・まぶたが同時に変形し、実機確認で不自然だった
- **既存まぶた領域の引き伸ばし**: 遮蔽ではなく Texture stretch になり、閉じ目の形を制御できない
- **open / closed Texture の単純 Crossfade**: 最小デモには使えるが、中間で二つの目が重なりやすく、
  左右独立にすると Texture の組み合わせが増える
- **Mask なしの移動まぶた**: 目の輪郭からはみ出すため、モデル作者が安全な可動範囲を手作業で
  制限し続ける必要がある
