/** @jest-environment node */
import { ProviderManifestSchema } from "@/contracts/integration";
import { trelloManifest } from "@/integrations/trello/manifest";

import {
  getActionHandler,
  listRegisteredHandlers,
} from "@/services/execution/handlers/_registry";
describe("trelloManifest", () => {
  it("parses cleanly against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(trelloManifest)).not.toThrow();
  });

  it("declares the token-ingest auth flow", () => {
    expect(trelloManifest.authFlow).toBe("token_ingest");
  });

  it("is non-refreshable (Trello tokens don't refresh)", () => {
    expect(trelloManifest.refreshable).toBe(false);
  });

  it("uses user token scope", () => {
    expect(trelloManifest.tokenScope).toBe("user");
  });

  it("requires the three coarse Trello scopes", () => {
    expect(trelloManifest.scopes.required).toEqual([
      "read",
      "write",
      "account",
    ]);
  });

  it("flips capabilities.oauth: true (token-ingest is the connect path)", () => {
    expect(trelloManifest.capabilities.oauth).toBe(true);
  });

  it("declares actions capability after Commit 4 (8 handlers registered)", () => {
    expect(trelloManifest.capabilities.actions).toBe(true);
  });

  it("declares webhookTrigger capability after Commit 5 (6 triggers registered)", () => {
    expect(trelloManifest.capabilities.webhookTrigger).toBe(true);
  });

  it("does not declare polling capability (Trello is webhook-only)", () => {
    expect(trelloManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("uses the 4h developer-tier health check interval", () => {
    expect(trelloManifest.healthCheckIntervalMs).toBe(4 * 60 * 60 * 1000);
  });

  it("refuses a refreshable Trello mutation (invariant check)", () => {
    const r = ProviderManifestSchema.safeParse({
      ...trelloManifest,
      refreshable: true,
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling registry.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

/**
 * Registry assertion for Slice 17 Commit 4 — all 8 Trello action
 * handlers are registered under the `trello` provider id with their
 * approved type names.
 */
const APPROVED_TYPES = [
  "create_card",
  "update_card",
  "move_card",
  "archive_card",
  "add_comment",
  "add_label_to_card",
  "create_list",
  "create_board",
] as const;

describe("Trello handler registry (Slice 17 Commit 4)", () => {
  it.each(APPROVED_TYPES)("registers trello:%s", (type) => {
    expect(getActionHandler("trello", type)).toBeDefined();
  });

  it("does NOT register types deferred from Batch 1", () => {
    expect(getActionHandler("trello", "add_checklist")).toBeUndefined();
    expect(getActionHandler("trello", "create_checklist_item")).toBeUndefined();
    expect(getActionHandler("trello", "get_cards")).toBeUndefined();
  });

  it("listRegisteredHandlers includes all 8 trello entries", () => {
    const trelloHandlers = listRegisteredHandlers().filter(
      (h) => h.provider === "trello",
    );
    expect(trelloHandlers.length).toBe(APPROVED_TYPES.length);
    const types = new Set(trelloHandlers.map((h) => h.type));
    for (const t of APPROVED_TYPES) {
      expect(types.has(t)).toBe(true);
    }
  });
});
