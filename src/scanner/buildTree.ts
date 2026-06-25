import { relative } from "pathe";
import type { Leaf, TreeNode } from "../types.js";

/**
 * Build the nested folder tree from a flat list of leaf records.
 *
 * Each leaf's path segments (relative to `root`, with the trailing `t.ts`
 * dropped) become nested keys. Example:
 *
 *   root/pt/homepage/hero/t.ts  ->  tree.pt.homepage.hero.leaf
 */
export function buildTree(root: string, leaves: Leaf[]): TreeNode {
	const tree: TreeNode = { children: new Map() };

	for (const leaf of leaves) {
		const rel = relative(root, leaf.file);
		// Drop the trailing `t.ts` segment; the rest are folder keys.
		const segments = rel.split("/").slice(0, -1);

		let node = tree;
		for (const segment of segments) {
			let child = node.children.get(segment);
			if (!child) {
				child = { children: new Map() };
				node.children.set(segment, child);
			}
			node = child;
		}
		node.leaf = leaf;
	}

	return tree;
}

/** Top-level folder names of a tree = the discovered locales, sorted. */
export function locrootKeys(tree: TreeNode): string[] {
	return [...tree.children.keys()].sort();
}
