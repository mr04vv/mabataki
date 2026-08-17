# ADR-0010: 平滑化はコアに置くが Runtime には組み込まない

- ステータス: Accepted
- 日付: 2026-08-16
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md), [ADR-0012](0012-landmark-based-head-pose.md), [ADR-0017](0017-camera-space-transform-outside-runtime.md)

## 背景

トラッキングの生値は `0.52 / 0.48 / 0.54 / 0.49` のように揺れ、そのまま流すと口や頭が震える。
一方で Runtime が入力値を勝手に加工すると、スライダー操作・録画データの再生・テストにおける
再現性が壊れる。

## 決定

`ExponentialSmoother`(時間ベースの指数平滑)を `src/` に置くが、`MabatakiRuntime` には
組み込まない。適用するのは呼び出し側(トラッカー共通層)。

```text
トラッカー固有値 → 正規化 / 較正 → 平滑化 → runtime.update()
```

- `s += (target - s) * (1 - exp(-deltaMs / timeConstant))` — `deltaMs` を取るためフレームレート非依存
- 初回はランプアップせず target にスナップする
- Runtime は渡された値を忠実に評価するだけ

## 影響

- 録画入力や別トラッカーにも同じ平滑化を再利用できる
- tracking と rendering の fps を分離しても平滑化の挙動が変わらない
- Runtime のテストが「入力 → 出力」の純粋な対応で書ける(時間に依存しない)。
  時間に依存するのは [ADR-0011](0011-spring-bindings-for-secondary-motion.md) の物理のみ

## 却下した代替案

- **`Runtime.update()` 内での自動平滑化**: 入力の再現性が失われ、スライダー操作に
  意図しない遅延が乗る
- **デモ側にインラインで EMA を書く**(初期実装): フレームレート依存で、再利用もできない
