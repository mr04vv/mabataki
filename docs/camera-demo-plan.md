# カメラ連動デモ 実装方針

> Historical plan: paths below describe the pre-workspace layout. Current
> package locations are defined by [ADR-0018](adr/0018-pnpm-workspace-package-boundaries.md).

> 対象リポジトリ: `mabataki` / 前提知識ゼロの実装エージェント向け
> 作成日: 2026-08-16

## 1. 背景

**mabataki** は、ビデオ通話向けの Web ネイティブ 2D Head Avatar Runtime の PoC。
「作者が手で作った少数の Key Pose を、固定の顔パラメータでメッシュ変形補間して動かす」
という設計思想で、Auto Rig は採用しない。詳細は `README.md` を参照。

現在の実装状態(Phase 0 完了):

- `src/` — レンダラ非依存・**依存ゼロ**のコア。モデル形式の検証、グリッドメッシュ生成、
  キーフレームの区分線形補間による頂点変形、パラメータストア。Vitest で 27 テストが通る
- `index.html` + `demo/` — PixiJS v8 製のエディタ。口画像にメッシュを張り、
  `mouthOpen = 0/1` の Key Pose を頂点ドラッグで作り、スライダーで補間プレビューできる

今回作るのは **「Web カメラの顔の動きでアバターの口が動く」デモページ**。
設計ドキュメント上の Phase 9(MediaPipe adapter)の前倒しに相当する。

## 2. ゴール / 非ゴール

### ゴール(受け入れ条件)

1. `pnpm dev` → `http://localhost:5173/camera.html` を開き「start camera」を押すと、
   カメラ許可後、**自分が口を開けるとアバターの口が開く**(組み込みデモモデルで動作)
2. エディタで export した `model.json` + テクスチャ PNG を読み込んで、自作モデルでも動く
3. トラッキング値は平滑化され、静止時にプルプル震えない
4. 顔が検出できない間はその旨を表示し、クラッシュしない。カメラ拒否時はスライダーで代替操作できる
5. カメラ映像はページ外に一切送信しない(表示もローカルのみ)
6. `pnpm test` / `pnpm typecheck` / `pnpm build` が全て通る

### 非ゴール(やらないこと)

- WebRTC / captureStream 接続(次フェーズ)
- Web Worker へのトラッキング分離
- 目・眉・頭部姿勢を使う**モデル側**の対応(アダプタは値を出すが、デモモデルは mouthOpen のみ)
- 既存エディタページ(`index.html` / `demo/main.ts`)の変更
- MediaPipe 以外のトラッカー対応

## 3. 現状コードベースの要点

ツール: pnpm / Vite / Vitest / TypeScript(strict)。
コードスタイル: セミコロンなし・シングルクォート・2 スペース・コメントは英語。
テストは t-wada 式 TDD(先に失敗するテストを書く)。

```
src/model.ts    型定義 + validateModel(untrusted JSON の構造検証、throw で報告)
src/deform.ts   applyDeformations(base, bindings, values, out?) → Float32Array
                base + Σ 区分線形補間(keyframes, values[parameterId]) を計算。out 再利用可
src/params.ts   ParameterStore(defs): set(id, v) は範囲に clamp / get(id) / values()
                未知 id と非有限値は throw
src/mesh.ts     createGridMesh(width, height, cols, rows) → MeshData
src/index.ts    上記の re-export
demo/main.ts    エディタ。PixiJS でのメッシュ描画・頂点バッファ更新の参考実装
```

モデル形式(v1 / プレーン JSON、座標はテクスチャのピクセル空間):

```jsonc
{
  "version": 1,
  "parameters": [{ "id": "mouthOpen", "min": 0, "max": 1, "default": 0 }],
  "parts": [
    {
      "id": "mouth",
      "texture": "mouth.png",          // ファイル名参照のみ(同梱されない)
      "mesh": { "vertices": [/*x,y*/], "uvs": [/*u,v*/], "indices": [/*三角形*/] },
      "bindings": [
        {
          "parameterId": "mouthOpen",
          "keyframes": [
            { "value": 0, "deltas": [/*頂点ごと dx,dy*/] },
            { "value": 1, "deltas": [/*頂点ごと dx,dy*/] }
          ]
        }
      ]
    }
  ]
}
```

PixiJS v8 でのメッシュ更新(`demo/main.ts` と同じ方法を使うこと):

```ts
const geometry = new MeshGeometry({ positions, uvs, indices })  // positions: Float32Array
const mesh = new Mesh({ geometry, texture })
// 毎フレーム:
const buffer = geometry.getBuffer('aPosition')
;(buffer.data as Float32Array).set(positions)
buffer.update()
```

## 4. アーキテクチャ

設計原則: **ランタイム(src/)は MediaPipe を知らない**。トラッカー依存コードは
デモ側に置き、`AvatarParameters`(単なる `Record<string, number>`)だけを境界にする。

```
getUserMedia → <video>(ローカル表示のみ・ミラー)
    ↓ 毎 rAF、新フレームがあるときだけ
FaceLandmarker.detectForVideo()          … @mediapipe/tasks-vision
    ↓ blendshapes + transformation matrix
mapFaceToParams()                        … 純関数アダプタ(demo/mediapipe-adapter.ts)
    ↓ Record<string, number>(-1..1 / 0..1 に正規化済み)
ExponentialSmoother(パラメータごと)       … コアに追加(src/smoothing.ts)
    ↓
ParameterStore.set()                     … モデルが宣言している id だけ書く(重要)
    ↓ Pixi ticker(描画レート)
applyDeformations() → 頂点バッファ更新
```

注意: `ParameterStore.set()` は未知の id で throw する仕様。アダプタは全パラメータを
出力するので、**書き込み前に「モデルの `parameters` に宣言されている id か」でフィルタ**すること。

## 5. 実装ステップ

TDD で進める。各ステップ後に `pnpm test && pnpm typecheck` を通すこと。

### Step 1: `src/smoothing.ts`(コアに追加・依存ゼロ)

時間ベースの指数平滑。テストを先に書く。

```ts
export class ExponentialSmoother {
  constructor(timeConstantMs: number)   // 非有限・負値は throw
  next(target: number, deltaMs: number): number
  reset(): void
}
// s += (target - s) * (1 - exp(-deltaMs / timeConstantMs))
// 初回の next() は target をそのまま返す(0 からのランプアップ禁止)
```

テスト観点: 初回スナップ / 同じ target に収束する / deltaMs が大きいほど速く追従 /
timeConstant 0 は常に target / 非有限 target は throw。
`src/index.ts` に export を追加する。

### Step 2: `demo/mediapipe-adapter.ts`(純関数 + テスト)

**`@mediapipe/tasks-vision` を import しない**こと(型もランタイムも)。構造的型で受ける:

```ts
interface BlendshapeCategory { categoryName: string; score: number }

export interface FaceMappingOptions {
  mouthOpenGain: number   // default 1.6
  blinkGain: number       // default 1.4
  mirror: boolean         // default true(鏡のように動かす)
}

export function mapFaceToParams(
  blendshapes: BlendshapeCategory[],
  matrixData: ArrayLike<number> | null,   // 4x4 column-major、無ければ null
  options?: Partial<FaceMappingOptions>,
): Record<string, number>
```

マッピング表(score は 0..1、結果は clamp すること):

| 出力 id | 計算式 |
| --- | --- |
| `mouthOpen` | `clamp01(jawOpen * mouthOpenGain)` |
| `mouthSmile` | `clamp01((mouthSmileLeft + mouthSmileRight) / 2)` |
| `eyeOpenLeft` | `1 - clamp01(eyeBlinkLeft * blinkGain)` |
| `eyeOpenRight` | `1 - clamp01(eyeBlinkRight * blinkGain)` |
| `gazeX` | `((eyeLookOutRight + eyeLookInLeft) - (eyeLookOutLeft + eyeLookInRight)) / 2` |
| `gazeY` | `((eyeLookUpLeft + eyeLookUpRight) - (eyeLookDownLeft + eyeLookDownRight)) / 2` |
| `headYaw` `headPitch` `headRoll` | 行列から(下記)。matrix が null なら 0 |

頭部姿勢: 回転部(column-major `d`)から近似分解し、最大角で正規化して -1..1 に clamp:

```ts
const yawRad = Math.atan2(d[8], d[10])
const pitchRad = Math.asin(Math.max(-1, Math.min(1, -d[9])))
const rollRad = Math.atan2(d[1], d[0])
// MAX_YAW = 30°, MAX_PITCH = 20°, MAX_ROLL = 30° で割って正規化
```

**符号は実機で必ず確認して調整する**(§7 の手動確認手順参照)。`mirror: true` のとき
`headYaw` / `headRoll` / `gazeX` の符号を反転し、`eyeOpenLeft/Right` を入れ替える。
符号調整は式に埋め込まず `YAW_SIGN` 等の定数にして、コメントで理由を書く。

テスト観点(先に書く): jawOpen 0.5 + gain 1.6 → mouthOpen 0.8 / gain 適用後の clamp /
blink → eyeOpen の反転 / blendshape が空配列 → 全て default 相当(mouthOpen 0, eyeOpen 1) /
matrix null → head 系 0 / 純粋な Ry 回転行列を渡して headYaw の値と符号 / mirror 反転。
テストファイルは `demo/mediapipe-adapter.test.ts`(Vitest がそのまま拾う)。

### Step 3: `camera.html` + `demo/camera.ts`(ビューア本体)

`camera.html` はリポジトリルートに置く(`index.html` と同じ書式・ダークスタイル)。
UI 要素: アバター用 `#stage` / ミラー表示の小さな `<video>`(160px 幅程度) /
「start camera」ボタン / mouthOpen ゲイン `<input type="number">` /
フォールバック用スライダー / model.json + テクスチャ PNG の file input /
ステータス行(tracking fps・検出状態)。

`demo/camera.ts` の構成:

1. **組み込みデモモデル**: `drawPlaceholderMouth()`(`demo/placeholder.ts` に既存)を
   テクスチャに、`createGridMesh(480, 360, 8, 6)` でメッシュを作り、`mouthOpen=1` の
   deltas をコードで焼き込む。目安:

   ```ts
   // vertices below the hinge line move down, more for deeper rows,
   // fading toward the left/right edges
   const hingeY = height * 0.45
   for (let v = 0; v < vertexCount; v++) {
     const x = vertices[v * 2]
     const y = vertices[v * 2 + 1]
     if (y <= hingeY) continue
     const depth = (y - hingeY) / (height - hingeY)
     const edge = Math.min(x, width - x) / (width * 0.35)
     const falloff = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, edge))
     deltas[v * 2 + 1] = depth * height * 0.28 * falloff
   }
   ```

   見た目が「下顎が開く」ようになっていれば係数は調整してよい
2. **レンダリング**: `demo/main.ts` の `rebuildScene` / `computePositions` /
   `pushPositions` と同じパターン。編集機能は不要なのでプレビュー相当のみ。
   モデルの全 `parts` をループして描画する(組み込みモデルは 1 パーツだが汎用に書く)
3. **カメラ**: start ボタンから
   `getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })`。
   拒否・失敗はステータスに表示してスライダー操作にフォールバック
4. **FaceLandmarker 初期化**(公式手順):

   ```ts
   import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
   const fileset = await FilesetResolver.forVisionTasks(
     'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<インストールした版>/wasm',
   )
   const landmarker = await FaceLandmarker.createFromOptions(fileset, {
     baseOptions: {
       modelAssetPath:
         'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
       delegate: 'GPU',
     },
     runningMode: 'VIDEO',
     numFaces: 1,
     outputFaceBlendshapes: true,
     outputFacialTransformationMatrixes: true,
   })
   ```

   バージョンとURLは実装時に npm / 公式ドキュメント
   (https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)で確認すること
5. **トラッキングループ**: `requestAnimationFrame` で回し、`video.currentTime` が
   前回から進んだときだけ `landmarker.detectForVideo(video, performance.now())`。
   結果 → `mapFaceToParams` → パラメータごとの `ExponentialSmoother`(時定数 80ms 目安)
   → モデル宣言済み id のみ `store.set()`。顔未検出(`faceBlendshapes` が空)なら
   ステータス表示のみ更新し、パラメータは前回値を維持
6. **モデル読み込み**: model.json は `validateModel(JSON.parse(...))` を必ず通す。
   テクスチャは `parts[*].texture` のファイル名と一致した PNG を割り当てる
   (`demo/main.ts` の import 実装が参考になる)

### Step 4: 設定変更

- `pnpm add @mediapipe/tasks-vision`(追加依存はこれ**のみ**)
- `vite.config.ts` に MPA 設定を追加:

  ```ts
  build: {
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        camera: new URL('./camera.html', import.meta.url).pathname,
      },
    },
  },
  ```

### Step 5: README 更新

Quick start に camera デモの節を追加(起動 URL、組み込みモデルで動くこと、
自作モデルの読み込み方、CDN から wasm/model を取得するためオンライン必須である旨)。

## 6. 制約(必ず守る)

- `src/` に新しい実行時依存を追加しない。MediaPipe の import(型含む)を `src/` と
  `demo/mediapipe-adapter.ts` に入れない(アダプタは構造的型で受ける)
- 既存エディタ(`index.html` / `demo/main.ts` / `demo/placeholder.ts`)の挙動を変えない。
  placeholder への関数追加は可、既存関数のシグネチャ変更は不可
- React 等のフレームワーク禁止。素の DOM で書く
- `.task` / wasm バイナリをリポジトリにコミットしない(CDN 参照)
- カメラ映像・フレームをネットワークに送る API を一切呼ばない
- 既存のコードスタイル(セミコロンなし・英語コメント)とテスト方針(TDD)に従う
- マジックナンバー(ゲイン、時定数、最大角度)は名前付き定数にする

## 7. 検証

自動:

```sh
pnpm test        # smoothing + adapter の単体テストを含め全て green
pnpm typecheck
pnpm build       # 2 ページとも壊れずビルドできる
```

手動(実装者が必ず行う):

1. `pnpm dev` → `/camera.html` → start camera → 口の開閉にアバターが追従する
2. 符号確認: 頭を**自分の左**に向ける → `headYaw` の値がミラー方向(画面の左向き)に
   なっているかステータスにデバッグ表示して確認。左右の瞬きも同様。ズレていれば
   `*_SIGN` 定数を反転
3. 静止して口を閉じたまま 10 秒 → アバターが震えない(時定数を調整)
4. カメラを拒否 → スライダーで動かせる

ヘッドレス確認(任意): Chromium を
`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` 付きで起動すると
許可ダイアログなしのテスト映像(顔なし)でブートでき、「顔未検出でもクラッシュしない」
ことだけ自動確認できる。顔追従そのものの確認は手動で行う。

## 8. 既知のリスクと逃げ道

- **CDN ブロック環境**: wasm / .task が取れないと起動しない。ステータスに読み込み失敗を
  表示し、スライダーのフォールバックは生かすこと。自前ホストは今回のスコープ外
- **jawOpen が 1.0 まで出ない**: 個人差が大きい。`mouthOpenGain` を UI から変えられる
  ようにしてあるのはこのため
- **blendshape の左右**: MediaPipe の Left/Right は被写体基準。ミラー表示と組み合わせる
  と直感と逆になりやすい。§7 の手動確認を省略しない
- **行列の軸規約**: 上記の分解式は近似。符号・軸が合わない場合は式を疑う前に
  まず `*_SIGN` 定数で対処し、コメントに実測結果を残す

## 9. 受け入れチェックリスト

- [ ] `src/smoothing.ts` + テスト(先にテスト)
- [ ] `demo/mediapipe-adapter.ts` + テスト(先にテスト、MediaPipe 非依存の純関数)
- [ ] `camera.html` + `demo/camera.ts`(組み込みモデルで即動作)
- [ ] model.json + PNG の読み込みで自作モデルが動く
- [ ] `vite.config.ts` MPA 対応 / `@mediapipe/tasks-vision` 追加
- [ ] README 更新
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm build` green
- [ ] §7 の手動検証 4 項目を実施し、結果を報告に含める
