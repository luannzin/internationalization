# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`better-intl` is a build-time i18n code generator for TypeScript/Next.js. Developers colocate one `t.ts` per feature (anywhere under the scan root, default `./app`) and author **locale-per-key** entries — `title: { en: "Hello", pt: "Olá" }`. The generator scans every `t.ts`, **transposes** that authoring shape into a locale-keyed object, and emits a single fully-typed `generated.ts` module (a plain `as const` object plus a `getT` accessor). **There is no runtime library** — the only thing the user's app imports at runtime is the generated file. The package ships the *generator*, not a translation engine.

Consumption is locale-first: `getT("pt").homepage.title(...)` / `t["pt"].homepage.title`. Keeping the locale explicit is deliberate — a global ambient locale is unsafe under concurrent SSR. (A V2 locale-detection helper that lets you write `t.feature.key` directly is planned but not built.)

## Commands

- `pnpm build` — bundle `src/{index,cli,next}.ts` to `dist/` (ESM + CJS + `.d.ts`) via tsup. pnpm is the expected package manager.
- `pnpm dev` — tsup in watch mode (rebuilds the library on source change).
- `pnpm test` — runs `test/*.test.ts` via Node's built-in test runner with the tsx loader (`node --import tsx --test`). Note: `test/` is gitignored and currently absent — there are no committed tests.
- Run one test: `node --import tsx --test test/<name>.test.ts`.
- `pnpm i18n:gen` — invoke the built CLI (`dist/cli.js`); regenerates the output module. The CLI is **not** the primary path (the Next plugin is) and is kept working but not actively developed.

The CLI binary is `i18n-gen` (see `bin` in package.json). `i18n-gen --watch` / `-w` regenerates on change.

> Heads-up on `pnpm build`: a deps mismatch in this environment makes pnpm's pre-flight `install` fail before tsup runs. If that happens, build directly with `node ./node_modules/tsup/dist/cli-default.js`.

## Architecture: the generation pipeline

A single pass flows scan → load → build tree → **transpose** → emit → write. Entry points (Next plugin, CLI, programmatic) all funnel into `runGenerate(config)` ([src/codegen/generate.ts](src/codegen/generate.ts)).

1. **Config** ([src/config.ts](src/config.ts)) — `defineConfig` applies defaults (`root: ./app`, `defaultLocale: en`, `out: ./src/i18n/generated.ts`, `onMissing: warn`) and resolves `root`/`out` to absolute paths against `cwd`. An optional `intl.config.{ts,js,mjs}` at the project root is loaded by [src/loadConfig.ts](src/loadConfig.ts) (shared by both the CLI and the Next plugin).

2. **Scan** ([src/scanner/walk.ts](src/scanner/walk.ts)) — recursively collects every file literally named `t.ts` under `root`. Directory entries are sorted by name so output is deterministic across filesystems.

3. **Load leaf** ([src/codegen/loadLeaf.ts](src/codegen/loadLeaf.ts)) — each `t.ts` is evaluated through esbuild (bundle-require), so TS/ESM leaves run without a separate build. A leaf must `export const t = {…}` or `export default {…}`; the value is a `TranslationTree` (nested groups whose leaves are locale maps), **not** a resolved string map.

4. **Build tree** ([src/scanner/buildTree.ts](src/scanner/buildTree.ts)) — folder path segments (relative to `root`, minus the trailing `t.ts`) become nested feature keys: `app/homepage/hero/t.ts` → `tree.homepage.hero.leaf`. **There is no locale segment** — locale lives inside each leaf, not in the path.

5. **Transpose** ([src/codegen/transpose.ts](src/codegen/transpose.ts)) — the heart of the new model. Inverts the feature tree (leaves = locale maps) into `{ [locale]: resolvedTree }`. Key behaviours:
   - **Structural detection**: a node whose values are *all strings* is a locale map (a translation entry); a node with object values is a group to recurse into. This is why both `title: { en, pt }` work with no helper wrappers.
   - **Required locales** = `config.locales` if set, else the union of every locale key seen.
   - **Fallback chain** per locale: `locale → config.fallback[locale]… → defaultLocale`.
   - **Folder/leaf merge + collision**: a colocated `t.ts`'s keys merge with sibling folders; a name that is both a folder and a leaf key throws "Key collision".
   - **Missing handling** via `config.onMissing` (`error` throws and fails the build, `warn` logs grouped gaps then fills best-effort, `silent` fills quietly). Unexpected locales (in source but not in `config.locales`) are reported the same way.

6. **Emit** ([src/codegen/emit.ts](src/codegen/emit.ts)) — prints the transposed `{ [locale]: resolvedTree }` plain object. A resolved string with `{token}` placeholders ([src/codegen/placeholders.ts](src/codegen/placeholders.ts)) becomes an interpolation arrow function: `"Olá {name}"` → `(v: { name: string }) => \`Olá ${v.name}\``; plain strings stay quoted literals. Output is `export const t = {…} as const`, plus `type Locale = keyof typeof t` and `getT<L>(locale)`.

7. **Write** ([src/codegen/generate.ts](src/codegen/generate.ts)) — `mkdir -p` the out dir and write `config.out`. An empty scan (no `t.ts` found) throws rather than writing an empty module.

[src/i18n/generated.ts](src/i18n/generated.ts) is a committed *example* of generator output — auto-generated; do not hand-edit it (regenerating overwrites it).

## Entry points

- **Next.js plugin (primary)** — [src/next.ts](src/next.ts): `withInternationalization(nextConfig, i18nConfig?)` wraps `next.config`. It loads `intl.config.*` and merges any inline `i18nConfig` over it. In production it generates once; in dev it calls `watch()` (initial gen + chokidar watcher). It deliberately touches no bundler internals — regenerating `generated.ts` on disk lets Next's own file watcher trigger HMR. A module-level `active` guard prevents duplicate init across dev restarts.
- **CLI** — [src/cli.ts](src/cli.ts) (`i18n-gen` bin). Secondary; shares `loadUserConfig`/`runGenerate`.
- **Library** — [src/index.ts](src/index.ts) re-exports `runGenerate`, `watch`, `defineConfig`, `detectLocale`, and the shared types.

`detectLocale` ([src/runtime/detectLocale.ts](src/runtime/detectLocale.ts)) is the one genuinely runtime-side helper (a pure locale picker over `prefer` → `navigator.language` → `fallback`, matching full tag then primary subtag). It has no filesystem or request dependency, and is a building block for the planned V2 locale-detection ergonomics.

## Conventions

- Imports use explicit `.js` extensions on relative paths (ESM/`verbatimModuleSyntax`), even though sources are `.ts`. Path handling goes through `pathe` (POSIX-style separators), so `buildTree` can split on `/` unconditionally.
- `tsconfig` is strict with `noUncheckedIndexedAccess` — index access yields `T | undefined`; handle it.
- tsup marks `bundle-require`, `chokidar`, and `esbuild` external — they resolve at runtime in the user's project, not bundled into `dist`.
- `types.ts` describes only the **build-time** in-memory representation; none of it ships to the runtime. The two string-map types are easy to confuse: `TranslationTree`/`LocaleMap` are the *authored* (locale-per-key) shape; `LeafValue` is the *resolved-per-locale* shape that `transpose` produces and `emit` prints.

## Naming caveat

The package is named `better-intl`, but `package.json`'s `description`/`keywords` still say "internationalization" and the `bin` is `i18n-gen`. The git history shows a recent rename — treat `better-intl` as the source of truth and fix stale references when you touch them.
