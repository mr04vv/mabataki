# ADR-0020: 複数のParameter入力はRuntimeの前で所有範囲を指定して合成する

- ステータス: Accepted
- 日付: 2026-08-23
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0010](0010-smoothing-outside-runtime.md), [ADR-0019](0019-declarative-motion-clips.md)

## 背景

カメラ、音声、自動Motion、手動入力を同時に使うと、複数Sourceが同じParameterを更新し得る。
アプリごとにObjectを上書きすると、例えば音声の`mouthOpen`をIdle Motionが消すなど、所有権が
代入順へ隠れてしまう。

## 決定

`@mabataki/core`に`ParameterComposer`を置き、Runtimeへ渡す前にSourceをLayerとして合成する。

- Layerは値、`include`による所有Parameter、Weight、`override` / `additive`を持つ
- 後のOverrideを優先し、結果をModelのParameter範囲へClampする
- Trackerや音声という固有名はCoreへ入れず、Sourceの意味はアプリが決める
- `MabatakiRuntime.update()`は引き続き完成したParameter集合だけを受け取る

## 影響

口は音声、頭部はTracker、瞬きはMotionという責務を明示できる。Source固有の平滑化や
接続状態はRuntimeの外に残るため、Coreの決定性も維持される。

## 却下した代替案

- **RuntimeへTracker/Voice用メソッドを追加**: 入力技術の意味がCoreへ漏れる
- **Object spreadの順番だけで合成**: 所有範囲とBlend規則を検証できない
