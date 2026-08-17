# ADR-0003: 固定・トラッカー非依存・意味を持たないパラメータ契約を唯一の入力境界にする

- ステータス: Accepted
- 日付: 2026-08-16
- 関連: [ADR-0009](0009-renderer-agnostic-runtime-api.md), [ADR-0010](0010-smoothing-outside-runtime.md), [ADR-0012](0012-landmark-based-head-pose.md), [ADR-0015](0015-web-first-minimal-runtime.md)

## 背景

MediaPipe / OpenSeeFace / 録画モーション / スライダー / デバッグ入力のどれからでも同じモデルを
動かしたい。また人外キャラクターを扱う以上、Runtime が「これは顎」「これは髪」と推測すべきではない。

## 決定

Runtime の入力は `Record<string, number>` のみとする。

- トラッカー固有の名前・値域の変換はアダプタ(`demo/face-tracker.ts`)の責務。
  Runtime とモデルは MediaPipe の blendshape 名を直接参照しない
- Runtime はパラメータ id を意味として解釈しない。`mouthOpen = 0.7` は
  「モデルに定義された deformation を 70% 適用する」以上の意味を持たない
- モデルが宣言していない id は黙って無視し、宣言済みの id は宣言された範囲にクランプする

## 影響

- MediaPipe の import はリポジトリ内で `demo/face-tracker.ts` の一箇所のみ
- スライダー・animate・カメラの 3 系統が同じ `runtime.update()` に合流する。
  トラッカーの出力をフィルタせずそのまま渡せる(未宣言 id は無視されるため)
- 「歯が特殊」「耳が特殊」といった差異は API を増やすのではなくモデルデータで吸収する。
  結果として人外キャラクターも人型と同じ経路で扱える
- トラッカー側の値域補正(デッドゾーン、ゲイン等)はアダプタの責務になる → [ADR-0012](0012-landmark-based-head-pose.md)

## 却下した代替案

- **任意パラメータのセマンティクス宣言や制約システム**: v0.1 には不要。固定パラメータで
  Head Avatar の大部分が表現できるという仮説を先に検証する
