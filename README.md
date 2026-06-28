<div align="center">

# 🌐 better-intl

**The easiest and most intuitive internationalization framework for Next.js.**

Colocate translations with your features, write each key once with all its locales inline,
and consume a single fully-typed, auto-generated `t` — with zero runtime overhead.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

</div>

## Why better-intl

Drop a `t.ts` next to the feature it belongs to and write **locale-per-key** — you think
"I need to translate _Delete account_", not "I need to edit the English file", and a missing
locale is obvious right at the call site:

```ts
// app/homepage/t.ts
export default {
  title: { en: "Hello {name}", pt: "Olá {name}" },
  hero: {
    subtitle: { en: "Welcome", pt: "Bem-vindo" },
  },
}
```

better-intl scans every `t.ts`, **transposes** it into a locale-keyed module, and gives you a
single typed `t`. There's **no runtime library** — your app only imports the generated file —
and `{tokens}` become typed functions automatically:

```tsx
import { t } from "@/lib/i18n"

t.homepage.title({ name: "Ada" }) // "Olá Ada"  ← fully typed, autocompleted
t.homepage.hero.subtitle          // "Bem-vindo"
```

---

## Setup

### 1. Install

```bash
bun add better-intl
```

> Peers: `next` and `react` (you already have them in a Next app).

### 2. Add the Next.js plugin

```ts
// next.config.ts
import { withInternationalization } from "better-intl/next"

export default withInternationalization({
  reactStrictMode: true,
})
```

That's the whole build integration. `next dev` generates once and watches your `t.ts` files
(Next's own watcher picks up the rewritten module → HMR); `next build` generates once before
compiling. No bundler plugins.

### 3. Configure locales & storage

Create an `intl.config.ts` (or `.js` / `.mjs`) at your project root:

```ts
// intl.config.ts
import type { I18nUserConfig } from "better-intl"

export default {
  root: "./src",                  // where to scan for t.ts (default: "./app")
  out: "./src/i18n/generated.ts", // where the typed module is written
  defaultLocale: "en",            // canonical shape + ultimate fallback
  locales: ["en", "pt", "es"],    // required set; omit to use the union found in source
  onMissing: "warn",              // "error" | "warn" | "silent" (default: "warn")
  fallback: { es: ["pt"] },       // per-locale chains; defaultLocale is always appended
  storage: {                      // where the user's locale preference is stored
    type: "cookie",               // "cookie" (SSR + CSR) | "localStorage" (CSR only)
    key: "locale",                // cookie name / storage key
  },
} satisfies I18nUserConfig
```

### 4. Create your `lib/i18n` helpers

Three tiny files give you one `t` that works in **every** component — client or server — and
resolves the active locale automatically.

```ts
// lib/i18n/client.ts — synchronous: cookie/localStorage + navigator
import { findLocaleClient } from "better-intl/runtime"
import { t as translations, intlConfig } from "@/i18n/generated"

export const t = findLocaleClient(translations, intlConfig)
```

```ts
// lib/i18n/server.ts — synchronous t over a per-request store
import { createServerT } from "better-intl/runtime"
import { t as translations, intlConfig } from "@/i18n/generated"

export const { t, setLocale } = createServerT(translations, intlConfig)
```

```ts
// lib/i18n/index.ts — pick the right one per environment
import { t as clientT } from "./client"
import { t as serverT } from "./server"

export const t = typeof window !== "undefined" ? clientT : serverT
export { setLocale } from "./server"
```

### 5. Resolve the locale once in your root layout

The server locale lives in a cookie (per request, async), so you read it **once** at the top
of the tree. Every Server Component below then uses `t` synchronously.

```tsx
// app/layout.tsx
import { Suspense } from "react"
import { setLocale } from "@/lib/i18n"

async function Localized({ children }: { children: React.ReactNode }) {
  await setLocale() // reads the cookie, fills the per-request store
  return <>{children}</>
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {/* <Suspense> is required under `cacheComponents` (reading a cookie is dynamic) */}
        <Suspense fallback={null}>
          <Localized>{children}</Localized>
        </Suspense>
      </body>
    </html>
  )
}
```

✅ That's it. You never pass a locale by hand again.

---

## Usage

### 1. Add translations

Drop a `t.ts` anywhere under your scan `root`, next to the feature that uses it:

```ts
// src/components/header/t.ts
export default {
  greeting: { en: "Hello {name}", pt: "Olá {name}", es: "Hola {name}" },
  nav: {
    home: { en: "Home", pt: "Início", es: "Inicio" },
  },
}
```

Save — the generated module updates automatically (HMR in dev). The feature path becomes the
key path: this file is reachable at `t.components.header.greeting`.

### 2. Use `t` anywhere

Import the single `t` and read it like any typed object — **synchronously**, in Server or
Client Components, no `await`:

```tsx
// a Server Component (or a "use client" one — same import)
import { t } from "@/lib/i18n"

export function Header() {
  return (
    <header>
      <h1>{t.components.header.greeting({ name: "Ada" })}</h1>
      <a href="/">{t.components.header.nav.home}</a>
    </header>
  )
}
```

Missing keys, wrong locale names, and missing `{tokens}` are all **TypeScript errors**.

### 3. Let users switch the locale

`updateLocale` persists the choice to your configured storage (cookie/`localStorage` on the
client, or a cookie via a Server Action / Route Handler on the server), then refresh:

```tsx
"use client"
import { useRouter } from "next/navigation"
import { updateLocale } from "better-intl/runtime"
import { intlConfig } from "@/i18n/generated"

export function LocaleSwitcher() {
  const router = useRouter()
  const set = async (locale: string) => {
    await updateLocale(locale, intlConfig)
    router.refresh()
  }
  return (
    <select onChange={(e) => set(e.target.value)}>
      <option value="en">English</option>
      <option value="pt">Português</option>
      <option value="es">Español</option>
    </select>
  )
}
```

---

## How locale resolution works

`findLocaleClient` / `createServerT` resolve the active locale in this order:

1. the **stored preference** — the cookie or `localStorage` from your `storage` config;
2. else the **browser** (`navigator.languages`, client) or the **`Accept-Language`** header
   (`next/headers`, server);
3. else `defaultLocale`.

Candidates are matched tolerant of region subtags — `pt-BR` resolves to a supported `pt`.

> **Why `setLocale` + a per-request store?** `t.x.y` is synchronous, but `cookies()` is async
> in Next. `createServerT` resolves the locale once (in `setLocale`, during render) into a
> request-scoped store (React's `cache()`), and `t` is a proxy reading it synchronously. Each
> request gets its own store (concurrency-safe), and it never hangs the prerender under
> `cacheComponents` — only `setLocale` touches `cookies()`. Don't write
> `export const t = await findLocaleServer(...)` at module top level: a module evaluates once
> (the locale would freeze across requests) and the top-level `await cookies()` hangs.

## Fallback & missing keys

When a key lacks a required locale, better-intl walks its fallback chain
(`locale → fallback[locale]… → defaultLocale`). If nothing resolves, `onMissing` decides:

| `onMissing` | Behaviour |
| ----------- | --------- |
| `"error"`   | fail the build, listing every gap |
| `"warn"`    | log the gaps, fill from whatever the key does have (default) |
| `"silent"`  | fill quietly |

> A `t.ts` node whose values are all strings is a **locale map** (a translation entry). Nest
> plain objects to group keys: `stats: { users: { en, pt } }` → `t.stats.users`.

## Configuration reference

| Option          | Default                      | Description |
| --------------- | ---------------------------- | ----------- |
| `root`          | `"./app"`                    | Directory scanned for `t.ts` files |
| `out`           | `"./src/i18n/generated.ts"`  | Where the typed module is written |
| `defaultLocale` | `"en"`                       | Canonical shape + ultimate fallback |
| `locales`       | union found in source        | Required locale set |
| `onMissing`     | `"warn"`                     | `"error"` \| `"warn"` \| `"silent"` |
| `fallback`      | `{}`                         | Per-locale fallback chains, e.g. `{ es: ["pt"] }` |
| `storage`       | `{ type: "cookie", key: "locale" }` | Where the locale preference is stored |

Inline overrides take precedence over the file:
`withInternationalization(nextConfig, { root: "./src/app" })`.
