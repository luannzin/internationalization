<div align="center">

# 🌐 internationalization

**Filesystem-driven i18n for TypeScript.**

Your folder structure becomes a fully typed, statically-generated translation object — with zero runtime overhead.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

</div>

---

## Why?

Most i18n libraries force you into JSON files, key-based lookups, and runtime overhead.
**internationalization** takes a different approach:

- 📂 **Folders are namespaces** — your file tree _is_ your translation structure
- 🔒 **Fully typed** — generated TypeScript gives you autocomplete and compile-time safety
- ⚡ **Zero runtime** — translations are inlined at build time, no lookups or parsing
- 🔄 **Placeholder interpolation** — `"Hello {name}"` becomes `(v: { name: string }) => \`Hello ${v.name}\``
- 👀 **Watch mode** — regenerates on every file change during development

---

## Installation

```bash
pnpm add internationalization
```

```bash
npm install internationalization
```

```bash
yarn add internationalization
```

> **Peer dependency:** `esbuild` is required for loading `.ts` leaf files at generation time.

---

## Quick Start

### 1. Create your translation folders

```
translations/
├── en/
│   └── homepage/
│       └── hero/
│           └── t.ts
└── pt/
    └── homepage/
        └── hero/
            └── t.ts
```

Each `t.ts` file exports a flat object with your translations:

```ts
// translations/en/homepage/hero/t.ts
export const t = {
  title: "Hello {name}",
  subtitle: "Welcome to our platform",
} as const;
```

```ts
// translations/pt/homepage/hero/t.ts
export const t = {
  title: "Olá {name}",
  subtitle: "Bem-vindo à nossa plataforma",
} as const;
```

### 2. Generate the typed module

```bash
npx i18n-gen
```

This scans your `translations/` folder and writes a fully typed module:

```ts
// src/i18n/generated.ts  (auto-generated — do not edit)

export const t = {
  en: {
    homepage: {
      hero: {
        title: (v: { name: string }) => `Hello ${v.name}`,
        subtitle: "Welcome to our platform",
      },
    },
  },
  pt: {
    homepage: {
      hero: {
        title: (v: { name: string }) => `Olá ${v.name}`,
        subtitle: "Bem-vindo à nossa plataforma",
      },
    },
  },
} as const;

export type Locale = keyof typeof t; // "en" | "pt"

export function getT<L extends Locale>(locale: L): (typeof t)[L] {
  return t[locale];
}
```

### 3. Use it

```ts
import { t } from "./i18n/generated";

t.en.homepage.hero.title({ name: "World" }); // "Hello World"
t.en.homepage.hero.subtitle;                  // "Welcome to our platform"
t.pt.homepage.hero.title({ name: "Mundo" }); // "Olá Mundo"
```

Or access it dynamically with a locale variable:

```ts
import { t, type Locale } from "./i18n/generated";

const locale: Locale = "pt";

t[locale].homepage.hero.title({ name: "Mundo" }); // "Olá Mundo"
t[locale].homepage.hero.subtitle;                  // "Bem-vindo à nossa plataforma"
```

Full autocomplete. Full type safety. Zero runtime lookups.

---

## Configuration

Create an optional `i18n.config.ts` at your project root:

```ts
import { defineConfig } from "internationalization";

export default defineConfig({
  root: "./translations",        // where your locale folders live
  defaultLocale: "en",           // canonical locale
  locales: ["en", "pt", "es"],   // explicit allow-list (optional)
  out: "./src/i18n/generated.ts" // where the generated module is written
});
```

All fields are optional — sensible defaults are applied.

| Option          | Default                      | Description                                    |
|-----------------|------------------------------|------------------------------------------------|
| `root`          | `"./translations"`           | Directory containing locale folders            |
| `defaultLocale` | `"en"`                       | The canonical locale used as the base shape     |
| `locales`       | _auto-detected from folders_ | Explicit locale allow-list                      |
| `out`           | `"./src/i18n/generated.ts"`  | Output path for the generated module            |

---

## CLI

```bash
# One-shot generation
npx i18n-gen

# Watch mode — regenerates on every change
npx i18n-gen --watch
```

Add it to your `package.json` scripts:

```json
{
  "scripts": {
    "i18n:gen": "i18n-gen",
    "i18n:watch": "i18n-gen --watch"
  }
}
```

---

## Usage with Next.js

A complete setup for server and client components with App Router.

### Project structure

```
my-app/
├── translations/
│   ├── en/
│   │   ├── common/
│   │   │   └── t.ts          ← shared keys (nav, footer)
│   │   └── homepage/
│   │       └── hero/
│   │           └── t.ts      ← page-specific keys
│   └── pt/
│       ├── common/
│       │   └── t.ts
│       └── homepage/
│           └── hero/
│               └── t.ts
├── src/
│   ├── i18n/
│   │   ├── generated.ts      ← auto-generated
│   │   └── context.tsx        ← locale provider (just the locale string)
│   └── app/
│       ├── [locale]/
│       │   ├── layout.tsx
│       │   └── page.tsx
│       └── middleware.ts
├── i18n.config.ts
└── package.json
```

### Translation files

```ts
// translations/en/common/t.ts
export const t = {
  nav: {
    home: "Home",
    about: "About",
    contact: "Contact",
  },
  footer: "© 2026 My App. All rights reserved.",
} as const;
```

```ts
// translations/en/homepage/hero/t.ts
export const t = {
  title: "Hello {name}",
  subtitle: "Build something amazing",
  cta: "Get Started",
} as const;
```

### Locale context

A thin context that shares the current locale string — components access `t[locale]` directly:

```tsx
// src/i18n/context.tsx
"use client";

import { createContext, useContext } from "react";
import { type Locale } from "./generated";

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useLocale must be used within <LocaleProvider>");
  return locale;
}
```

### Root layout with locale param

```tsx
// src/app/[locale]/layout.tsx
import { type Locale, t } from "@/i18n/generated";
import { LocaleProvider } from "@/i18n/context";

export function generateStaticParams() {
  return (Object.keys(t) as Locale[]).map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: Locale };
}) {
  return (
    <html lang={params.locale}>
      <body>
        <LocaleProvider locale={params.locale}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
```

### Server Component

```tsx
// src/app/[locale]/page.tsx
import { type Locale, t } from "@/i18n/generated";

export default function HomePage({
  params,
}: {
  params: { locale: Locale };
}) {
  return (
    <section>
      <h1>{t[params.locale].homepage.hero.title({ name: "World" })}</h1>
      <p>{t[params.locale].homepage.hero.subtitle}</p>
      <button>{t[params.locale].homepage.hero.cta}</button>
    </section>
  );
}
```

### Client Component

```tsx
// src/components/Navbar.tsx
"use client";

import Link from "next/link";
import { t } from "@/i18n/generated";
import { useLocale } from "@/i18n/context";

export function Navbar() {
  const locale = useLocale();

  return (
    <nav>
      <Link href="/">{t[locale].common.nav.home}</Link>
      <Link href="/about">{t[locale].common.nav.about}</Link>
      <Link href="/contact">{t[locale].common.nav.contact}</Link>
    </nav>
  );
}
```

### Middleware for locale detection

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { detectLocale } from "internationalization";
import { t, type Locale } from "@/i18n/generated";

const locales = Object.keys(t) as Locale[];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip if already has a locale prefix
  if (locales.some((l) => pathname.startsWith(`/${l}`))) {
    return NextResponse.next();
  }

  // Detect locale from Accept-Language header
  const acceptLang = request.headers.get("accept-language");
  const preferred = acceptLang
    ?.split(",")
    .map((s) => s.split(";")[0]!.trim())
    ?? [];

  const locale = detectLocale({
    supported: locales,
    fallback: "en" as Locale,
    prefer: preferred,
  });

  // Redirect to the detected locale
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
```

### Dev scripts

```json
{
  "scripts": {
    "dev": "concurrently 'i18n-gen --watch' 'next dev'",
    "build": "i18n-gen && next build",
    "i18n:gen": "i18n-gen"
  }
}
```

> **Tip:** Use [`concurrently`](https://www.npmjs.com/package/concurrently) to run the i18n watcher alongside Next.js dev server.

---

## Programmatic API

```ts
import { defineConfig, runGenerate } from "internationalization";

const config = defineConfig({ root: "./translations" });

// One-shot generation
const locales = await runGenerate(config);
console.log("Generated:", locales); // ["en", "pt"]
```

```ts
import { detectLocale } from "internationalization";

const locale = detectLocale({
  supported: ["en", "pt", "es"],
  fallback: "en",
  prefer: ["pt-BR"], // matches "pt" via subtag
});
// → "pt"
```

---

## How It Works

```
translations/           ← folder structure defines the shape
├── en/
│   └── homepage/
│       └── hero/
│           └── t.ts    ← export const t = { title: "Hello {name}" }
└── pt/
    └── ...

      ↓  i18n-gen (scan → load → emit)

src/i18n/generated.ts   ← fully typed, statically generated module
```

1. **Scan** — recursively walks the `root` directory collecting every `t.ts` leaf file
2. **Load** — evaluates each leaf via `esbuild` (supports TypeScript natively)
3. **Build tree** — assembles the folder hierarchy into a nested object tree
4. **Emit** — generates a TypeScript module with typed interpolation functions

Strings with `{token}` placeholders become typed arrow functions:

```
"Hello {name}" → (v: { name: string }) => `Hello ${v.name}`
```

Plain strings remain as string literals. The result is a single, tree-shakeable module with full IntelliSense support.

---

## License

[ISC](LICENSE)
