/**
 * Runtime locale helpers — the consumer-facing side of better-intl.
 *
 * Locale resolution is split by environment instead of branching at runtime, so
 * each side stays honest about being sync vs async:
 *
 *   - `findLocaleClient` — **synchronous** (cookie + `navigator`).
 *     Safe to back a plain `export const t = findLocaleClient(...)` imported from
 *     client components, with no `await` turning the module async.
 *   - `findLocaleServer` — **async** (cookie + `Accept-Language` via
 *     `next/headers`). Meant for a Server Component / layout where awaiting is
 *     natural.
 *
 * `updateLocale` persists a preference and stays isomorphic (a button handler
 * may run on either side). `createServerT` exposes a **synchronous** `t` for
 * Server Components, backed by a per-request store. This entry
 * (`better-intl/runtime`) imports none of the codegen, so it is safe in a client
 * bundle.
 */

// @ts-expect-error — `react` is a peer dependency, resolved in the user's app.
import { cache } from "react";
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

/** Gather locale candidates in the browser: stored cookie, then navigator. */
function clientCandidates(storage: LocaleStorage): string[] {
	const candidates: string[] = [];

	if (typeof document !== "undefined") {
		const stored = parseCookies(document.cookie)[storage.key];
		if (stored) candidates.push(stored);
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
		// @ts-expect-error — optional peer, present only in the user's Next app.
		const { cookies, headers } = await import("next/headers");

		const candidates: string[] = [];
		const stored = (await cookies()).get(storage.key)?.value;
		if (stored) candidates.push(stored);
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
	const supported = (config.locales ?? Object.keys(translations)) as Extract<
		keyof T,
		string
	>[];
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

/** Resolve the active locale **string** on the server (cookie → Accept-Language). */
async function resolveServerLocale<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>>,
): Promise<Extract<keyof T, string>> {
	const { supported, fallback, storage } = settings(translations, config);
	if (typeof window !== "undefined")
		return fallback as Extract<keyof T, string>;
	for (const candidate of await serverCandidates(storage)) {
		const hit = matchLocale(candidate, supported);
		if (hit) return hit;
	}
	return fallback as Extract<keyof T, string>;
}

/**
 * **Client-side** locale resolution — synchronous. Detects from the stored
 * preference (cookie) → `navigator.languages` → `defaultLocale`,
 * matched tolerant of region subtags (`pt-BR` matches `pt`), and returns that
 * locale's slice of the generated `t`.
 *
 * **Safe to evaluate on the server.** When `lib/i18n/index.ts` imports both
 * `./client` and `./server`, this runs during SSR too; with no browser globals
 * it short-circuits to `defaultLocale` instead of reading them. It never throws.
 *
 * @example
 * ```ts
 * // lib/i18n/client.ts
 * import { findLocaleClient } from "better-intl/runtime";
 * import { translations, intlConfig } from "@/i18n/generated";
 * export const t = findLocaleClient(translations, intlConfig);
 * ```
 */
export function findLocaleClient<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>> = {},
): T[keyof T] {
	const { supported, fallback, storage } = settings(translations, config);

	// Not in a browser: no cookie/navigator to read. Resolve to the
	// default locale so this is harmless when evaluated during SSR.
	if (typeof window === "undefined") return translations[fallback as keyof T];

	return sliceFor(translations, clientCandidates(storage), supported, fallback);
}

/**
 * **Server-side** locale resolution — async. Detects from the stored cookie →
 * `Accept-Language` (both via `next/headers`) → `defaultLocale`, and returns
 * that locale's slice of the generated `t`. Degrades to `defaultLocale` outside
 * a Next server context.
 *
 * **Safe to evaluate on the client.** When `lib/i18n/index.ts` imports both
 * `./client` and `./server`, this module also runs in the browser bundle — so if
 * there's no server context (`typeof window !== "undefined"`), it short-circuits
 * to `defaultLocale` and never touches `next/headers` (importing that in the
 * browser is an error). It never throws.
 *
 * @example
 * ```ts
 * // lib/i18n/server.ts
 * import { findLocaleServer } from "better-intl/runtime";
 * import { translations, intlConfig } from "@/i18n/generated";
 * export const t = await findLocaleServer(translations, intlConfig);
 * ```
 */
export async function findLocaleServer<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>> = {},
): Promise<T[keyof T]> {
	return translations[await resolveServerLocale(translations, config)];
}

/**
 * Build a **synchronous** server `t` you can use like `t.homepage.title(...)` in
 * any Server Component — no `await`, no per-component call. It returns a proxy
 * over a **per-request** locale store (React's `cache()`), plus a `setLocale`
 * you call **once** near the top of the request (your root layout) to read the
 * cookie/`Accept-Language` and populate the store.
 *
 * This is the cacheComponents-safe shape: only `setLocale()` touches
 * `cookies()` — and it does so inside render, where Next can mark it dynamic —
 * while the `t` proxy is pure synchronous reads, so nothing hangs the prerender.
 * Before `setLocale()` runs (or inside a `use cache` boundary, which isolates
 * React's `cache`), `t` resolves to `defaultLocale`.
 *
 * @example
 * ```ts
 * // lib/i18n/server.ts
 * import { createServerT } from "better-intl/runtime";
 * import { translations, intlConfig } from "@/i18n/generated";
 * export const { t, setLocale } = createServerT(translations, intlConfig);
 * ```
 * ```tsx
 * // app/layout.tsx — run once per request
 * import { setLocale } from "@/lib/i18n/server";
 * export default async function RootLayout({ children }) {
 *   await setLocale();
 *   return <html><body>{children}</body></html>;
 * }
 * ```
 * ```tsx
 * // any Server Component — use t directly, synchronously
 * import { t } from "@/lib/i18n/server";
 * export default function Title() { return <h1>{t.homepage.title({ name: "Ada" })}</h1>; }
 * ```
 */
export function createServerT<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>> = {},
): { t: T[keyof T]; setLocale: () => Promise<Extract<keyof T, string>> } {
	const fallback = (config.defaultLocale ??
		Object.keys(translations)[0]) as Extract<keyof T, string>;

	// React's `cache` gives one store instance per request (and is isolated from
	// any `use cache` boundary), so this is concurrency-safe under SSR.
	const store = cache((): { locale: Extract<keyof T, string> } => ({
		locale: fallback,
	}));

	const setLocale = async (): Promise<Extract<keyof T, string>> => {
		const locale = await resolveServerLocale(translations, config);
		store().locale = locale;
		return locale;
	};

	const slice = (): Record<PropertyKey, unknown> =>
		translations[store().locale] as Record<PropertyKey, unknown>;

	const t = new Proxy(Object.create(null), {
		get: (_target, key) => slice()[key],
		has: (_target, key) => key in slice(),
		ownKeys: () => Reflect.ownKeys(slice()),
		getOwnPropertyDescriptor: (_target, key) => {
			const desc = Object.getOwnPropertyDescriptor(slice(), key);
			// The proxy target is empty, so descriptors must be configurable.
			if (desc) desc.configurable = true;
			return desc;
		},
	}) as T[keyof T];

	return { t, setLocale };
}

/**
 * One-shot binder: pass the generated `translations` + `intlConfig` **once** and
 * get back ready-to-use, zero-argument helpers. This is what the generated
 * module calls so your app never re-passes translations or config:
 *
 *   - `t` — the active locale's slice. On the client it is the resolved slice
 *     (`findLocaleClient`); on the server it is the synchronous per-request proxy
 *     (`createServerT`), filled by `setLocale`. The environment is picked once,
 *     at module init, by `typeof window`.
 *   - `setLocale()` — call once per request in the root layout (server). A no-op
 *     on the client.
 *   - `updateLocale(locale)` — persist a new preference to the cookie, bound to
 *     the configured storage.
 *
 * @example
 * ```ts
 * // emitted into generated.ts
 * const i18n = createI18n(translations, intlConfig);
 * export const { t, setLocale, updateLocale } = i18n;
 * ```
 */
export function createI18n<T extends Record<string, unknown>>(
	translations: T,
	config: IntlRuntimeConfig<Extract<keyof T, string>> = {},
): {
	t: T[keyof T];
	setLocale: () => Promise<Extract<keyof T, string>>;
	updateLocale: (locale: Extract<keyof T, string>) => Promise<void>;
} {
	const server = createServerT(translations, config);
	const t =
		typeof window !== "undefined"
			? findLocaleClient(translations, config)
			: server.t;
	return {
		t,
		setLocale: server.setLocale,
		updateLocale: (locale) => updateLocale(locale, config),
	};
}

/**
 * Persist the user's locale preference to the cookie. Isomorphic: writes
 * `document.cookie` on the client, or the cookie via `next/headers` on the
 * server (only valid inside a Server Action or Route Handler — a no-op
 * otherwise).
 */
export async function updateLocale(
	locale: string,
	config: Pick<IntlRuntimeConfig, "storage"> = {},
): Promise<void> {
	const storage = config.storage ?? DEFAULT_STORAGE;
	const maxAge = 60 * 60 * 24 * 365; // one year

	if (typeof window !== "undefined") {
		document.cookie = `${storage.key}=${encodeURIComponent(locale)}; path=/; max-age=${maxAge}; samesite=lax`;
		return;
	}

	try {
		// @ts-expect-error — optional peer, present only in the user's Next app.
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
