#!/usr/bin/env node
import { runGenerate, watch } from "./codegen/run.js";
import { defineConfig } from "./config.js";
import { loadUserConfig } from "./loadConfig.js";

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
