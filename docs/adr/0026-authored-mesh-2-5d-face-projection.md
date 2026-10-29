# ADR-0026: カメラ上のAvatarはAuthoring済みMeshを2.5D投影する

- ステータス: Accepted
- 日付: 2026-08-25
- 関連: [ADR-0017](0017-camera-space-transform-outside-runtime.md), [ADR-0023](0023-physical-face-pose-parameter-mapping.md), [ADR-0025](0025-neutral-delta-face-retargeting.md)

## 背景

MediaPipeの468点を絶対座標またはNeutral差分としてAvatarへ転写すると、横向きには強く追従する一方、
人間の顔比率と局所変形がキャラクターへ入り込み、Authoringした原型を維持できない。
ただし、MediaPipeの3D姿勢によるyaw追従は活用したい。

## 決定

Camera + avatarモードはモデルのAuthoring済みMeshを直接描画し、顔領域だけを浅い3D曲面として投影する。

- MediaPipeからは画面上の顔位置・顔幅と、Transformation Matrix由来のyaw・pitch・rollだけを使う
- 正面較正時の姿勢をNeutralとして保存し、以後は相対回転を適用する
- モデルの顔領域に連続的な奥行きを与え、範囲外へ滑らかにWeightを減衰させる
- 横向きで観測された顔幅はyawのforeshorteningを戻してから、同じyawで投影する
- `mouthOpen`とBlinkはMediaPipe頂点ではなく、Runtimeの既存Key Poseで変形する
- `headYaw`と`headRoll`のKey PoseはCamera overlayでは二重適用せず、独立Avatar表示では維持する

## 影響

- キャラクターの輪郭、身体、テクスチャ、手作業の表情Meshを維持できる
- 横向きはMediaPipeの物理姿勢に連続追従し、1枚絵として可能な範囲で遠近を表現する
- 2.5D領域はキャラクターごとにAuthoring可能な設定として、将来Model Formatへ移せる
- 投影はCamera Compositorに留まり、`@mabataki/core`へMediaPipe依存を入れない
- 1枚絵に存在しない側面画素や完全な自己遮蔽は生成できない

## 却下した代替案

- **468点をNeutral差分で転写する**: 絶対座標より原型は残るが、人間由来の局所変形が不自然になる
- **全身へ一様な3D回転を適用する**: 顔のyawに身体と背景まで巻き込まれる
- **yaw Key Poseだけを使う**: Authoring表現には有効だが、カメラ上の物理姿勢との同期精度が下がる
