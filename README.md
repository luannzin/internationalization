<div align="center">

# 🌐 better-intl

**Filesystem-driven i18n for TypeScript.**

Your folder structure becomes a fully typed, statically-generated translation object — with zero runtime overhead.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

</div>

## Idea

Colocate translations with the feature they belong to. Drop a `t.ts` next to your
component and write each key **once**, with all its locales inline:

```
app/
├── homepage/
│   ├── page.tsx
│   └── t.ts
└── dashboard/
    └── stats/
        └── t.ts
```

```ts
// app/homepage/t.ts
export default {
  title: { en: "Hello {name}", pt: "Olá {name}" },
  hero: {
    subtitle: { en: "Welcome", pt: "Bem-vindo" },
  },
}
```

You author **locale-per-key** (you think "I need to translate _Delete account_", not "I
need to edit the English file"), and a missing locale is obvious right at the call site.
better-intl scans every `t.ts`, **transposes** it into a locale-keyed object, and writes a
single typed module:

```ts
// src/i18n/generated.ts (auto-generated)
export const t = {
  en: { homepage: { title: (v: { name: string }) => `Hello ${v.name}`, hero: { subtitle: "Welcome" } } },
  pt: { homepage: { title: (v: { name: string }) => `Olá ${v.name}`,  hero: { subtitle: "Bem-vindo" } } },
} as const
```

Consume it with the locale up front — safe for per-request SSR, zero runtime:

```ts
import { getT } from "@/i18n/generated"

const t = getT("pt")
t.homepage.title({ name: "Ada" }) // "Olá Ada"
t.homepage.hero.subtitle          // "Bem-vindo"
```

## Setup (Next.js)

```ts
// next.config.ts
import { withInternationalization } from "better-intl/next"

export default withInternationalization({
  reactStrictMode: true,
})
```

That's the whole integration. `next dev` generates once then watches your `t.ts` files
(Next's own watcher picks up the rewritten `generated.ts` → HMR); `next build` generates
once before compiling. No bundler plugins.

## Configuration

Optional `intl.config.ts` (or `.js` / `.mjs`) at your project root:

```ts
// intl.config.ts
import type { I18nUserConfig } from "better-intl"

export default {
  root: "./app",                  // where to scan for t.ts (default: ./app)
  out: "./src/i18n/generated.ts", // where to write the module
  defaultLocale: "en",            // canonical shape + ultimate fallback
  locales: ["en", "pt", "es"],    // required set; omit to use the union found in source
  onMissing: "warn",              // "error" | "warn" | "silent" (default: "warn")
  fallback: { es: ["pt"] },       // per-locale chains; defaultLocale is always appended
} satisfies I18nUserConfig
```

Inline overrides also work: `withInternationalization(nextConfig, { root: "./src/app" })`
take precedence over the config file.

### Fallback & missing keys

When a key lacks a required locale, better-intl walks its fallback chain
(`locale → fallback[locale]… → defaultLocale`). If nothing resolves, `onMissing` decides:

- `"error"` — fail the build, listing every gap.
- `"warn"` — log the gaps, fill from whatever the key does have.
- `"silent"` — fill quietly.

> A `t.ts` node whose values are all strings is treated as a **locale map** (a translation
> entry). Nest plain objects to group keys (`stats: { users: { en, pt } }`).
