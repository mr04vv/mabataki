# ADR-0019: 自動Motionは宣言的Clipを合成し、ParameterとRoot Motionを分離する

- ステータス: Accepted
- 日付: 2026-08-22
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md), [ADR-0010](0010-smoothing-outside-runtime.md), [ADR-0011](0011-spring-bindings-for-secondary-motion.md), [ADR-0017](0017-camera-space-transform-outside-runtime.md)

## 背景

カメラ入力がなくても、瞬き、呼吸、待機、浮遊、跳ねる動作を再生したい。これらを各デモの
Tickerへ直接実装すると、時間計算、合成順序、座標単位が分散し、同じモデルでも利用アプリに
よって動きが変わる。一方、`MabatakiRuntime`へ「浮遊キャラクター」のような意味を組み込むと、
人型以外を同じParameter契約で扱う設計を崩す。

## 決定

`@mabataki/core`へ、描画非依存かつ直列化可能な`MotionClip`と`MotionMixer`を追加する。

- Clipは期間、Loop、Track、時刻付きKeyframe、補間方法だけを持つ
- Trackの対象はモデル変形用`parameter`または全体配置用`root`とする
- Root Motionは平行移動、回転、Scaleをモデル空間で返し、Core自身は描画へ適用しない
- Layerは`additive`または`override`で合成し、Weight、再生速度、開始Offsetを持てる
- 後に並ぶOverride Layerを優先し、アプリが入力ソースの所有権とLayer順を決める
- Motion Mixerへ時刻を渡すのはアプリとし、`MabatakiRuntime.step()`のPhysics時計とは分離する
- 定番動作は`createGroundedMotion`、`createFloatingMotion`、`createLivelyMotion`で設定値から
  通常のLayer配列を生成する。FactoryはRuntime分岐やキャラクター種別を追加しない
- `createFloatingMotion`は`hover`、`balloon`、`ghost`の名前付き初期値を提供するが、選択後も
  振幅や周期を個別上書きでき、結果は常に通常のLayer配列とする
- 周期運動の中間点では`catmull-rom`補間を使い、制御点ごとに速度がゼロになる機械的な停止を避ける
- Floating FactoryはSeed付きの決定的な振幅・時間Variationを複数Cycle生成する。同じSeedは
  同じ結果になり、テストと録画再生の再現性を維持する
- `MotionPlayer`は現在の見た目から新しいLayer集合へCrossfadeし、Preset切替時のRoot Jumpを防ぐ

### 動作を選ぶルール

| 表現 | 使う仕組み | 理由 |
| --- | --- | --- |
| 口、目、顔向き、関節 | Parameter Track | 作者のKey Poseを補間して形状を変えるため |
| 浮遊、全身バウンス、全体の伸縮 | Root Track | 全Partの相対配置を保ったまま一括で動かすため |
| 耳、髪、尻尾の遅れ | SpringBinding | 親の動きに対する慣性として解くため |
| カメラ内の位置・距離追従 | AdapterのView Transform | モデルの演技ではなく撮影空間の配置だから |
| 剛体の腕や装備の独立動作 | 別Partと専用Parameter | 全身Meshの歪みで代用しないため |

同じChannelを複数の絶対入力で同時に操作しない。例えば音声が`mouthOpen`を所有する間、Idle
Motionは口を操作しない。Camera Trackerが頭部を所有する場合は、自動Head Motionを無効化するか、
小さなAdditive Layerとして明示的に合成する。

Root平行移動はモデル座標、回転はRadian、Scaleは`1`を中立値とする。Additive Scale Trackだけは
中立値からの差分を記述し、`0.02`を`1.02`として合成する。回転とScaleの中心にはモデルの
任意`origin`を使い、未指定モデルでは画像Bounds中央をFallbackとする。尻尾や装備で画像重心が
偏っていても、Authoring時に身体の中心を指定できる。

## 影響

- `grounded`、`floating`、`lively`と各Floating Styleは同じMixerのデータ違いとして実装できる
- 横・縦の振幅、周期、回転、呼吸、頭部の振幅を型付きOptionsから調整できる
- `variation`、`seed`、`cycleCount`で反復の目立ち方と再現性を調整できる
- Tracker、音声、AI、手動入力をMotionの外から合成できる
- RendererはRoot Motionの適用方法を選べるため、PixiJS以外でも利用できる
- 現在のModel v1にはClipを埋め込まず、Presetの品質とAuthoring要件を確認してから形式へ追加する
- Clipのイベント発火と状態遷移Graphは将来の拡張になる

## 却下した代替案

- **Coreに`characterType: floating`を追加**: 意味と固定挙動がCoreへ入り、独自キャラクターを拡張しにくい
- **浮遊を全頂点のKey Poseで作る**: 全Partに同じ移動量を重複保存し、Attachmentの基準もずれる
- **RendererのTickerへ直接Sin波を書く**: Renderer交換時にMotionが失われ、アプリごとに挙動が分岐する
- **Motionを`MabatakiRuntime.step()`へ統合**: 外部音声やTrackerとの時計・所有権が曖昧になる
