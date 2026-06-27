/**
 * Shared codegen types.
 *
 * These describe the in-memory representation the scanner produces and the
 * codegen consumes. None of this is shipped to the runtime — the runtime only
 * ever sees the generated plain object.
 */

/** What to do when a key is missing one of the required locales. */
export type OnMissing = "error" | "warn" | "silent";

/** Resolved configuration after defaults are applied. */
export interface I18nConfig {
	/** Directory scanned for colocated `t.ts` leaves, e.g. `./app`. */
	root: string;
	/** Locale used as the canonical shape and the ultimate fallback. */
	defaultLocale: string;
	/**
	 * Explicit locale allow-list (the required set). When omitted, the required
	 * locales are the union of every locale key seen across all leaves.
	 */
	locales?: string[];
	/** File the generated module is written to, e.g. `./src/i18n/generated.ts`. */
	out: string;
	/**
	 * Behaviour when a key lacks a required locale after the fallback chain is
	 * exhausted. Defaults to `"warn"`.
	 */
	onMissing: OnMissing;
	/**
	 * Per-locale fallback chains, highest priority first, e.g.
	 * `{ es: ["pt", "en"] }`. `defaultLocale` is always appended as the final
	 * fallback, so listing it is optional.
	 */
	fallback?: Record<string, string[]>;
}

/** User-facing config: everything optional except nothing — all has defaults. */
export type I18nUserConfig = Partial<I18nConfig>;

/**
 * One translation leaf: a single `t.ts` file plus the absolute path it was
 * loaded from (used for error reporting).
 */
export interface Leaf {
	/** Absolute path to the `t.ts` file. */
	file: string;
	/** The authoring tree exported by the leaf (nested groups → locale maps). */
	value: TranslationTree;
}

/** A single translation entry: `{ en: "Hello", pt: "Olá" }`. */
export type LocaleMap = Record<string, string>;

/**
 * A leaf's authored shape. Each node is either a locale map (a translation
 * entry, detected structurally as "all values are strings") or a nested group.
 */
export interface TranslationTree {
	[key: string]: LocaleMap | TranslationTree;
}

/**
 * A resolved-for-one-locale tree: nested string maps. This is what `emit`
 * prints, after `transpose` collapses each locale map to a single string.
 */
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
