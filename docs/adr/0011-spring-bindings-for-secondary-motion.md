# ADR-0011: Secondary Motion は SpringBinding としてモデルに持たせ、step() で進める

- ステータス: Accepted
- 日付: 2026-08-17
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md), [ADR-0010](0010-smoothing-outside-runtime.md)

## 背景

髪・耳・アンテナのような「遅れて付いてくる」動きは、Key Pose 補間とは別系統の仮説
(接着面は親に完全追従し、先端だけが遅れる)であり、キーフレームでは表現できない。

## 決定

`part` に任意フィールド `springBindings?` を追加し、Runtime に時間を進める `step(deltaMs)` を持たせる。

```jsonc
{
  "parameterId": "headYaw",
  "frequencyHz": 2.2,
  "dampingRatio": 0.58,
  "scaleX": 28, "scaleY": 5,
  "weights": [/* 頂点ごとの 0..1 影響度 */]
}
```

- `weights` が `0` の頂点は接着点として固定され、`1` の頂点(先端)が最大の遅れを受ける
- 減衰調和振動子を最大 `1/120` 秒の固定ステップで積分する。`deltaMs` は 250ms でクランプし、
  バックグラウンドタブ復帰時に発散させない
- `update()`(パラメータ設定)と `step()`(時間発展)を分離する。Runtime において
  時間を持つのは物理だけ

## 影響

- 「接着面を維持した Secondary Motion」がモデルデータだけで表現でき、Runtime に
  「髪」「耳」という概念は入らない([ADR-0003](0003-parameter-contract.md) と整合)
- 物理を持たないモデルでは `step()` が即座に return するためコストがゼロ
- 呼び出し側は毎フレーム `step()` を呼ぶ必要がある(物理を使わないなら省略可)

## 却下した代替案

- **parent / pivot / 階層を持つ本格的なボーン機構**: 現時点の要求(接着面の固定 + 先端の遅れ)は
  頂点ごとの weights で表現できる。階層が本当に必要になってから追加する
- **速度を Runtime 内部で数値微分する**: 平滑化前の生値を微分するとノイズが増幅されるため、
  平滑化後の値を外から渡す設計([ADR-0010](0010-smoothing-outside-runtime.md))と整合させた
