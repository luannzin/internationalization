import { resolve } from "pathe";
import type { I18nConfig, I18nUserConfig } from "./types.js";

const DEFAULTS = {
	root: "./app",
	defaultLocale: "en",
	out: "./src/i18n/generated.ts",
	onMissing: "warn",
} satisfies Omit<I18nConfig, "locales" | "fallback">;

/**
 * Apply defaults and normalise paths. `root`/`out` are resolved to absolute
 * paths against `cwd` so the scanner and writer behave the same regardless of
 * where generation is invoked.
 */
export function defineConfig(user: I18nUserConfig = {}): I18nConfig {
	const cwd = process.cwd();
	return {
		root: resolve(cwd, user.root ?? DEFAULTS.root),
		defaultLocale: user.defaultLocale ?? DEFAULTS.defaultLocale,
		locales: user.locales,
		out: resolve(cwd, user.out ?? DEFAULTS.out),
		onMissing: user.onMissing ?? DEFAULTS.onMissing,
		fallback: user.fallback,
	};
}
