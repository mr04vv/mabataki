# Architecture Decision Records

mabataki の設計上の意思決定を、背景・決定・影響・却下した代替案の形で記録する。
コードを読んでも分からない「なぜそうしたか」を残すことが目的で、実装手順は
[`docs/`](../) 直下の計画ドキュメントが担当する。

## 一覧

| # | 決定 | 日付 | ステータス |
| --- | --- | --- | --- |
| [0001](0001-key-poses-over-auto-rig.md) | Auto Rig ではなく作者が作る Key Pose を中心に据える | 2026-08-16 | Accepted |
| [0002](0002-keyframe-list-interpolation.md) | 変形はキーフレーム列 + 区分線形補間で表現する | 2026-08-16 | Accepted |
| [0003](0003-parameter-contract.md) | 固定・トラッカー非依存・意味を持たないパラメータ契約を唯一の入力境界にする | 2026-08-16 | Accepted |
| [0004](0004-plain-json-model-format.md) | モデル形式 v1 はプレーン JSON にする | 2026-08-16 | Accepted |
| [0005](0005-pixijs-renderer.md) | レンダラは PixiJS v8 を借り、コアはレンダラ非依存に保つ | 2026-08-16 | Accepted |
| [0006](0006-zero-dependency-core.md) | コアは依存ゼロ、リポジトリは単一パッケージにする | 2026-08-16 | Superseded by ADR-0018 |
| [0007](0007-tdd-with-colocated-tests.md) | TDD とコロケートしたユニットテストを開発規約にする | 2026-08-16 | Accepted |
| [0008](0008-rigid-parts-as-separate-parts.md) | 剛体として保ちたい要素は別パートに分離する | 2026-08-16 | Accepted |
| [0009](0009-renderer-agnostic-runtime-api.md) | 公開 Runtime API はレンダラ非依存にし、変形済み頂点バッファを返す | 2026-08-16 | Accepted |
| [0010](0010-smoothing-outside-runtime.md) | 平滑化はコアに置くが Runtime には組み込まない | 2026-08-16 | Accepted |
| [0011](0011-spring-bindings-for-secondary-motion.md) | Secondary Motion は SpringBinding としてモデルに持たせ、step() で進める | 2026-08-17 | Accepted |
| [0012](0012-landmark-based-head-pose.md) | 頭部姿勢はランドマーク幾何から推定し、全トラッキング値を較正して渡す | 2026-08-17 | Accepted |
| [0013](0013-local-only-camera-processing.md) | カメラ映像はローカルでのみ処理し、ネットワークに出さない | 2026-08-16 | Accepted |
| [0014](0014-editor-features-on-demand.md) | エディタ機能は必要性が実証された時点で追加する | 2026-08-17 | Accepted |
| [0015](0015-web-first-minimal-runtime.md) | Web-first の最小 Headless Runtime として独立実装する | 2026-08-17 | Accepted |
| [0016](0016-occlusion-with-parts-and-masks.md) | 遮蔽表現は別 Part + Clip Mask で作る | 2026-08-17 | Proposed |
| [0017](0017-camera-space-transform-outside-runtime.md) | カメラ空間の配置はRuntime外で適用する | 2026-08-17 | Accepted |
| [0018](0018-pnpm-workspace-package-boundaries.md) | pnpm workspaceでRuntime・Adapter・Renderer・Web統合を分離する | 2026-08-17 | Accepted |

## この記録から読み取れる設計の芯

- **意味は Runtime ではなくモデルデータが持つ**(0001 / 0003 / 0008 / 0011)。
  Runtime は「これは顎」「これは髪」を知らないため、人外キャラクターも同じ経路で動く
- **境界はworkspace packageで守る**(0005 / 0009 / 0010 / 0012 / 0018)。
  `@mabataki/core` は依存ゼロ、トラッカー・レンダラ・Web統合はoptional package
- **一般化は必要性が実証されてから**(0002 / 0004 / 0011 / 0014)。
  ただし将来の破壊的変更が確定している箇所(キーフレーム列)は先に手を打つ
- **競争軸は機能数ではなく Web 組み込みの小ささ**(0006 / 0009 / 0015)。
  汎用 Puppet 環境を複製せず、Parameter から頂点を得る実行層に集中する
- **ピクセルの役割が異なるなら Part を分ける**(0008 / 0016)。
  剛体や遮蔽物を同じ Mesh の頂点操作だけで解決しない

## 書き方

- ファイル名は `NNNN-kebab-case-title.md`。番号は採番順で欠番を作らない
- ステータスは `Proposed` / `Accepted` / `Deprecated` / `Superseded by ADR-NNNN`
- 決定を覆すときは既存 ADR を書き換えず、新しい ADR を追加して旧 ADR のステータスを
  `Superseded by ...` に変更する(記録の目的は履歴を残すことにあるため)
- 「やらないと決めたこと」も却下した代替案として残す。同じ議論を繰り返さないため
