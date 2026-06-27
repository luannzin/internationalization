/**
 * Optional locale picker. Runtime-only helper — no filesystem, no request
 * objects. The caller owns locale selection; this is a convenience for the
 * common "pick a supported locale from some candidates" case.
 *
 * Resolution order:
 *   1. explicit `prefer` (first supported wins)
 *   2. browser `navigator.language` family (when in a browser)
 *   3. `fallback`
 *
 * Matching is case-insensitive and tries the full tag then its primary subtag
 * (e.g. `pt-BR` matches a supported `pt`).
 */
export interface DetectLocaleOptions<L extends string> {
	/** Locales the app actually supports (usually `Object.keys(t)`). */
	supported: readonly L[];
	/** Locale returned when nothing matches. */
	fallback: L;
	/** Caller-supplied candidates, highest priority first. */
	prefer?: readonly string[];
}

/**
 * Match a single candidate tag against the supported locales, case-insensitively
 * and tolerant of region subtags: the full tag is tried first, then its primary
 * subtag (`pt-BR` → `pt`). Returns the supported locale, or `undefined`.
 */
export function matchLocale<L extends string>(
	candidate: string,
	supported: readonly L[],
): L | undefined {
	const lower = candidate.toLowerCase();
	const primary = lower.split("-")[0];
	return supported.find(
		(s) => s.toLowerCase() === lower || s.toLowerCase() === primary,
	);
}

export function detectLocale<L extends string>(
	options: DetectLocaleOptions<L>,
): L {
	const candidates: string[] = [...(options.prefer ?? [])];

	if (typeof navigator !== "undefined" && navigator.language) {
		candidates.push(navigator.language, ...(navigator.languages ?? []));
	}

	for (const candidate of candidates) {
		const hit = matchLocale(candidate, options.supported);
		if (hit) return hit;
	}

	return options.fallback;
}
