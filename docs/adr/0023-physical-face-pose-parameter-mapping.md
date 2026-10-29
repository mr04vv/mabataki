# ADR-0023: 頭部ParameterはMediaPipeの物理角度から線形変換する

- ステータス: Accepted
- 日付: 2026-08-25
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0010](0010-smoothing-outside-runtime.md), [ADR-0012](0012-landmark-based-head-pose.md), [ADR-0022](0022-face-local-accessory-projection.md)

## 背景

ランドマーク上の鼻と輪郭の比率は、頭が横を向いたことを安定して検出できる一方、物理角度ではない。
その値を直接`headYaw -1..1`へ較正すると、カメラのyawと作者が作ったKey Poseの向きを
角度単位で対応させられない。MediaPipeの4x4 face transformation matrixをアクセサリー投影で
検証でき、ミラー時の軸と符号もテスト可能になった。

## 決定

- face transformation matrixがある場合、そこから得たyaw / rollのラジアン値を一次入力にする
- Adapter設定で「Parameter ±1が表す物理角度」を宣言し、線形変換して`-1..1`へ制限する
- 既定値は`headYaw ±35°`、`headRoll ±20°`とする
- 行列がないフレームだけ、ADR-0012のランドマーク推定値へフォールバックする
- pitchは`FacePose`として公開するが、モデルに対応ParameterとKey Poseがある場合だけ接続する
- Camera + avatarでは物理rollをCompositorのルートへ適用し、同じrollをRuntimeへ二重適用しない

## 影響

- MediaPipeの検出角度とモデルKey Poseの補間位置を明示的に対応できる
- キャラクターごとの見た目はAdapter設定のフルスケール角度で調整できる
- `@mabataki/core`は角度やMediaPipeを知らず、従来どおり正規化Parameterだけを受け取る
- 2D Key Poseに描かれていない横顔の画素や奥行きは生成されない。幾何的な完全一致には追加Pose、
  顔領域の2.5D化、または3Dモデルが必要になる

## 却下した代替案

- **ランドマーク比率を引き続き一次入力にする**: 角度との対応を宣言できない
- **物理角度をCore APIへ渡す**: Parameterをトラッカー非依存に保つ契約を壊す
- **全アバターへ一律の3D変形を掛ける**: 1枚絵の身体まで変形し、モデル固有の表現を壊す
