#!/usr/bin/env node
import { runGenerate, watch } from "./codegen/run.js";
import { defineConfig } from "./config.js";
import { runInit } from "./init.js";
import { loadUserConfig } from "./loadConfig.js";

async function main() {
	const argv = process.argv.slice(2);
	const command = argv.find((a) => !a.startsWith("-"));

	if (command === "init") {
		await runInit();
		return;
	}

	const args = new Set(argv);
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
