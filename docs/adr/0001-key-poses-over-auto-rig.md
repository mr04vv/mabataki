# ADR-0001: Auto Rig ではなく作者が作る Key Pose を中心に据える

- ステータス: Accepted
- 日付: 2026-08-16
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0008](0008-rigid-parts-as-separate-parts.md), [ADR-0014](0014-editor-features-on-demand.md)

## 背景

ビデオ通話向けの 2D Head Avatar を作るにあたり、Auto Rig 方式を実地検証した。

- **See-through**(単一画像のレイヤー分解): 人型では興味深いが、人外キャラクターでは分解品質が
  厳しかった。そもそも Layer Decomposition が担当範囲で、Mesh / Key Pose / Physics までは解決しない
- **Anime2.5DRig**(PSD → 自動リグ): レイヤーを正しく持つ PSD を用意すれば動くところまで確認した。
  ただし Head Turn は layer depth + parallax + shear による疑似 3D で、頬・目・鼻・輪郭そのものが
  「作者の意図した横向きの形」に変形するわけではない。口は `mouth_open` / `mouth_close` の差分切替が
  中心で、「歯は上顎側に残したまま下側だけ開く」といったキャラクター固有の構造を中間フレームまで
  高品質に保証することが難しい

加えて Auto Rig は「これは顔」「これは目」「これは髪」という semantic assumption を必然的に持つため、
人外キャラクターではその仮定自体が品質リスクになる。

## 決定

Auto Rig をコアから外す。

```text
PSD / PNG → 最小 Authoring Tool → 作者が作った Key Pose → Runtime が補間
```

See-through や Anime2.5DRig は、将来必要になれば任意の Importer / 前処理として扱い、
コア依存にはしない。Runtime が特定ツールの semantic layer 名に依存することも避ける。

## 影響

- 制作工数(Authoring Cost)は増えるが、品質・再現性・人外対応の制御性を得る
- 「自然な動き」の責任の多くが Runtime ではなくモデル作者側に移る。結果として
  Authoring Tool が Runtime と同程度に重要な構成要素になる
- 検証すべき仮説が「手動 Key Pose + 補間が Auto Rig の品質を超えるか」に一本化される。
  Phase 0(口の開閉)でこれを確認した

## 却下した代替案

- **Auto Rig を中核に置く**: 品質の制御性が低く、人外キャラクターで破綻しやすい
- **Live2D Cubism を採用する**: 品質と成熟度は強いが、SDK / ライセンス / 組み込みの柔軟性 /
  オープンなモデル契約という論点で今回の狙いと異なる
- **Inochi2D を拡張する**: 合理的なら今後も選択肢として残す。ただし現時点では
  「RTC / Head Avatar に用途を絞った小さな Runtime」という差別化を優先する
