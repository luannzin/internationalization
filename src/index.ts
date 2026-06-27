/**
 * Public library surface.
 *
 * The generator (scanner + codegen) is the heart of the library. The runtime
 * `t`/`getT` live in the *generated* file inside the user's project, not here —
 * so this entry only exposes config, the optional locale picker, the
 * programmatic generate API, and shared types.
 */

export { runGenerate, watch } from "./codegen/run.js";
export { defineConfig } from "./config.js";
export type { DetectLocaleOptions } from "./runtime/detectLocale.js";
export { detectLocale } from "./runtime/detectLocale.js";
export type {
	I18nConfig,
	I18nUserConfig,
	Leaf,
	LeafValue,
	LocaleMap,
	OnMissing,
	TranslationTree,
	TreeNode,
} from "./types.js";
