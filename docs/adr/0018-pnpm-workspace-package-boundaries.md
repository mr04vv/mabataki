# ADR-0018: pnpm workspaceでRuntime・Adapter・Renderer・Web統合を分離する

- ステータス: Accepted
- 日付: 2026-08-17
- 関連: [ADR-0005](0005-pixijs-renderer.md), [ADR-0006](0006-zero-dependency-core.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md), [ADR-0017](0017-camera-space-transform-outside-runtime.md)

## 背景

PoC初期はCoreと単一デモだけだったため、ディレクトリ規律で境界を守る単一packageが最小だった。
その後、MediaPipe Adapter、PixiJS Renderer、Camera Compositor、人物Segmenter、WebRTC向け
Canvas出力が必要になり、ルートpackageのdependenciesだけではCore利用者が不要な実装も取得する構造になった。

## 決定

pnpm workspaceへ移行し、次の責務を物理packageとして分離する。

- `@mabataki/core`: Model、Parameter、変形、Physics、Smoothing。package dependenciesはゼロ
- `@mabataki/mediapipe`: Face tracking、較正、Landmark、人物Segmentation
- `@mabataki/pixi`: Coreが返す頂点バッファのPixiJS描画
- `@mabataki/web`: Canvas captureと音声track合成。Signalingや通話roomは所有しない
- `@mabataki/demo`: Editor、Viewer、Camera Compositor、サンプルasset

依存方向は `demo → optional packages → core` とし、Coreから外側へのimportを禁止する。
Coreのみ公開可能とし、optional packagesはAPIが安定するまでprivateにする。

## 影響

- Core利用者はMediaPipeやPixiJSをinstallせず、変形Runtimeだけを利用できる
- package単位のbuild/typecheckにより、責務境界を相対importの慣習ではなくmodule解決で検証できる
- RendererやTrackerを差し替えるプロダクト統合が明確になる
- package build順序、workspace link、複数tsconfigの管理コストが増える
- ADR-0006の「依存ゼロCore」は維持し、「単一package」の決定だけを置き換える

## 却下した代替案

- **単一packageを継続**: PoCでは簡単だが、Coreだけを導入する契約とinstall境界を表現できない
- **format/editor/generatorまで即時分割**: 現時点では独立APIが固まっておらず、package運用だけが先行する
- **WebRTC signalingをweb packageへ含める**: LiveKit等の既存基盤と競合し、Runtimeの組み込みやすさを損なう
