/**
 * Structure test: every directory under `integrations/` represents a provider
 * and MUST contain a manifest.ts. The aggregator file `_registry.ts` is the
 * one allowed non-provider entity at the root.
 *
 * Per docs/rules/provider-registry.md and project-structure-and-module-boundaries.md §10:
 * "Provider folder without manifest fails CI."
 *
 * Exception: `native` is the non-OAuth pseudo-provider that groups the
 * native / workflow-control nodes (`http_request`, `format_transformer`,
 * `delay`, …) shipped by docs/slices/parity/parity-native-nodes.md +
 * docs/slices/parity/native-nodes-1-tier-a-plan.md. Native nodes have no
 * OAuth, no scopes, no health checks — a ProviderManifest would be a
 * misleading shape for them. They register directly into
 * services/execution/handlers/_registry.ts under providerId "native".
 *
 * Same exception, same reason: `ai` — the ChainReact AI provider
 * (AI-PROVIDER-4/5). It is connectionless by construction: no OAuth, no
 * credential, no health check, nothing to connect. An empty manifest would
 * make it appear on /api/providers and the Apps page as something a user
 * could "connect", which would be a lie. Its identity lives in
 * core/integrations/connectionlessProviders.ts and its catalog is served by
 * app/api/ai/actions. Decision recorded in
 * docs/slices/phase-5/ai-provider/ai-provider-cs4-builder-contract-outcome.md
 * (plan open question O2).
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const INTEGRATIONS_DIR = join(ROOT, "integrations");

const NON_PROVIDER_ROOTS: ReadonlySet<string> = new Set(["native", "ai"]);

describe("every provider folder has a manifest.ts", () => {
  it("checks each integrations/<provider>/ for manifest.ts", () => {
    // Fail-closed: integrations/ exists; an unreadable dir means the scan is
    // broken, and returning green would disable the manifest rule.
    const entries = readdirSync(INTEGRATIONS_DIR, { withFileTypes: true });

    const offenders: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Underscore-prefixed directories are reserved (e.g. `_shared`).
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      // Non-OAuth pseudo-providers (see docstring).
      if (NON_PROVIDER_ROOTS.has(entry.name)) continue;

      const manifestPath = join(INTEGRATIONS_DIR, entry.name, "manifest.ts");
      try {
        statSync(manifestPath);
      } catch {
        offenders.push(`integrations/${entry.name}/ has no manifest.ts`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
