# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`better-intl` is a build-time i18n code generator for TypeScript/Next.js. Developers colocate one `t.ts` per feature (anywhere under the scan root, default `./app`) and author **locale-per-key** entries — `title: { en: "Hello", pt: "Olá" }`. The generator scans every `t.ts`, **transposes** that authoring shape into a locale-keyed object, and emits a single fully-typed `generated.ts` module (a plain `as const` object plus a `getT` accessor). **There is no runtime library** — the only thing the user's app imports at runtime is the generated file. The package ships the *generator*, not a translation engine.

Consumption is locale-first: `getT("pt").homepage.title(...)` / `t["pt"].homepage.title`. Keeping the locale explicit is deliberate — a global ambient locale is unsafe under concurrent SSR. The `better-intl/runtime` entry adds `findLocaleClient`/`findLocaleServer(translations, intlConfig)` so apps don't pass the locale by hand: they resolve the active locale (stored preference → browser/`Accept-Language` → `defaultLocale`) and return that locale's slice of `t`. See "Runtime locale helpers" below.

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

1. **Config** ([src/config.ts](src/config.ts)) — `defineConfig` applies defaults (`root: ./app`, `defaultLocale: en`, `out: ./src/i18n/generated.ts`, `onMissing: warn`, `storage: { type: cookie, key: locale }`) and resolves `root`/`out` to absolute paths against `cwd`. An optional `intl.config.{ts,js,mjs}` at the project root is loaded by [src/loadConfig.ts](src/loadConfig.ts) (shared by both the CLI and the Next plugin).

2. **Scan** ([src/scanner/walk.ts](src/scanner/walk.ts)) — recursively collects every file literally named `t.ts` under `root`. Sibling directories are walked **in parallel**, and heavy folders (`node_modules`, `.next`, `.git`, `dist`, `.turbo`, `.vercel`) are skipped. Leaf order doesn't affect output (the tree is keyed by path and emitted sorted), so there's no post-sort.

3. **Load leaf** ([src/codegen/loadLeaf.ts](src/codegen/loadLeaf.ts)) — each `t.ts` is evaluated through esbuild (bundle-require), so TS/ESM leaves run without a separate build. A leaf must `export const t = {…}` or `export default {…}`; the value is a `TranslationTree` (nested groups whose leaves are locale maps), **not** a resolved string map. Results are **memoised by path + (mtime, size)** in a process-level cache — bundle-require is the dominant cost, so on the watch path a regen only re-evaluates the leaves that actually changed (~30×+ faster warm). `pruneLeafCache` drops entries for deleted files after each scan.

4. **Build tree** ([src/scanner/buildTree.ts](src/scanner/buildTree.ts)) — folder path segments (relative to `root`, minus the trailing `t.ts`) become nested feature keys: `app/homepage/hero/t.ts` → `tree.homepage.hero.leaf`. **There is no locale segment** — locale lives inside each leaf, not in the path.

5. **Transpose** ([src/codegen/transpose.ts](src/codegen/transpose.ts)) — the heart of the new model. Inverts the feature tree (leaves = locale maps) into `{ [locale]: resolvedTree }`. Key behaviours:
   - **Structural detection**: a node whose values are *all strings* is a locale map (a translation entry); a node with object values is a group to recurse into. This is why `title: { en, pt }` works as a plain object with no helper wrappers.
   - **Required locales** = `config.locales` if set, else the union of every locale key seen.
   - **Fallback chain** per locale: `locale → config.fallback[locale]… → defaultLocale`.
   - **Folder/leaf merge + collision**: a colocated `t.ts`'s keys merge with sibling folders; a name that is both a folder and a leaf key throws "Key collision".
   - **Missing handling** via `config.onMissing` (`error` throws and fails the build, `warn` logs grouped gaps then fills best-effort, `silent` fills quietly). Unexpected locales (in source but not in `config.locales`) are reported the same way.

6. **Emit** ([src/codegen/emit.ts](src/codegen/emit.ts)) — prints the transposed `{ [locale]: resolvedTree }` plain object. A resolved string with `{token}` placeholders ([src/codegen/placeholders.ts](src/codegen/placeholders.ts)) becomes an interpolation arrow function: `"Olá {name}"` → `(v: { name: string }) => \`Olá ${v.name}\``; plain strings stay quoted literals. Output is `export const t = {…} as const`, plus `type Locale = keyof typeof t`, `getT<L>(locale)`, and **`export const intlConfig`** (`{ defaultLocale, locales, storage }`) — the runtime-config channel the `better-intl/runtime` helpers consume. The generated file stays import-free (`intlConfig` is plain data).

7. **Write** ([src/codegen/generate.ts](src/codegen/generate.ts)) — compares the new source against the current `config.out` and **skips the write when byte-identical**, so an unrelated save (or a change that doesn't alter output) doesn't touch the file and needlessly trip Next's watcher into HMR. Otherwise `mkdir -p` and write. An empty scan (no `t.ts` found) throws rather than writing an empty module.

[src/i18n/generated.ts](src/i18n/generated.ts) is a committed *example* of generator output — auto-generated; do not hand-edit it (regenerating overwrites it).

## Entry points

- **Next.js plugin (primary)** — [src/next.ts](src/next.ts): `withInternationalization(nextConfig, i18nConfig?)` wraps `next.config`. It loads `intl.config.*` and merges any inline `i18nConfig` over it. In production it generates once; in dev it calls `watch()` (initial gen + chokidar watcher). It deliberately touches no bundler internals — regenerating `generated.ts` on disk lets Next's own file watcher trigger HMR. A module-level `active` guard prevents duplicate init across dev restarts. The watcher ([src/codegen/run.ts](src/codegen/run.ts)) regenerates **only** when an actual leaf changes — it matches `basename(path) === "t.ts"` (note: `endsWith("t.ts")` would wrongly match `list.ts`/`component.ts`) — has no blanket `addDir`/`unlinkDir` handlers (leaf add/unlink already covers folder add/remove), and **debounces** (~75 ms) so a rename's unlink+add burst collapses into one pass.
- **CLI** — [src/cli.ts](src/cli.ts) (`i18n-gen` bin). Secondary; shares `loadUserConfig`/`runGenerate`.
- **Codegen library** — [src/index.ts](src/index.ts) re-exports `runGenerate`, `watch`, `defineConfig`, `detectLocale`, and the shared types. ⚠️ This entry imports the codegen, so it pulls in `node:fs`/`chokidar`/`bundle-require` — **never import app-runtime helpers from `better-intl`**; use `better-intl/runtime`.
- **Runtime** — [src/runtime.ts](src/runtime.ts) (`better-intl/runtime`): `findLocaleClient`, `findLocaleServer`, `updateLocale`, `detectLocale`/`matchLocale`. Imports **none** of the codegen, so it is safe in a client bundle.

### Runtime locale helpers ([src/runtime/locale.ts](src/runtime/locale.ts))

Resolution is **split by environment** rather than branched at runtime, so each side is honest about sync vs async:
- **`findLocaleClient(translations, intlConfig?)` — synchronous.** Reads stored preference (`document.cookie` or `localStorage` per `intlConfig.storage`) + `navigator.languages`. Sync so it can back `export const t = findLocaleClient(...)` in a module imported by client components without making it async. **Short-circuits to `defaultLocale` when `typeof window === "undefined"`** (e.g. evaluated during SSR via the `index.ts` merge), so it never reads missing browser globals.
- **`findLocaleServer(translations, intlConfig?)` — async.** Dynamically `import("next/headers")` (guarded by try/catch so non-Next servers degrade to `defaultLocale`) and reads the configured cookie + `Accept-Language`. Async because Next 15's `cookies()`/`headers()` are async. **Short-circuits to `defaultLocale` when `typeof window !== "undefined"` — so it never imports `next/headers` in the browser** (that's a server-only error). This is what makes `index.ts` importing both `./client` and `./server` safe in both environments: each helper resolves to the default in the wrong one and never throws.
- **`updateLocale(locale, intlConfig?)` — async, isomorphic.** Writes `document.cookie`/`localStorage` on CSR, or the cookie via `next/headers` on SSR (only valid inside a Server Action / Route Handler; no-op otherwise).

The documented best-practice app structure is `lib/i18n/{client,server,index}.ts`: `client.ts` does `export const t = findLocaleClient(...)`, `server.ts` does `export const t = await findLocaleServer(...)`, and `index.ts` picks `typeof window !== "undefined" ? clientT : serverT`. `intlConfig` is optional — the helpers derive `locales` from `Object.keys(translations)`, `defaultLocale` from the first key, and default storage to a `"locale"` cookie; passing the generated `intlConfig` is what honors the configured storage. Matching tolerates region subtags (`pt-BR` → `pt`) via `matchLocale`, shared with the lower-level `detectLocale` ([src/runtime/detectLocale.ts](src/runtime/detectLocale.ts)).

## Conventions

- Imports use explicit `.js` extensions on relative paths (ESM/`verbatimModuleSyntax`), even though sources are `.ts`. Path handling goes through `pathe` (POSIX-style separators), so `buildTree` can split on `/` unconditionally.
- `tsconfig` is strict with `noUncheckedIndexedAccess` — index access yields `T | undefined`; handle it.
- tsup marks `bundle-require`, `chokidar`, `esbuild`, and `next/headers` external — they resolve at runtime in the user's project, not bundled into `dist`. `next` is an optional peer (only the runtime SSR path needs it), so the two `import("next/headers")` calls carry a `// @ts-ignore` for the DTS build where `next` isn't installed.
- `types.ts` describes only the **build-time** in-memory representation; none of it ships to the runtime. The two string-map types are easy to confuse: `TranslationTree`/`LocaleMap` are the *authored* (locale-per-key) shape; `LeafValue` is the *resolved-per-locale* shape that `transpose` produces and `emit` prints.

## Naming caveat

The package is named `better-intl`, but `package.json`'s `description`/`keywords` still say "internationalization" and the `bin` is `i18n-gen`. The git history shows a recent rename — treat `better-intl` as the source of truth and fix stale references when you touch them.
