import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts", "src/next.ts", "src/runtime.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	// These resolve at runtime in the user's project, not at lib-build time.
	// `next/headers` is dynamically imported by the runtime locale helpers.
	external: ["bundle-require", "chokidar", "esbuild", "next/headers"],
});
