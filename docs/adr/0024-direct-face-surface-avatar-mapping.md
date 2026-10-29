# ADR-0024: カメラ上のAvatar FaceはMediaPipe Face Meshへ直接UV登録する

- ステータス: Superseded by ADR-0025
- 日付: 2026-08-25
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0017](0017-camera-space-transform-outside-runtime.md), [ADR-0022](0022-face-local-accessory-projection.md), [ADR-0023](0023-physical-face-pose-parameter-mapping.md)

## 背景

MediaPipeの物理yawを`headYaw -1..1`へ変換しても、表示結果は作者が作った2D Key Poseの形になる。
カメラ上の顔と同じ輪郭・遠近・表情へ追従させるには、Parameter値ではなくMediaPipeが推定した
顔表面そのものを描画ジオメトリとして使う必要がある。

## 決定

Camera + avatarモードは、Avatar FaceをMediaPipeの468点Face Meshへ直接登録する。

- MediaPipe公式Tessellationの接続3本を1組として三角形Indexを作る
- 初回の正面フレームで、ランドマークの目・鼻・口・輪郭とキャラクターテクスチャ上の同じ特徴点を
  対応させ、UVを固定する
- 以降は各フレームの468ランドマークを、鏡像Canvas上のMesh頂点へ直接変換する
- 横向き時はz値から三角形をfar-to-nearへ並べ、2D Compositorでも自己重なりを安定させる
- UV登録がずれた場合は、正面を向いて再較正できるようにする

## 影響

- Camera + avatarの顔輪郭・目・鼻・口は、Key Pose補間ではなくMediaPipe Face Meshと同じ頂点を使う
- `@mabataki/core`とモデルParameterは変更しない。これはカメラ用Compositorの表現である
- Background + avatarなど、独立した2Dアバター表示は引き続きRuntimeとKey Poseを使う
- キャラクターごとにテクスチャ上の顔特徴点をAuthoringする必要がある。現在はデモ画像用の値を持つ
- 1枚絵に存在しない横顔の画素は生成できないため、完全な3D頭部とは異なる

## 却下した代替案

- **yaw角だけをKey Poseへ変換する**: 入力角度は一致しても出力Meshが顔表面と一致しない
- **全身の2D MeshをFace Meshへ貼る**: 身体まで顔の表情で変形する
- **MediaPipe Face MeshをCoreへ入れる**: トラッカー依存がRuntimeへ漏れる
