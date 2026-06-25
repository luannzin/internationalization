const TOKEN_RE = /\{(\w+)\}/g;

/**
 * Extract unique `{token}` placeholder names from a string, in first-seen order.
 * Returns an empty array for plain strings (no placeholders).
 */
export function placeholders(value: string): string[] {
	const names: string[] = [];
	for (const match of value.matchAll(TOKEN_RE)) {
		const name = match[1];
		if (name && !names.includes(name)) names.push(name);
	}
	return names;
}
