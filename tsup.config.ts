import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	// bundle-require/chokidar resolve at runtime in the user's project.
	external: ["bundle-require", "chokidar", "esbuild"],
});
