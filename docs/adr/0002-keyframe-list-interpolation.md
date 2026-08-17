# ADR-0002: 変形はキーフレーム列 + 区分線形補間で表現する

- ステータス: Accepted
- 日付: 2026-08-16
- 関連: [ADR-0001](0001-key-poses-over-auto-rig.md), [ADR-0004](0004-plain-json-model-format.md)

## 背景

当初の設計メモでは、変形を次の式で表現していた。

```text
finalVertex = baseVertex + deformationDelta * parameterValue
```

これは「基準 + 1 ポーズ」しか表現できない。`mouthOpen`(0 / 1)は表せるが、`headYaw` は
`-1` / `0` / `+1` の 3 キーを要求するため、そのまま進めると Head Yaw の実装時点で
モデルフォーマットの破壊的変更が必要になる。

## 決定

Binding は `parameterId` と、`value` 昇順にソートされたキーフレーム列を持つ。
Runtime は隣接キー間を区分線形補間し、範囲外は端のキーにクランプする。

```ts
interface Binding {
  parameterId: string
  keyframes: { value: number; deltas: number[] }[]  // value 昇順
}
```

## 影響

- 2 キー(`mouthOpen` 0/1)と 3 キー(`headYaw` -1/0/+1)が同じコードパスで動く。
  実際に headYaw はコアの変形ロジックを一切変更せずに載った
- 線形補間は回転を弦で近似するため中間で痩せるが、作者が中間キー(例: 0.5)を追加すれば
  モデルデータ側で緩和できる。Runtime に補間方式の切り替えを持たせる必要がない
- 追加実装コストは当初案に対して約 10 行だった

## 却下した代替案

- **`delta * param` の単純乗算**: 上記の理由でフォーマット破壊が確定していた
- **Yaw × Pitch の 2D キーポーズグリッド**: 独立デルタの加算合成で品質が足りない場合の
  将来課題として先送りする(v0.1 では入れない)
