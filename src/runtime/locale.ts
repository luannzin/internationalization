/**
 * Runtime locale helpers — the consumer-facing side of better-intl.
 *
 * Locale resolution is split by environment instead of branching at runtime, so
 * each side stays honest about being sync vs async:
 *
 *   - `findLocaleClient` — **synchronous** (cookie/`localStorage` + `navigator`).
 *     Safe to back a plain `export const t = findLocaleClient(...)` imported from
 *     client components, with no `await` turning the module async.
 *   - `findLocaleServer` — **async** (cookie + `Accept-Language` via
 *     `next/headers`). Meant for a Server Component / layout where awaiting is
 *     natural.
 *
 * `updateLocale` persists a preference and stays isomorphic (a button handler
 * may run on either side). This entry (`better-intl/runtime`) imports none of
 * the codegen, so it is safe in a client bundle.
 */

import type { LocaleStorage } from "../types.js";
import { matchLocale } from "./detectLocale.js";

const DEFAULT_STORAGE: LocaleStorage = { type: "cookie", key: "locale" };

/**
 * Runtime config, normally imported from the generated module as `intlConfig`.
 * Everything is optional: the helpers derive `locales` from the translations
 * object and fall back to the first locale when `defaultLocale` is omitted.
 */
export interface IntlRuntimeConfig<L extends string = string> {
	/** Returned when nothing matches. Defaults to the first key of `translations`. */
	defaultLocale?: L;
	/** Supported locales. Defaults to `Object.keys(translations)`. */
	locales?: readonly L[];
	/** Where the preference is stored. Defaults to a `"locale"` cookie. */
	storage?: LocaleStorage;
}

/** Parse a `document.cookie` string into a `name -> value` lookup. */
function parseCookies(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of raw.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const name = part.slice(0, eq).trim();
		if (name) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
	}
	return out;
}

/** Split an `Accept-Language` header into tags, highest `q` first. */
function parseAcceptLanguage(header: string | null | undefined): string[] {
	if (!header) return [];
	return header
		.split(",")
		.map((part) => {
			const [tag, ...params] = part.trim().split(";");
			const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())).find(Boolean);
			return { tag: tag?.trim() ?? "", q: q ? Number(q[1]) : 1 };
		})
		.filter((entry) => entry.tag && entry.tag !== "*")
		.sort((a, b) => b.q - a.q)
		.map((entry) => entry.tag);
}

/** Gather locale candidates in the browser: stored value, then navigator. */
function clientCandidates(storage: LocaleStorage): string[] {
	const candidates: string[] = [];

	if (typeof window !== "undefined") {
		if (storage.type === "localStorage") {
			const stored = window.localStorage?.getItem(storage.key);
			if (stored) candidates.push(stored);
		} else if (typeof document !== "undefined") {
			const stored = parseCookies(document.cookie)[storage.key];
			if (stored) candidates.push(stored);
		}
	}

	if (typeof navigator !== "undefined") {
		if (navigator.language) candidates.push(navigator.language);
		if (navigator.languages) candidates.push(...navigator.languages);
	}

	return candidates;
}

/** Gather locale candidates on the server via Next's `next/headers`. */
async function serverCandidates(storage: LocaleStorage): Promise<string[]> {
	try {
		// @ts-ignore — optional peer, present only in the user's Next app.
		const { cookies, headers } = await import("next/headers");

		const candidates: string[] = [];
		if (storage.type === "cookie") {
			const stored = (await cookies()).get(storage.key)?.value;
			if (stored) candidates.push(stored);
		}
		const accept = (await headers()).get("accept-language");
		candidates.push(...parseAcceptLanguage(accept));
		return candidates;
	} catch {
		// Not inside a Next server context (or `next` unavailable): no signals.
		return [];
	}
}

/** Resolve the supported set, fallback locale, and storage from config. */
function settings<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>>,
) {
	const supported = (config.locales ??
		Object.keys(translations)) as Extract<keyof T, string>[];
	return {
		supported,
		fallback: config.defaultLocale ?? supported[0],
		storage: config.storage ?? DEFAULT_STORAGE,
	};
}

/** First candidate that matches a supported locale → its slice, else fallback. */
function sliceFor<T extends Record<string, unknown>>(
	translations: T,
	candidates: string[],
	supported: readonly Extract<keyof T, string>[],
	fallback: Extract<keyof T, string> | undefined,
): T[keyof T] {
	for (const candidate of candidates) {
		const hit = matchLocale(candidate, supported);
		if (hit) return translations[hit];
	}
	return translations[fallback as keyof T];
}

/**
 * **Client-side** locale resolution — synchronous. Detects from the stored
 * preference (cookie / `localStorage`) → `navigator.languages` → `defaultLocale`,
 * matched tolerant of region subtags (`pt-BR` matches `pt`), and returns that
 * locale's slice of the generated `t`.
 *
 * @example
 * ```ts
 * // lib/i18n/client.ts
 * import { findLocaleClient } from "better-intl/runtime";
 * import { t as translations, intlConfig } from "@/i18n/generated";
 * export const t = findLocaleClient(translations, intlConfig);
 * ```
 */
export function findLocaleClient<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>> = {},
): T[keyof T] {
	const { supported, fallback, storage } = settings(translations, config);
	return sliceFor(translations, clientCandidates(storage), supported, fallback);
}

/**
 * **Server-side** locale resolution — async. Detects from the stored cookie →
 * `Accept-Language` (both via `next/headers`) → `defaultLocale`, and returns
 * that locale's slice of the generated `t`. Degrades to `defaultLocale` outside
 * a Next server context.
 *
 * @example
 * ```ts
 * // lib/i18n/server.ts
 * import { findLocaleServer } from "better-intl/runtime";
 * import { t as translations, intlConfig } from "@/i18n/generated";
 * export const t = await findLocaleServer(translations, intlConfig);
 * ```
 */
export async function findLocaleServer<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>> = {},
): Promise<T[keyof T]> {
	const { supported, fallback, storage } = settings(translations, config);
	return sliceFor(
		translations,
		await serverCandidates(storage),
		supported,
		fallback,
	);
}

/**
 * Persist the user's locale preference to the configured store. Isomorphic:
 * writes a cookie / `localStorage` entry on the client, or a cookie via
 * `next/headers` on the server (only valid inside a Server Action or Route
 * Handler — a no-op otherwise).
 */
export async function updateLocale(
	locale: string,
	config: Pick<IntlRuntimeConfig, "storage"> = {},
): Promise<void> {
	const storage = config.storage ?? DEFAULT_STORAGE;
	const maxAge = 60 * 60 * 24 * 365; // one year

	if (typeof window !== "undefined") {
		if (storage.type === "localStorage") {
			window.localStorage?.setItem(storage.key, locale);
		} else {
			document.cookie = `${storage.key}=${encodeURIComponent(locale)}; path=/; max-age=${maxAge}; samesite=lax`;
		}
		return;
	}

	if (storage.type !== "cookie") return; // no server-side localStorage
	try {
		// @ts-ignore — optional peer, present only in the user's Next app.
		const { cookies } = await import("next/headers");
		(await cookies()).set(storage.key, locale, {
			path: "/",
			maxAge,
			sameSite: "lax",
		});
	} catch {
		// Cookies are only writable in a Server Action / Route Handler.
	}
}
