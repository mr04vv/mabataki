# ADR-0015: Web-first の最小 Headless Runtime として独立実装する

- ステータス: Accepted
- 日付: 2026-08-17
- 関連: [ADR-0003](0003-parameter-contract.md), [ADR-0006](0006-zero-dependency-core.md), [ADR-0009](0009-renderer-agnostic-runtime-api.md)

## 背景

「軽量な 2D Avatar Runtime」だけでは独自のカテゴリにならない。特に Inochi2D は、レイヤー画像から
作った 2D Mesh を Parameter でリアルタイム変形するライブラリであり、オープンな Puppet 仕様、
Creator、Tracking 用 Session、SDK を分離している。思想上もっとも近い既存プロジェクトである
[Inochi2D Docs (2026/08), What is Inochi2D?]。

一方、Inochi2D の公式 SDK は D 言語を中心に C FFI と WASM build を提供する構成で、WebAssembly
利用には専用 toolchain または配布済み build を使う。Web は対応先の一つである
[Inochi2D README (2026/08), SDK and WebAssembly]。

隣接領域には、JS / WASM で高水準・低水準 API を提供する汎用インタラクティブ Animation Runtime の
Rive [Rive Web README (2026/08), Overview]、Renderer を除く Generic Runtime と JSON / Binary / Atlas
形式を提供する Bone / Skeleton Animation の Spine [Spine Runtimes (2026/08), Runtimes and export formats]、
Cubism Editor の出力を Cubism Core と組み合わせて再生する Web Framework がある
[Cubism Web Framework (2026/08), Components and Cubism Core]。

## 決定

Mabataki は汎用 Puppet 環境を複製せず、次の条件を持つ独立した Runtime として進める。

- **Web-first**: ブラウザと npm / TypeScript の組み込み体験を第一にし、コア利用に WASM を必須としない
- **Headless**: `Record<string, number>` を入力し、変形済み `Float32Array` を返す。Canvas、Texture、
  Renderer は所有しない
- **最小スコープ**: Head Avatar、リアルタイム通信、複数 Avatar の同時実行に必要な機能を優先する
- **交換可能な境界**: Authoring、Tracking、Smoothing、Rendering、通信はコア外に置く
- **可読な契約**: PoC では JSON + 画像を正とし、モデル仕様と Runtime の挙動をテストで固定する

この位置づけは「Inochi2D のオープンな 2D Puppet 思想」「Rive の Web Runtime としての組み込み体験」
「Avatar Parameter API」を、本プロジェクトの狭い用途へ再構成するものである。互換性を主張するものではない。

## 影響

- API と実行時依存を小さく保ち、任意 Renderer や Tracker への Adapter を作りやすくできる
- 汎用 Scene Graph、State Machine、Bone Animation、完成済み Creator 等は得られない
- 独自モデル形式を維持するコストと、既存エコシステムとの非互換性を負う
- 差別化は設計宣言だけでは成立しない。bundle size、複数 Avatar、Tracker / Renderer 差し替えの
  benchmark と example で実証する必要がある

## 再検討条件

次のいずれかが起きた場合、Inochi2D importer、部分互換、または同仕様上の Web Runtime への移行を検討する。

- Mabataki Model が階層、Mask、Composite、Physics を追加し、汎用 Puppet 仕様へ近づいた
- 利用者から Inochi2D Model の直接読み込み要求が継続的に出た
- 独自形式の保守コストが、最小 API と dependency-free TypeScript の利点を上回った
- Web / RTC 向け benchmark で独立実装の優位性を示せなかった

## 却下した代替案

- **Inochi2D を直ちに採用する**: 技術思想は最も近く、将来の互換対象として有力。ただし最初の検証では
  Web 組み込みの最小 API と Head Avatar に必要な範囲を先に確定する
- **Rive / Spine を Avatar Runtime として使う**: 本プロジェクトが固定した
  Avatar Parameter → Mesh Vertex Buffer という境界より広い汎用 Animation 問題を解く
- **Cubism Web SDK を採用する**: 独立したオープンモデル契約を検証する目的と異なる

## 参照資料

[Inochi2D README, 2026/08] Inochi2D Project. "Inochi2D SDK — Bring your characters to life." GitHub. https://github.com/Inochi2D/inochi2d

[Inochi2D Docs, 2026/08] Inochi2D Project. "Welcome to the Inochi2D Documentation." Inochi2D Documentation. https://docs.inochi2d.com/en/latest/

[Rive Web README, 2026/08] Rive. "Rive Web: JavaScript/TypeScript and WebAssembly runtime." GitHub. https://github.com/rive-app/rive-wasm

[Spine Runtimes, 2026/08] Esoteric Software. "Spine Runtimes." Spine. https://us.esotericsoftware.com/spine-runtimes

[Cubism Web Framework, 2026/08] Live2D. "Cubism Web Framework." GitHub. https://github.com/Live2D/CubismWebFramework
