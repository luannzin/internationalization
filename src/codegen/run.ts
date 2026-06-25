import { watch as chokidarWatch } from "chokidar";
import type { I18nConfig } from "../types.js";
import { runGenerate } from "./generate.js";

export { runGenerate };

/**
 * Watch the translations root and regenerate on any change. Used by the dev
 * server (`i18n-gen --watch`). Returns a disposer that stops the watcher.
 */
export async function watch(config: I18nConfig): Promise<() => Promise<void>> {
	const regen = async (reason: string) => {
		try {
			const locales = await runGenerate(config);
			console.log(`[i18n] regenerated (${reason}) -> ${locales.join(", ")}`);
		} catch (err) {
			console.error(`[i18n] generation failed: ${(err as Error).message}`);
		}
	};

	await regen("initial");

	const watcher = chokidarWatch(config.root, {
		ignoreInitial: true,
		// Only care about leaf files and structural changes.
		ignored: (path) => path.endsWith("~"),
	});

	watcher
		.on("add", (p) => p.endsWith("t.ts") && regen(`add ${p}`))
		.on("change", (p) => p.endsWith("t.ts") && regen(`change ${p}`))
		.on("unlink", (p) => p.endsWith("t.ts") && regen(`remove ${p}`))
		.on("addDir", () => regen("addDir"))
		.on("unlinkDir", () => regen("removeDir"));

	return () => watcher.close();
}
