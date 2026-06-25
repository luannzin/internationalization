#!/usr/bin/env node
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "pathe";
import { runGenerate, watch } from "./codegen/run.js";
import { defineConfig } from "./config.js";
import type { I18nUserConfig } from "./types.js";

const CONFIG_FILES = ["i18n.config.ts", "i18n.config.js", "i18n.config.mjs"];

/** Load an optional `i18n.config.*` from cwd via bundle-require. */
async function loadUserConfig(): Promise<I18nUserConfig> {
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

async function main() {
	const args = new Set(process.argv.slice(2));
	const isWatch = args.has("--watch") || args.has("-w");

	const config = defineConfig(await loadUserConfig());

	if (isWatch) {
		await watch(config);
		console.log(`[i18n] watching ${config.root} ...`);
		// Keep the process alive for the watcher.
		await new Promise(() => {});
		return;
	}

	const locales = await runGenerate(config);
	console.log(`[i18n] generated ${config.out} -> ${locales.join(", ")}`);
}

main().catch((err) => {
	console.error(`[i18n] ${(err as Error).message}`);
	process.exit(1);
});
