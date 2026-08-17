# ADR-0017: カメラ空間の配置はRuntime外で適用する

- ステータス: Accepted
- 日付: 2026-08-17
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0005](0005-pixijs-renderer.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md), [ADR-0010](0010-smoothing-outside-runtime.md)

## 背景

カメラへ近づく・離れる動きに合わせて、顔・目・口・アクセサリーを一括で拡縮したい。
このScaleは`headYaw`のようなモデル内部の表情・変形ではなく、カメラ内の被写体とCanvas上の
アバターを対応させる配置情報である。これをモデルParameterへ入れると、全Partへ同じKey Poseを
重複して持たせる必要があり、TrackerやRendererへの依存もCoreへ漏れる。

## 決定

MediaPipe Adapterの出力を次の2系統へ分離する。

```ts
{
  parameters: { headYaw, headRoll, mouthOpen, ... },
  viewTransform: { scale },
}
```

- `parameters`だけを`MabatakiRuntime.update()`へ渡す
- `viewTransform.scale`は追従ONのときだけPixiJSのルート`Container`へ適用し、全Partを一括で拡縮する
- Avatar表示では追従をデフォルトOFFとし、OFFでも表情・顔向きParameterの追従は続ける
- 最初に検出した顔幅を`1`として相対Scaleを計算する
- Scaleは`0.75..1.30`へ制限し、Renderer側で平滑化する
- 拡縮中心はモデルCanvas中央とし、モデル内の相対配置を維持する

## 影響

- Runtime APIとモデル形式は変更されない
- 別Trackerは同じ2系統の出力を作れ、別Rendererは自身のTransform APIで適用できる
- メガネを含む全Partが同倍率で動き、Partごとのサイズ補正は不要
- 顔の画面内位置への追従も、将来`viewTransform`へ平行移動を追加して拡張できる
- 顔幅はYawでも変化するため、極端な横向きではScaleが多少影響を受ける。必要になれば
  Face Transformation Matrixや複数ランドマークによる推定へ交換する

## 却下した代替案

- **`avatarScale` Parameterをモデルへ追加**: 全Partの重複Key Poseになり、カメラ配置がモデル変形へ混入する
- **各アクセサリーだけ個別に拡縮**: 顔との相対サイズが崩れ、装備が増えるほど同期処理が増える
- **MediaPipe Adapter内でCanvasを操作**: Renderer交換ができず、Trackerと描画の責務が結合する
