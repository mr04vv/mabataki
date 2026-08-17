# Mabataki v0.0.1 — Runtime API 昇格の実装方針

> Historical plan: paths below describe the pre-workspace layout. Current
> package locations are defined by [ADR-0018](adr/0018-pnpm-workspace-package-boundaries.md).

> 対象リポジトリ: `mabataki` / 前提知識ゼロの実装エージェント向け
> 作成日: 2026-08-16 / 方針: ponytail(動く最小、ただし理解と検証は省略しない)

## 0. 一言でいうと

散らばっている `validateModel + ParameterStore + applyDeformations` を、公開 API
**`loadModel()` + `MabatakiRuntime`** に束ね、**model.json と PNG だけで口デモが再現できる**
ビューアページを追加する。これが v0.0.1。**新しい変形ロジックは一切書かない**(全部既存の再利用)。

```ts
const model = await loadModel('/models/mouth/model.json')
const runtime = new MabatakiRuntime(model)

runtime.update({ mouthOpen: 0.72, mouthSmileLeft: 0.1 })
const positions = runtime.getPartVertices('mouth') // Float32Array — レンダラはこれを描くだけ
```

## 1. 現状(2026-08-16 時点、実コード確認済み)

- `AGENTS.md` にリポジトリ規約あり。**必ず読んで従うこと**(スタイル、テスト、コミット規約)
- `src/` はレンダラ・MediaPipe 非依存(依存ゼロ)。`validateModel` / `createGridMesh` /
  `applyDeformations`(3 キー以上の区分線形補間・out バッファ再利用対応済み)/ `ParameterStore`
- `demo/face-tracker.ts`: MediaPipe を**唯一** import するファイル。`MouthFaceTracker`(カメラ+
  FaceLandmarker のライフサイクル)と純関数 `calibrateJawOpen` / `mouthValuesFromResult`(テスト付き)
- `demo/main.ts`(エディタ 1 ページに全部入り): メッシュ編集、プレビュー、**カメラ連動**
  (ticker 内で tracker を sample → インライン EMA(α=0.5/トラッキングフレーム)→
  モデル宣言済み id にフィルタして `store.set` → `applyDeformations`)。
  モデルはコード内 `createMouthModel()`(mouthOpen 空キー + 手続き生成の smile バインディング)
- モデル形式 v1(README 参照): `parameters[]` + `parts[].mesh` + `parts[].bindings[].keyframes[]`。
  export / import 実装済み。**git コミットはまだ 0 件**

つまり「MediaPipe と Mesh の分離」「モデルの JSON 化」は実質できている。
足りないのは **公開 Runtime API** と **「コード無変更でモデルデータだけで動く」ことを示す消費者**。

## 2. ゴール / 非ゴール

### ゴール(v0.0.1 受け入れ条件)

1. `src/` に `MabatakiRuntime` と `loadModel` が追加され、単体テストで仕様が固定されている
2. 新ページ `viewer.html` が `public/models/mouth/model.json` + `mouth.png` を **fetch して**
   口デモ(スライダー / animate / カメラ追従)を再現する。ビューアのコードにモデル固有の
   頂点・deltas・パラメータ定義が**一切**書かれていない
3. ビューアで自作の model.json + PNG も読み込める(file input)
4. 既存エディタ(`index.html` / `demo/main.ts`)の挙動は不変
5. `pnpm test` / `pnpm typecheck` / `pnpm build` green、`package.json` version = `0.0.1`

### 非ゴール(やらない。理由込み)

- **モデル形式の変更・リネーム**(`bindings`→`keyforms` 等): 機能ゲインゼロの churn。現形式で
  相談メモの要件(複数キー、複数パラメータ、複数パート)は全て表現できる
- `createAvatar({ canvas })` 型のレンダラ込みファサード: Runtime とレンダラの再結合になる
- レンダラの抽象クラス / `@mabataki/*` パッケージ分割 / npm publish
- headYaw・複数パート編集(v0.0.2)、耳 physics(v0.0.3 以降)、エディタ改修
- エディタを Runtime 経由に書き換えること: エディタは「キーポーズの生表示」という
  Runtime と異なる表示モードを持つ正当な別経路。動いているものを触らない

## 3. 設計

### 3.1 `src/runtime.ts` — MabatakiRuntime(新規、~70 行)

```ts
export class MabatakiRuntime {
  readonly model: MabatakiModel

  /** validateModel を通す(手組みモデルの事故もここで止める)。無効なら throw */
  constructor(model: MabatakiModel)

  /**
   * パラメータをまとめて更新。
   * - モデルが宣言していない id は黙って無視する(トラッカーは常にモデルより多くの値を
   *   吐くため。現在 demo/main.ts にあるフィルタ行きの boilerplate を Runtime が吸収する)
   * - 宣言済み id は範囲に clamp(ParameterStore に委譲)
   * - 非有限値(NaN/Infinity)は throw(実バグは黙殺しない)
   */
  update(values: Record<string, number>): void

  /** clamp 済みの現在値(UI のスライダー同期用) */
  getParameter(id: string): number  // 未知 id は throw

  /**
   * 変形適用済みの頂点座標(flat [x,y,...])を返す。
   * - 内部バッファを毎回再利用して返す(ゼロコピー)。呼び出し側は書き換え禁止、
   *   保持したければコピーすること(doc コメントに明記)
   * - dirty フラグ方式: update() が来ていなければ再計算せずキャッシュを返す
   *   (tracking 30fps / rendering 60fps のとき変形計算が半分になる)
   * - 未知の part id は throw
   */
  getPartVertices(partId: string): Float32Array
}
```

実装は既存部品の組み立てのみ: ctor で `validateModel` → `ParameterStore` 生成 →
part ごとに `{ base: Float32Array, out: Float32Array }` を `Map<partId, …>` に構築。
`getPartVertices` は dirty なら**全パート**を `applyDeformations(base, part.bindings,
store.values(), out)` で再計算して dirty を下ろす(パート数は小さいので粒度は全体で十分)。

前提整備: **`validateModel` に「part id の重複禁止」を追加する**(現状 parameter id しか
重複チェックがなく、`getPartVertices(partId)` のキーが曖昧になるため)。format の規則なので
runtime 側でなく validator に入れる。

### 3.2 `src/loader.ts` — loadModel(新規、~10 行)

```ts
export async function loadModel(url: string, init?: RequestInit): Promise<MabatakiModel> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`failed to load model: ${response.status} ${url}`)
  return validateModel(await response.json())
}
```

テクスチャの解決は**入れない**。画像のデコードはブラウザ/レンダラの領分で、コアを
依存ゼロに保つ(ビューア側で `Assets.load`(PixiJS)を使い、model.json と同じディレクトリの
`part.texture` ファイル名を解決する、という規約にする)。

### 3.3 `src/smoothing.ts` — ExponentialSmoother(新規、~25 行)

トラッカー共通層の部品としてコアに置く(設計ドキュメントでも smoothing はコアの責務)。
ただし **Runtime には組み込まない**。Runtime は渡された値を忠実に評価するだけ。

```ts
export class ExponentialSmoother {
  constructor(timeConstantMs: number)      // 負・非有限は throw
  next(target: number, deltaMs: number): number
  // s += (target - s) * (1 - exp(-deltaMs / timeConstantMs))
  // 初回は target をそのまま返す(0 からのランプアップ禁止)。時定数の目安 80ms
  reset(): void
}
```

現在 `demo/main.ts` にあるインライン EMA(フレームレート依存の α=0.5)は v0.0.1 では
**触らない**(動いているエディタを守る)。ビューアは最初からこれを使う。
エディタ側の置き換えは v0.0.2 のついで作業とする。

### 3.4 資産: `public/models/mouth/`(新規)

「モデルデータだけで動く」を示すための静的ファイル。

```
public/models/mouth/model.json   … mouthOpen(0/1 キー、下顎が開く deltas 焼き込み)
                                    + mouthSmileLeft/Right(既存の手続き生成と同等)
public/models/mouth/mouth.png    … demo/placeholder.ts の描画結果を書き出したもの
```

生成は一度きりの作業。Node には DOM canvas がないため、**ヘッドレスブラウザで
`drawPlaceholderMouth()` を評価して PNG 化**し、model.json は `createGridMesh` +
ヒンジ式の deltas(下記)で組み立てて `validateModel` を通してから書き出す。
生成スクリプトはリポジトリにコミットしない(使い捨て)。**生成後、ビューアの
スクリーンショットで「口が開いて見える」ことを必ず目視確認**する。

```ts
// mouthOpen = 1 の deltas: ヒンジ線より下の頂点を、深さに比例して下へ、左右端は減衰
const hingeY = height * 0.45
depth = (y - hingeY) / (height - hingeY)            // 0..1
edge = min(x, width - x) / (width * 0.35)           // 端で 0
falloff = 0.5 - 0.5 * cos(π * min(1, edge))
dy = depth * height * 0.28 * falloff
```

### 3.5 `viewer.html` + `demo/viewer.ts`(新規、~150 行)

`index.html` と同じ見た目の別ページ。編集機能なし。

- 起動時: `loadModel('/models/mouth/model.json')` → 同ディレクトリからテクスチャを
  `Assets.load` → `MabatakiRuntime` 構築 → 全 `model.parts` を配列順(奥→手前)に
  `MeshGeometry` + `Mesh` で描画(頂点更新パターンは `demo/main.ts` の
  `pushPositions` と同一: `geometry.getBuffer('aPosition')` に set → `buffer.update()`)
- 毎 tick: `runtime.getPartVertices(part.id)` をバッファへ流すだけ
- 入力 3 系統(全部 `runtime.update()` に合流させる — これが API の証明):
  1. スライダー(`model.parameters[0]` を駆動、`getParameter` で表示同期)
  2. animate チェックボックス(既存と同じ cos 振動)
  3. カメラ: 既存 `MouthFaceTracker` を再利用 + パラメータごとの `ExponentialSmoother`。
     フィルタ処理は不要(Runtime が未宣言 id を無視するため、`tracker.sample()` の戻りを
     そのまま `runtime.update()` に渡せる)
- file input で自作 model.json + PNG の読み込み(実装は `demo/main.ts` の import を参考)
- カメラのループ制御(video.currentTime ゲート)は `demo/main.ts` の ticker と同じ書き方で
  よい。~10 行の重複は共通化しない(使用 2 箇所での抽象化は時期尚早)

### 3.6 設定

- `vite.config.ts` の build.rollupOptions.input に `viewer.html` を追加(MPA 化)
- `package.json` version → `0.0.1`
- README: Runtime API の節(上のコード例)+ viewer の使い方を追記

## 4. 実装ステップ(TDD、各ステップ後に `pnpm test && pnpm typecheck`)

1. **validateModel: part id 重複禁止** — 失敗するテスト → 実装(`src/model.test.ts` に追加)
2. **`src/smoothing.ts`** — テスト先行: 初回スナップ / 同一 target への収束 /
   deltaMs 大ほど速い / 非有限 throw / reset
3. **`src/runtime.ts`** — テスト先行:
   - 初期状態の `getPartVertices` が default 値適用結果と一致
   - `update({mouthOpen: 0.5})` 後の結果が `applyDeformations` 直呼びと一致
   - 未宣言 id は無視され、同時に渡した宣言済み id は反映される
   - 範囲外は clamp(`getParameter` で確認)/ NaN は throw / 未知 part id は throw
   - 返るバッファが毎回同一インスタンス / update なしの連続呼び出しで値が変わらない
4. **`src/loader.ts`** — テスト先行(`vi.stubGlobal('fetch', …)` でモック):
   正常系 / HTTP エラー throw / validateModel 不合格 throw
5. `src/index.ts` に 3 つを export 追加
6. **資産生成**: `public/models/mouth/` に model.json + mouth.png(§3.4 の方法)
7. **`viewer.html` + `demo/viewer.ts`** + vite MPA 設定
8. README 更新 + version 0.0.1
9. 検証(§5)

## 5. 検証

- 自動: `pnpm test` / `pnpm typecheck` / `pnpm build`(2 ページともビルドされること)
- ヘッドレススモーク(playwright-core + キャッシュ済み Chromium で可):
  `/viewer.html` を開き、コンソールエラーなし・スライダー 0 / 0.5 / 1 の
  スクリーンショットで口の開閉を目視確認
- 手動: カメラ追従がエディタページと同等に動く(エディタページ側の無事も確認)

## 6. コミット計画(初コミット。AGENTS.md の規約に従う)

リポジトリはまだコミット 0 件。v0.0.1 完了時に以下の粒度を提案:

1. `Add core model format, deformation, and grid mesh with tests`(既存 Phase 0 の src/)
2. `Add mesh editor demo with mouthOpen authoring`(index.html + demo/ エディタ)
3. `Add MediaPipe mouth tracking to the editor`(face-tracker + カメラ統合)
4. `Add MabatakiRuntime, loadModel, and smoothing to the core`
5. `Add data-driven viewer page with bundled mouth model`(viewer + public/ + MPA)
6. `Bump version to 0.0.1 and document the runtime API`

## 7. v0.0.2 の予告(スコープ外だが設計が干渉しないための前提)

headYaw(-1/0/+1 の 3 キー・複数パート)を次にやる。**コアは既に対応済み**
(区分線形補間は 3 キー可、`applyDeformations` はパートごとの bindings 配列を処理可、
Runtime も全パート再計算する設計)。足りないのはエディタの複数パート・複数パラメータ編集
UI のみ。参考: マルチパーツ対応エディタの実装は一度作って退避済み
(このセッションの scratchpad `multipart-stash/`。消えていても会話ログから再構成可能)。
v0.0.1 では**この将来要件のために何も先回りしない**こと(Runtime API は既に十分)。
