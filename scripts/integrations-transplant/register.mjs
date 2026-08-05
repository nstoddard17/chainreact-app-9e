/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — module hooks for the transplant CLI.
 *
 * 1. Reuses the repo's `@/…` alias + extensionless-import resolution
 *    (scripts/mcp-import/register-alias.mjs).
 * 2. Maps `next/headers` to a throwing stub so the canonical repositories
 *    (which import the Next SSR client at module scope) can be loaded outside
 *    a Next request. The CLI only ever calls their service-role functions;
 *    the stub fails loudly if the session path is ever reached.
 */
import "../mcp-import/register-alias.mjs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const stubPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "nextHeadersStub.mjs",
);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return { url: pathToFileURL(stubPath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
