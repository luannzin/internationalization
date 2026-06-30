<div align="center">

# 🌐 better-intl

**The simplest way to build internationalization in Next.js — fully typed, file-based, zero runtime.**

Stop managing translation files. Stop jumping between locales.
Just colocate translations with your features and import a single `t`.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

</div>

# ⚡ The idea

Instead of splitting translations across files per language:

```
/locales/en.json
/locales/pt.json
/locales/es.json
```

You write translations **next to the feature they belong to**, once:

```ts
// app/homepage/t.ts
export default {
  title: { en: "Hello {name}", pt: "Olá {name}" },
  hero: {
    subtitle: { en: "Welcome", pt: "Bem-vindo" },
  },
}
```

That’s it.

You think in **features**, not files.
You think in **meaning**, not locales.

---

# 🚀 What you get

From those `t.ts` files, better-intl generates a **fully typed translation tree**:

```ts
import { t } from "@/i18n/generated"

t.homepage.title({ name: "Ada" }) // "Olá Ada"
t.homepage.hero.subtitle          // "Bem-vindo"
```

### No hooks

### No providers

### No runtime i18n library

### No string keys

### No missing translations at runtime

Just TypeScript + generated code.

---

# 🧠 Mental model

better-intl does one thing:

> It transforms your `t.ts` files into a single typed translation object grouped by feature path.

Pipeline:

```
t.ts files (feature-based)
        ↓
scan project structure
        ↓
transpose locales into keys
        ↓
generate typed module
        ↓
you import a single `t`
```

The file system becomes your i18n structure.

---

# ⚙️ Setup (Next.js)

### 1. Install

```bash
bun add better-intl
```

---

### 2. Add the plugin

```ts
// next.config.ts
import { withInternationalization } from "better-intl/next"

export default withInternationalization({
  reactStrictMode: true,
})
```

That’s it. No webpack plugins. No runtime setup.

---

### 3. Configure

```ts
// intl.config.ts
import type { I18nUserConfig } from "better-intl"

export default {
  root: "./src",
  out: "./src/i18n/generated.ts",

  defaultLocale: "en",
  locales: ["en", "pt", "es"],

  onMissing: "warn",

  fallback: {
    es: ["pt"],
  },

  storage: {
    type: "cookie",
    key: "locale",
  },
} satisfies I18nUserConfig
```

---

### 4. There's no step 4

The generated module already exports everything bound to your `translations`
and config — there's no `lib/i18n` wiring to write. Import `t` straight from it:

```ts
import { t, setLocale, updateLocale } from "@/i18n/generated"
```

`t` is the active locale's slice (sync on both client and server), `setLocale()`
fills the per-request locale once in your root layout, and `updateLocale(locale)`
persists a new preference to the cookie. They are produced by `createI18n`, which
the generator calls for you — you never pass `translations` or `intlConfig`.

---

### 5. Initialize locale once (App Router)

```tsx
// app/layout.tsx
import { Suspense } from "react"
import { setLocale } from "@/i18n/generated"

async function Localized({ children }: { children: React.ReactNode }) {
  await setLocale()
  return children
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={null}>
          <Localized>{children}</Localized>
        </Suspense>
      </body>
    </html>
  )
}
```

---

# 🧩 Usage

### Define translations next to your feature

```ts
// src/components/header/t.ts
export default {
  greeting: { en: "Hello {name}", pt: "Olá {name}" },
  nav: {
    home: { en: "Home", pt: "Início" },
  },
}
```

---

### Use anywhere (server or client)

```tsx
import { t } from "@/i18n/generated"

export function Header() {
  return (
    <header>
      <h1>{t.components.header.greeting({ name: "Ada" })}</h1>
      <a>{t.components.header.nav.home}</a>
    </header>
  )
}
```

No hooks. No async. No context.

---

# 🌍 Locale resolution

better-intl resolves locale in this order:

1. user stored preference (cookie)
2. browser / Accept-Language
3. fallback chain
4. defaultLocale

Region-aware matching is supported:

```
pt-BR → pt
```

---

# 🔁 Fallback system

If a translation is missing:

```
locale → fallback → defaultLocale
```

Control behavior:

| mode   | behavior                 |
| ------ | ------------------------ |
| error  | fail build               |
| warn   | log + fallback (default) |
| silent | fallback silently        |

---

# 🧪 Why this exists

Traditional i18n forces you to think like this:

> “Which file contains this string?”

better-intl flips it:

> “Which feature contains this meaning?”

---

# 🔥 Compared to existing solutions

### next-intl / i18next / formatjs

| Problem                         | better-intl  |
| ------------------------------- | ------------ |
| runtime translation lookup      | ❌ removed    |
| string keys                     | ❌ removed    |
| provider/hook boilerplate       | ❌ removed    |
| missing translations at runtime | ❌ impossible |
| feature-based organization      | ✅ built-in   |
| full type inference             | ✅ native     |

---

# 🧠 What makes it different

* Feature-based colocation (`t.ts`)
* Build-time transformation
* Fully typed translation tree
* Zero runtime dependency
* Synchronous usage everywhere
* Token-aware typing (`{ name }`)
* Next.js-first design

---

# 📦 Configuration reference

| option        | default        | description      |
| ------------- | -------------- | ---------------- |
| root          | `./app`        | scan root        |
| out           | `generated.ts` | output file      |
| defaultLocale | `en`           | fallback         |
| locales       | inferred       | supported        |
| onMissing     | `warn`         | missing handling |
| fallback      | `{}`           | fallback map     |
| storage       | cookie         | persistence      |

---

# 🧭 Philosophy

better-intl is built on one belief:

> Localization should follow your codebase structure — not fight it.
