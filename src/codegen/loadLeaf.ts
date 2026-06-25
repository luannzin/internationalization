import { bundleRequire } from "bundle-require";
import type { LeafValue } from "../types.js";

/**
 * Load a `t.ts` leaf at generation time and return its exported value object.
 *
 * Accepts either `export const t = {...}` or `export default {...}`. Runs the
 * file through esbuild (via bundle-require) so TS/ESM leaves evaluate without a
 * separate build step.
 */
export async function loadLeaf(file: string): Promise<LeafValue> {
	const { mod } = await bundleRequire({ filepath: file });
	const value = mod.t ?? mod.default;

	if (value == null || typeof value !== "object") {
		throw new Error(
			`Leaf "${file}" must export \`t\` or a default object. Got: ${typeof value}`,
		);
	}

	return value as LeafValue;
}
