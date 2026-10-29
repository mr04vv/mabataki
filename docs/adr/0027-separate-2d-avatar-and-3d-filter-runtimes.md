# ADR-0027: 2D Avatar Runtimeと3D Face Filter Runtimeを分離する

- ステータス: Accepted
- 日付: 2026-08-25
- 関連: [ADR-0015](0015-web-first-minimal-runtime.md), [ADR-0018](0018-pnpm-workspace-package-boundaries.md), [ADR-0022](0022-face-local-accessory-projection.md)

## 背景

Mabatakiの2D Runtimeは、作者が作ったKey PoseをParameterで補間することに価値がある。一方、
MeetやJeeliz型のリアルなフィルターは、顔へ3D Assetを固定し、Depth Occlusion、Material、
Morph Targetを描画する。2D MeshへMediaPipeの顔面形状を転写して両者を兼ねると、
キャラクターの原型と3D追従のどちらも不安定になる。

## 決定

2D Avatarと3D Face Filterは同じCamera/Compositorから利用できる独立Runtimeとして持つ。

- `@mabataki/core`はParameterから2D頂点・Part Transform・Physicsを求める
- `@mabataki/ar`はFilter Manifest、Tracker非依存Frame、顔相対Pose解決を持つ
- `@mabataki/pixi`はCoreの2D描画だけを持つ
- `@mabataki/three`はARのThree.js描画、glTF読込、Morph Target接続を持つ
- `@mabataki/mediapipe`は両Runtimeの外側で、姿勢・Landmark・Blendshapeを供給する
- `apps/demo`がCamera、Video、Renderer、Effect Assetを合成する

Filter Manifestは`accessory`と`face-mask`を区別し、Asset、基準顔幅、顔幅単位の位置、
回転、Scale、Occlusion、表情とMorph Targetの対応を宣言する。

## 影響

- 2D CoreへThree.js、MediaPipe、Camera依存を入れずにAR機能を追加できる
- アクセサリー、全面マスク、顔ペイントをAR側で段階的に増やせる
- glTF/GLBを共通Asset形式にでき、将来Filter EditorからManifestを書き出せる
- アプリは用途に応じて2Dだけ、ARだけ、または両方を選べる
- Video通話のSignalingやRoom管理は引き続きリポジトリへ含めない

## 却下した代替案

- **Coreへ3D Filterを追加する**: 軽量な2D Runtimeの依存と責務が崩れる
- **PixiJSだけで3D Filterを描く**: glTF、PBR、Depth Occlusion、Morph Targetの実装負担が大きい
- **MediaPipe Face Meshを2D Avatarへ直接転写する**: キャラクターの原型を維持できない
