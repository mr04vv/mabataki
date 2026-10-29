# ADR-0022: 顔アクセサリーは2Dアンカーと3D姿勢を合成して投影する

- ステータス: Accepted
- 日付: 2026-08-24
- 関連: [ADR-0012](0012-landmark-based-head-pose.md), [ADR-0017](0017-camera-space-transform-outside-runtime.md), [ADR-0018](0018-pnpm-workspace-package-boundaries.md)

## 背景

目尻ランドマークだけでアクセサリーをSpriteとして配置すると、正面の位置・大きさ・rollには追従できるが、
yaw時も正面形状のまま残る。顔に貼り付いたように見せるには、近い側と遠い側で異なる遠近変形が必要になる。

## 決定

カメラ用アクセサリーは、次の情報をRuntime外のCompositorで合成する。

- 目尻ランドマークの中点・間隔・角度で、画面上の位置・距離・rollを決める
- MediaPipeの4x4 canonical-face transformを検証し、yaw / pitchを取り出す
- 2Dアクセサリーテクスチャを格子Meshにし、軽量な透視投影で各頂点を更新する
- yawで既に短く見える目の間隔を正面相当に補正してからMeshへyawを適用し、短縮を二重適用しない
- 変換行列が得られない場合だけ、較正済み`headYaw`を補助入力として使う

## 影響

- 正面では従来のSprite配置と同じ見た目を保ち、横向きでは近いレンズ側が大きくなる
- `@mabataki/mediapipe`は任意の`facePose`を返すが、`AvatarParameters`の算出は引き続き
  ランドマーク方式とする。ADR-0012のRuntime入力規約は変わらない
- `@mabataki/core`、モデル形式、Pixi Rendererの公開APIは変更されない
- これは2.5D投影であり、顔による遮蔽やテンプルを含む完全な3D表現は行わない

## 却下した代替案

- **SpriteのscaleXだけをyawで縮める**: 左右の遠近差がなく、顔に貼り付いて見えない
- **変換行列をRuntime Parameterへ入れる**: トラッカーとカメラ空間の責務がCoreへ漏れる
- **最初から完全な3Dアクセサリーにする**: 現在の2Dアセット制作フローに対して実装・制作コストが大きい
