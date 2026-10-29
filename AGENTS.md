# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm workspace. `packages/core/` contains the dependency-free, renderer-agnostic 2D Runtime and is the only currently publishable package. `packages/ar/` owns renderer-independent 3D filter manifests and pose resolution, `packages/mediapipe/` owns tracking and segmentation, `packages/pixi/` renders Core vertex buffers, `packages/three/` renders AR filters, and `packages/web/` contains thin browser-stream helpers. `apps/demo/` contains the Editor, viewers, compositors, and sample assets. Keep tests beside implementations as `*.test.ts`. Never edit generated `packages/*/dist/` or `apps/demo/dist/` files.

Dependencies must point inward: applications may compose every package; `pixi` may depend on `core`; `three` may depend on `ar`; headless packages must not import MediaPipe, DOM rendering, camera, or WebRTC code.

## Build, Test, and Development Commands

Use pnpm and keep `pnpm-lock.yaml` synchronized.

- `pnpm install` installs and links all workspace packages.
- `pnpm dev` builds packages, then starts the demo Vite server.
- `pnpm test` builds packages and runs every Vitest suite.
- `pnpm typecheck` checks every package independently.
- `pnpm build` emits package libraries and the production demo.
- `pnpm --filter @mabataki/core test -- src/deform.test.ts` runs one focused suite.

Run `pnpm test` and `pnpm build` before submitting changes.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, no semicolons, and trailing commas in multiline constructs. Use `camelCase` for values and functions, `PascalCase` for types and classes, and descriptive lowercase filenames such as `accessory-tracking.ts`. Export package APIs only through each package's `src/index.ts`. Keep strict TypeScript settings and avoid cross-package relative imports.

## Testing Guidelines

Tests use Vitest in the Node environment. Cover normal behavior, boundaries, malformed input, and interpolation edge cases. Every bug fix should include a regression test. Package-specific behavior belongs in that package; integration tests and bundled-model checks belong in `apps/demo/src/`.

## Commit & Pull Request Guidelines

Use short imperative subjects such as `Split runtime into workspace packages`. Keep commits focused. Pull requests should explain motivation, package-boundary or public-API changes, validation commands, and linked issues. Include screenshots or recordings for Editor, Viewer, or Camera Compositor changes.
