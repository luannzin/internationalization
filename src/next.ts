/**
 * Next.js plugin for internationalization.
 *
 * Zero dependency on webpack, Turbopack, or any bundler internals.
 * Works by generating translations at config-load time (pure Node.js):
 *
 *   - `next dev`   → generates once, then watches for changes (HMR via file watcher)
 *   - `next build` → generates once before compilation starts
 *
 * When a translation file changes during dev, `generated.ts` is rewritten on
 * disk. Next.js's own file watcher picks up the change → HMR. No plugins needed.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withInternationalization } from "better-intl/next";
 *
 * export default withInternationalization({
 *   reactStrictMode: true,
 * });
 * ```
 */

import { runGenerate, watch } from "./codegen/run.js";
import { defineConfig } from "./config.js";
import { loadUserConfig } from "./loadConfig.js";
import type { I18nUserConfig } from "./types.js";

/** Guard against duplicate initialization (dev server restarts, etc.). */
let active = false;

/**
 * Wrap your Next.js config to enable automatic translation generation.
 *
 * Generic over the config shape so it accepts and returns your config
 * unchanged — including Next's own `NextConfig` type, which is not assignable to
 * a loose `{ [key: string]: unknown }`. `better-intl` keeps `next` an optional
 * peer, so it never imports Next's types directly.
 *
 * @param nextConfig  — your regular Next.js configuration object
 * @param i18nConfig  — optional i18n overrides (root, defaultLocale, out, locales)
 * @returns the same Next.js config, after translations have been generated
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withInternationalization } from "better-intl/next";
 *
 * export default withInternationalization({
 *   reactStrictMode: true,
 * });
 * ```
 *
 * @example
 * ```ts
 * // next.config.ts — with custom i18n options
 * import { withInternationalization } from "better-intl/next";
 *
 * export default withInternationalization(
 *   { reactStrictMode: true },
 *   { root: "./locales", out: "./src/i18n/generated.ts" },
 * );
 * ```
 */
export async function withInternationalization<T extends object = object>(
	nextConfig: T = {} as T,
	i18nConfig?: I18nUserConfig,
): Promise<T> {
	if (!active) {
		active = true;
		// Merge the optional `intl.config.*` under any inline overrides passed here.
		const fileConfig = await loadUserConfig();
		const resolved = defineConfig({ ...fileConfig, ...i18nConfig });

		if (process.env.NODE_ENV === "production") {
			const locales = await runGenerate(resolved);
			console.log(`[i18n] generated ${resolved.out} → ${locales.join(", ")}`);
		} else {
			// watch() runs initial generation, then watches for changes.
			// When a translation file changes → generated.ts is rewritten →
			// Next.js picks it up via its own file watcher → HMR. No plugins.
			await watch(resolved);
		}
	}

	return nextConfig;
}
