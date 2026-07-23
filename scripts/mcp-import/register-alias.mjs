/**
 * Module hooks for running repo TypeScript directly under Node's native type
 * stripping (`npm run mcp:import`). Two jobs:
 *   1. Map the repo's `@/…` import alias to the repository root.
 *   2. Resolve EXTENSIONLESS relative/alias imports (repo style) to `.ts`
 *      files / `index.ts`, which native ESM resolution refuses to guess.
 * Dev-tooling only — never loaded by the app, jest, or Next.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function tryCompletions(absPath) {
  if (path.extname(absPath) !== "" && existsSync(absPath)) return absPath;
  for (const candidate of [
    `${absPath}.ts`,
    `${absPath}.tsx`,
    path.join(absPath, "index.ts"),
    `${absPath}.mjs`,
    `${absPath}.js`,
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = tryCompletions(path.join(repoRoot, specifier.slice(2)));
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      try {
        return nextResolve(specifier, context);
      } catch (err) {
        const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : repoRoot;
        const resolved = tryCompletions(path.resolve(path.dirname(parentPath), specifier));
        if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
        throw err;
      }
    }
    return nextResolve(specifier, context);
  },
});
