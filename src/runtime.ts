/**
 * Client/server runtime surface — `better-intl/runtime`.
 *
 * Import these from your app to resolve and persist the active locale. This
 * entry intentionally pulls in none of the generator (no `node:fs`, `chokidar`,
 * `bundle-require`), so it is safe to import from a client component.
 */

export type { DetectLocaleOptions } from "./runtime/detectLocale.js";
export { detectLocale, matchLocale } from "./runtime/detectLocale.js";
export type { IntlRuntimeConfig } from "./runtime/locale.js";
export {
	findLocaleClient,
	findLocaleServer,
	updateLocale,
} from "./runtime/locale.js";
export type { LocaleStorage } from "./types.js";
