/**
 * Shared codegen types.
 *
 * These describe the in-memory representation the scanner produces and the
 * codegen consumes. None of this is shipped to the runtime — the runtime only
 * ever sees the generated plain object.
 */

/** Resolved configuration after defaults are applied. */
export interface I18nConfig {
	/** Directory scanned for locale folders, e.g. `./translations`. */
	root: string;
	/** Locale used as the canonical shape and default `getT` argument. */
	defaultLocale: string;
	/**
	 * Explicit locale allow-list. When omitted, every top-level folder under
	 * `root` is treated as a locale.
	 */
	locales?: string[];
	/** File the generated module is written to, e.g. `./src/i18n/generated.ts`. */
	out: string;
}

/** User-facing config: everything optional except nothing — all has defaults. */
export type I18nUserConfig = Partial<I18nConfig>;

/**
 * One translation leaf: a single `t.ts` file resolved to its value object plus
 * the absolute path it was loaded from (used for error reporting).
 */
export interface Leaf {
	/** Absolute path to the `t.ts` file. */
	file: string;
	/** The plain object exported by the leaf (string values only, recursively). */
	value: LeafValue;
}

/** A leaf's exported shape: nested string maps. */
export interface LeafValue {
	[key: string]: string | LeafValue;
}

/**
 * Nested tree keyed by folder name. A node is either a subtree (folder) or a
 * `Leaf` (a `t.ts` file). Folders and a `t.ts` can coexist at the same level.
 */
export interface TreeNode {
	/** Child folders. */
	children: Map<string, TreeNode>;
	/** The `t.ts` leaf at this folder, if present. */
	leaf?: Leaf;
}
