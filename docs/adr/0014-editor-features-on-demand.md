# ADR-0014: エディタ機能は必要性が実証された時点で追加する

- ステータス: Accepted
- 日付: 2026-08-17
- 関連: [ADR-0001](0001-key-poses-over-auto-rig.md), [ADR-0007](0007-tdd-with-colocated-tests.md), [ADR-0008](0008-rigid-parts-as-separate-parts.md)

## 背景

[ADR-0001](0001-key-poses-over-auto-rig.md) により Authoring Tool は Runtime と同程度に重要になったが、
先に Editor を作り込むと、Head Yaw や Physics を入れた瞬間に UI 設計をやり直す可能性が高かった。
「口 → Head Yaw → 耳 Physics を作ると、Editor に本当に必要な操作が見えてくる」という判断で、
初期は最小限(頂点ドラッグ + プレビュー)に留めた。

## 決定

作業の中で必要性が実証された道具だけを、その時点で追加する。実際に追加されたもの:

- パート / パラメータ / キーポーズの選択(複数パート・3 キーの Head Yaw で必要になった)
- ボックス選択、ソフト選択(減衰半径付き)、頂点のピン止め
- undo / redo
- メッシュ領域を指定してのリビルド(透明な余白を編集対象外に置き、特徴部分に頂点を集中させる)

選択計算(`softSelectionWeights` / `verticesInRect`)は純関数として `demo/editor-tools.ts` に
切り出し、テストする。

## 影響

- 「複数頂点をまとめて滑らかに動かす」「特定の頂点は動かさない」という要求は、実際に
  Head Yaw を作る過程で初めて具体化した。この順序は妥当だった
- ソフト選択は、手作業での移動量グラデーション付けを自動化し、メッシュの破綻を減らす
- ピン止めは剛体の代替ではなく誤操作防止の道具である([ADR-0008](0008-rigid-parts-as-separate-parts.md))
- Cubism 級の巨大エディタは引き続き非目標。Pivot / Parent / Physics Pin の設定 UI は、
  対応する Runtime 機能が実証されてから

## 却下した代替案

- **先に汎用エディタを作り込む**: 必要な操作が判明する前の UI 設計は、作り直しになる
