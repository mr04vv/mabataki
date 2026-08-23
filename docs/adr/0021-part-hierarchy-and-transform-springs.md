# ADR-0021: 剛体Partは階層Transformで接続し、親とRootの遅れをSpringで表す

- ステータス: Accepted
- 日付: 2026-08-23
- 関連: [ADR-0008](0008-rigid-parts-as-separate-parts.md), [ADR-0011](0011-spring-bindings-for-secondary-motion.md), [ADR-0017](0017-camera-space-transform-outside-runtime.md)

## 背景

手、帽子、耳、髪を別画像にするとMeshの歪みは避けられるが、同一サイズPNGを重ねる規約だけでは
局所Pivotや親子接続を表せない。また従来のSpringはParameterに対する頂点の遅れだけで、浮遊の
Root移動や親Partの回転には反応しなかった。

## 決定

Model v1の後方互換な任意フィールドとして、Partへ次を追加する。

- `parentId`とLocal `transform`で剛体Hierarchyを作る
- `transformBindings`でParameter Key PoseをPart Transformの差分へ補間する
- `transformSpringBindings`でParameter、親Transform、Root Motionの遅れをLocal Transformへ加える
- Runtimeは`getPartPose()` / `getPartTransform()`でRenderer非依存の結果を返す
- Root Motionは`step(deltaMs, rootMotion)`へDriverとして渡すだけで、画面配置は引き続きRendererが行う
- Parent参照とCycleはModel読み込み時に拒否する

## 影響

別画像の手や装備を変形させず追従させられ、髪や尻尾を全身移動へ遅れて反応させられる。既存Modelは
全PartがRoot直下・Identity Transformとしてそのまま動く。

## 却下した代替案

- **全てを頂点変形する**: 剛体画像まで歪み、Pivotと接続関係がデータ化されない
- **PixiJS ContainerだけにHierarchyを持つ**: 他Rendererで同じModelの動作を再現できない
- **Root MotionをRuntimeが描画へ適用する**: Renderer非依存の境界を崩す
