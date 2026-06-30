import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "pathe";
import { runGenerate } from "./codegen/run.js";
import { defineConfig } from "./config.js";
import { loadUserConfig } from "./loadConfig.js";

/** `intl.config.ts` written to the project root on `init`. */
const CONFIG_TEMPLATE = `import type { I18nUserConfig } from "better-intl"

export default {
	// Directory scanned for colocated \`t.ts\` files.
	root: "./app",

	// Where the generated module is written.
	out: "./src/i18n/generated.ts",

	// Canonical locale + ultimate fallback.
	defaultLocale: "en",
	locales: ["en", "pt"],

	// "error" | "warn" | "silent" — behaviour when a key misses a locale.
	onMissing: "warn",

	// Where the active locale preference is persisted (cookie is the only store).
	storage: { type: "cookie", key: "locale" },
} satisfies I18nUserConfig
`;

/** A starter leaf so the first generate has something to transpose. */
const STARTER_LEAF = `export default {
	homepage: {
		title: { en: "Hello {name}", pt: "Olá {name}" },
		subtitle: { en: "Welcome", pt: "Bem-vindo" },
	},
}
`;

/** Write `file` with `content` unless it already exists. Returns what happened. */
async function writeIfAbsent(
	file: string,
	content: string,
): Promise<"created" | "skipped"> {
	if (existsSync(file)) return "skipped";
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, content, "utf8");
	return "created";
}

function log(action: "created" | "skipped", rel: string): void {
	const tag = action === "created" ? "+" : "=";
	const note = action === "skipped" ? " (already exists, left as-is)" : "";
	console.log(`[i18n] ${tag} ${rel}${note}`);
}

/**
 * Scaffold a fresh better-intl setup in the current project: write
 * `intl.config.ts`, drop a starter `app/t.ts`, run the first generate, then
 * print the remaining manual wiring (Next plugin + layout). Idempotent — any
 * file that already exists is left untouched.
 */
export async function runInit(): Promise<void> {
	const cwd = process.cwd();

	const configPath = resolve(cwd, "intl.config.ts");
	log(await writeIfAbsent(configPath, CONFIG_TEMPLATE), "intl.config.ts");

	// Resolve `root` from whatever config now applies so the starter leaf lands
	// where the generator will actually scan.
	const config = defineConfig(await loadUserConfig());
	const leafPath = resolve(config.root, "t.ts");
	log(
		await writeIfAbsent(leafPath, STARTER_LEAF),
		`${resolve(config.root).replace(`${cwd}/`, "")}/t.ts`,
	);

	const locales = await runGenerate(config);
	console.log(
		`[i18n] + ${config.out.replace(`${cwd}/`, "")} -> ${locales.join(", ")}`,
	);

	printNextSteps();
}

function printNextSteps(): void {
	console.log(`
[i18n] Setup ready. Two manual steps left:

1. Wrap your Next config:

   // next.config.ts
   import { withInternationalization } from "better-intl/next"
   export default withInternationalization({ /* your config */ })

2. Fill the locale once per request in the root layout:

   // app/layout.tsx
   import { Suspense } from "react"
   import { setLocale } from "@/i18n/generated"

   async function Localized({ children }) {
     await setLocale()
     return children
   }

   export default function RootLayout({ children }) {
     return <html><body><Suspense>{<Localized>{children}</Localized>}</Suspense></body></html>
   }

Then import { t } from "@/i18n/generated" anywhere — sync on client and server.
`);
}
