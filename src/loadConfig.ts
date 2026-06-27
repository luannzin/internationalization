import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "pathe";
import type { I18nUserConfig } from "./types.js";

const CONFIG_FILES = ["intl.config.ts", "intl.config.js", "intl.config.mjs"];

/**
 * Load an optional `intl.config.{ts,js,mjs}` from the project root (cwd).
 *
 * TS configs are evaluated through esbuild (bundle-require) so they need no
 * separate build step; JS/MJS are imported directly. Returns `{}` when absent.
 */
export async function loadUserConfig(): Promise<I18nUserConfig> {
	const found = CONFIG_FILES.map((f) => resolve(process.cwd(), f)).find(
		existsSync,
	);
	if (!found) return {};

	if (found.endsWith(".ts")) {
		const { bundleRequire } = await import("bundle-require");
		const { mod } = await bundleRequire({ filepath: found });
		return (mod.default ?? mod.config ?? {}) as I18nUserConfig;
	}
	const mod = await import(pathToFileURL(found).href);
	return (mod.default ?? mod.config ?? {}) as I18nUserConfig;
}
