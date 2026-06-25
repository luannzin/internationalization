import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "pathe";
import { buildTree } from "../scanner/buildTree.js";
import { walk } from "../scanner/walk.js";
import type { I18nConfig, Leaf, TreeNode } from "../types.js";
import { emit } from "./emit.js";
import { loadLeaf } from "./loadLeaf.js";

/** Scan, load leaves, and build the in-memory tree (no file written). */
async function scan(config: I18nConfig): Promise<TreeNode> {
	const files = await walk(config.root);
	if (files.length === 0) {
		throw new Error(
			`No t.ts files found under "${config.root}". Check the \`root\` config.`,
		);
	}

	const leaves: Leaf[] = await Promise.all(
		files.map(async (file) => ({ file, value: await loadLeaf(file) })),
	);

	const tree = buildTree(config.root, leaves);

	// Honour an explicit locale allow-list by pruning unlisted top-level folders.
	if (config.locales) {
		const allow = new Set(config.locales);
		for (const locale of [...tree.children.keys()]) {
			if (!allow.has(locale)) tree.children.delete(locale);
		}
	}

	return tree;
}

/**
 * Run a single generation pass: scan -> emit -> write `config.out`.
 * Returns the discovered locales for logging.
 */
export async function runGenerate(config: I18nConfig): Promise<string[]> {
	const tree = await scan(config);
	const source = emit(tree);
	await mkdir(dirname(config.out), { recursive: true });
	await writeFile(config.out, source, "utf8");
	return [...tree.children.keys()].sort();
}
