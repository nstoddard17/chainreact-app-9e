/**
 * Structure test: every action handler registered for a covered provider
 * has a matching ActionMeta entry in the discovery registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.0:
 *   - The discovery registry expands one provider at a time.
 *   - This test maintains an explicit COVERED_PROVIDERS list — only the
 *     listed providers are required to have full meta coverage.
 *   - Subsequent Phase-3 commits add the next provider's metas + add
 *     that provider id to COVERED_PROVIDERS. The test then enforces
 *     coverage for that provider going forward, preventing accidental
 *     handler/meta drift inside the covered scope.
 *
 * Coverage scope: native (Slice 3.0) + GitHub (Slice 3.0b) + Gmail
 * (Slice 3.15) + Microsoft Outlook Mail (Slice 3.17).
 *
 * This test does NOT block adding new handlers for uncovered providers —
 * a Slack handler can land without an action meta file, but a native,
 * GitHub, Gmail, or Microsoft Outlook handler landing without a meta
 * file will fail.
 */
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { listAllActionMetas } from "@/services/discovery/_registry";

const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "native",
  "github",
  "gmail",
  "microsoft-outlook",
]);

describe("discovery meta coverage (covered providers)", () => {
  it("every registered handler in a covered provider has an ActionMeta entry", () => {
    const handlerKeys = new Set<string>();
    for (const h of listRegisteredHandlers()) {
      if (COVERED_PROVIDERS.has(h.provider)) {
        handlerKeys.add(`${h.provider}:${h.type}`);
      }
    }

    const metaKeys = new Set(listAllActionMetas().map((m) => m.key));

    const missingMeta: string[] = [];
    for (const key of handlerKeys) {
      if (!metaKeys.has(key)) {
        missingMeta.push(key);
      }
    }
    expect(missingMeta).toEqual([]);
  });

  it("every ActionMeta has a registered handler (no orphan meta)", () => {
    const handlerKeys = new Set(
      listRegisteredHandlers().map((h) => `${h.provider}:${h.type}`),
    );

    const orphanMeta: string[] = [];
    for (const meta of listAllActionMetas()) {
      if (!handlerKeys.has(meta.key)) {
        orphanMeta.push(meta.key);
      }
    }
    expect(orphanMeta).toEqual([]);
  });

  it("every covered provider has at least one ActionMeta", () => {
    const metaProviders = new Set(
      listAllActionMetas().map((m) => m.provider),
    );
    const uncoveredButListed: string[] = [];
    for (const provider of COVERED_PROVIDERS) {
      if (!metaProviders.has(provider)) {
        uncoveredButListed.push(provider);
      }
    }
    expect(uncoveredButListed).toEqual([]);
  });
});
