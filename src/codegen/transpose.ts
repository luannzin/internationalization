import type {
	I18nConfig,
	LeafValue,
	LocaleMap,
	TranslationTree,
	TreeNode,
} from "../types.js";

/**
 * Transpose the authored "locale-per-key" tree into a "key-per-locale" object.
 *
 * Authoring colocates one `t.ts` per feature and writes each entry as a locale
 * map (`title: { en, pt }`). The runtime, however, wants the locale at the top
 * so a request can pick `t[locale]`. This module performs that inversion:
 *
 *   feature tree (leaves = locale maps)  ->  { en: {...}, pt: {...} }
 *
 * It also resolves the fallback chain and reports keys that are missing a
 * required locale according to `config.onMissing`.
 */

/** A recorded gap: a key that lacked `locale` after the fallback chain. */
interface Missing {
	path: string;
	locale: string;
	available: string[];
}

/**
 * Structural detection: a node is a translation entry (locale map) when it has
 * at least one key and every value is a string. Anything else is a group we
 * recurse into. In this model leaves *are* locale maps, so this is unambiguous.
 */
function isLocaleMap(node: LocaleMap | TranslationTree): node is LocaleMap {
	const values = Object.values(node);
	return values.length > 0 && values.every((v) => typeof v === "string");
}

/** Resolution order for a locale: itself → its fallbacks → `defaultLocale`. */
function buildChain(locale: string, config: I18nConfig): string[] {
	return [
		...new Set([
			locale,
			...(config.fallback?.[locale] ?? []),
			config.defaultLocale,
		]),
	];
}

/** Pick the best string for `locale` from a locale map, following the chain. */
function resolveLocale(
	map: LocaleMap,
	locale: string,
	config: I18nConfig,
	path: string[],
	missing: Missing[],
): string {
	for (const candidate of buildChain(locale, config)) {
		const value = map[candidate];
		if (typeof value === "string") return value;
	}
	// Chain exhausted: fill from whatever the key does have (best effort) and
	// record the gap for reporting.
	missing.push({ path: path.join("."), locale, available: Object.keys(map) });
	return Object.values(map)[0] ?? "";
}

/** Resolve an authored TranslationTree to a single locale's string tree. */
function resolveTree(
	tree: TranslationTree,
	locale: string,
	config: I18nConfig,
	path: string[],
	missing: Missing[],
): LeafValue {
	const out: LeafValue = {};
	for (const [key, val] of Object.entries(tree)) {
		out[key] = isLocaleMap(val)
			? resolveLocale(val, locale, config, [...path, key], missing)
			: resolveTree(val, locale, config, [...path, key], missing);
	}
	return out;
}

/** Resolve a feature node (folder children + a colocated leaf) for one locale. */
function resolveNode(
	node: TreeNode,
	locale: string,
	config: I18nConfig,
	path: string[],
	missing: Missing[],
): LeafValue {
	const out: LeafValue = {};
	const seen = new Set<string>();

	// Folder children first, sorted for deterministic output.
	for (const [name, child] of [...node.children.entries()].sort()) {
		seen.add(name);
		out[name] = resolveNode(child, locale, config, [...path, name], missing);
	}

	// Then the colocated `t.ts`, merged at the same level.
	if (node.leaf) {
		const resolved = resolveTree(node.leaf.value, locale, config, path, missing);
		for (const [key, val] of Object.entries(resolved)) {
			if (seen.has(key)) {
				throw new Error(
					`Key collision in "${node.leaf.file}": "${key}" is both a folder and a leaf key.`,
				);
			}
			out[key] = val;
		}
	}

	return out;
}

/** Collect every locale key that appears anywhere under a feature node. */
function collectLocales(node: TreeNode, into: Set<string>): void {
	if (node.leaf) collectFromTree(node.leaf.value, into);
	for (const child of node.children.values()) collectLocales(child, into);
}

function collectFromTree(tree: TranslationTree, into: Set<string>): void {
	for (const val of Object.values(tree)) {
		if (isLocaleMap(val)) {
			for (const key of Object.keys(val)) into.add(key);
		} else {
			collectFromTree(val, into);
		}
	}
}

/** Emit a single grouped diagnostic, honouring `onMissing`. */
function report(
	missing: Missing[],
	unexpected: string[],
	config: I18nConfig,
): void {
	if (config.onMissing === "silent") return;

	const lines = [
		...missing.map(
			(m) =>
				`  ${m.path} → missing "${m.locale}" (has: ${m.available.join(", ") || "none"})`,
		),
		...unexpected.map(
			(l) => `  unexpected locale "${l}" is not in the configured \`locales\``,
		),
	];
	if (lines.length === 0) return;

	const body = `[i18n] translation gaps:\n${lines.join("\n")}`;
	if (config.onMissing === "error") throw new Error(body);
	console.warn(body);
}

/**
 * Build `{ [locale]: resolvedTree }` from the authored feature tree.
 * The required locales are `config.locales` when given, else the union of every
 * locale key seen across all leaves.
 */
export function transpose(
	tree: TreeNode,
	config: I18nConfig,
): Record<string, LeafValue> {
	const seen = new Set<string>();
	collectLocales(tree, seen);

	const required = config.locales ?? [...seen].sort();
	if (required.length === 0) {
		throw new Error(
			'No locales found. Each t.ts entry must map at least one locale, e.g. `{ en: "..." }`.',
		);
	}

	const unexpected = config.locales
		? [...seen].filter((l) => !required.includes(l)).sort()
		: [];

	const missing: Missing[] = [];
	const resolved: Record<string, LeafValue> = {};
	for (const locale of required) {
		resolved[locale] = resolveNode(tree, locale, config, [], missing);
	}

	report(missing, unexpected, config);
	return resolved;
}
