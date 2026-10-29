# ADR-0025: 顔追従はAvatarのNeutral形状へMediaPipe差分を転写する

- ステータス: Superseded by ADR-0026
- 日付: 2026-08-25
- 関連: [ADR-0017](0017-camera-space-transform-outside-runtime.md), [ADR-0024](0024-direct-face-surface-avatar-mapping.md)

## 背景

MediaPipeの468点をAvatar Meshの絶対座標として使うと、顔の向きには正確に追従するが、
キャラクター固有の輪郭や目・鼻・口の比率が追跡対象者の顔へ置き換わってしまう。
追従精度とキャラクターの原型を両立する必要がある。

## 決定

正面較正時に、追跡対象者とAvatarの2つのNeutral形状を保存する。各フレームでは、
移動・回転・スケールのSimilarity Transform `T` を算出し、各頂点を次式で求める。

```text
output = T(avatarNeutral) + liveMediaPipe - T(userNeutral)
```

- `avatarNeutral` はAuthoring済みの顔特徴点とUVから作り、キャラクター固有の比率を持つ
- `T` は鼻位置、目のライン、額から顎までの距離から求める
- MediaPipeからはSimilarity Transformで説明できない姿勢・表情の差分を転写する
- 横向き時の三角形depth sortと正面からの再較正は維持する

## 影響

- 正面ではキャラクターのAuthoring形状がそのまま表示される
- 移動、距離、roll、yaw、口などの変化はMediaPipe Face Meshから連続的に伝わる
- 処理はCamera Compositor内に留まり、`@mabataki/core`はMediaPipeを知らない
- キャラクターごとの顔特徴点Authoringは引き続き必要である
- 極端な横向きでは1枚絵に存在しない画素を生成できず、完全な3D頭部とは異なる

## 却下した代替案

- **MediaPipe絶対座標を使い続ける**: 追跡対象者の顔比率になり、キャラクター性を失う
- **差分を使わずRoot Transformだけ適用する**: 原型は残るが表情と非剛体のyaw変形が伝わらない
- **Coreへ顔Retarget処理を入れる**: Tracker固有の責務がRuntimeへ漏れる
