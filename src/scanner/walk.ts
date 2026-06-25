import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "pathe";

const LEAF_FILENAME = "t.ts";

/**
 * Recursively walk `dir` and collect absolute paths to every `t.ts` leaf file.
 * Directories are traversed depth-first; order within a directory is sorted so
 * generated output is deterministic across filesystems.
 */
export async function walk(dir: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		// Missing directory -> no leaves. Caller validates root existence.
		return [];
	}

	const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
	const leaves: string[] = [];

	for (const entry of sorted) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			leaves.push(...(await walk(full)));
		} else if (entry.isFile() && entry.name === LEAF_FILENAME) {
			leaves.push(full);
		}
	}

	return leaves;
}
