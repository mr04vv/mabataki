# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the renderer-agnostic TypeScript core: model validation, mesh generation, parameter state, and deformation. Public exports belong in `src/index.ts`. Unit tests are colocated with their modules as `src/*.test.ts`. The browser-based proof-of-concept lives in `demo/`, with `index.html` as the Vite entry point. Generated production output goes to `dist/`; do not edit it by hand. Keep PixiJS and browser-specific code in the demo so the core remains dependency-free.

## Build, Test, and Development Commands

Use pnpm and keep `pnpm-lock.yaml` in sync with dependency changes.

- `pnpm install` installs dependencies.
- `pnpm dev` starts the Vite development server and interactive editor.
- `pnpm test` runs the Vitest suite once.
- `pnpm typecheck` checks strict TypeScript without emitting files.
- `pnpm build` type-checks, then creates the production demo in `dist/`.

Before submitting changes, run `pnpm test` and `pnpm build`.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, no semicolons, and trailing commas in multiline constructs. Use `camelCase` for functions and variables, `PascalCase` for interfaces and types, and descriptive lowercase filenames such as `deform.ts`. Keep exported APIs typed explicitly and preserve the strict settings in `tsconfig.json`. There is no separate formatter or linter; match neighboring code and let the type checker catch structural issues.

## Testing Guidelines

Tests use Vitest with `describe`, `it`, and `expect` in the Node environment. Name tests `<module>.test.ts` beside the implementation. Cover normal behavior, boundary values, malformed model input, and interpolation edge cases. Bug fixes should include a regression test that fails without the fix. Run a focused test while iterating, for example `pnpm test -- src/deform.test.ts`, then run the full suite.

## Commit & Pull Request Guidelines

The repository has no commit history yet. Use short, imperative commit subjects such as `Add smile parameter interpolation`; keep each commit focused. Pull requests should explain the motivation and behavior change, list validation commands run, and link relevant issues. Include screenshots or a short recording for changes to the editor or rendering output. Call out model-format or public API changes explicitly and update `README.md` when user-facing behavior changes.
