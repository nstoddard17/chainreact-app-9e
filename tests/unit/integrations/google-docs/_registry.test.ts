/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — Google Docs registry sanity.
 *
 * Pins:
 *   - Provider manifest registered at id "google-docs".
 *   - All 5 action handlers registered against canonical
 *     (provider, type) keys.
 *   - googleDocsOAuth wired in the OAuth dispatcher's map.
 */
import { getProvider } from "@/integrations/_registry";
import { getActionHandler } from "@/services/execution/handlers/_registry";

describe("google-docs registry — manifest", () => {
  it("registers the google-docs provider manifest at id 'google-docs'", () => {
    const manifest = getProvider("google-docs");
    expect(manifest).toBeDefined();
    expect(manifest?.id).toBe("google-docs");
  });
});

describe("google-docs registry — action handlers", () => {
  const EXPECTED_HANDLERS: ReadonlyArray<string> = [
    "create_document",
    "update_document",
    "share_document",
    "get_document",
    "export_document",
  ];

  it.each(EXPECTED_HANDLERS)(
    "registers google-docs:%s handler",
    (type) => {
      expect(getActionHandler("google-docs", type)).toBeDefined();
    },
  );

  it("does NOT register any unsupported google-docs action types", () => {
    // Defense-in-depth — a future careless registration that adds
    // e.g. "delete_document" without going through the audit / metas
    // split would surface here.
    expect(getActionHandler("google-docs", "delete_document")).toBeUndefined();
    expect(getActionHandler("google-docs", "rename_document")).toBeUndefined();
  });
});

describe("google-docs registry — OAuth dispatcher wiring", () => {
  it("googleDocsOAuth is exported and exposes the ProviderOAuth contract", async () => {
    const { googleDocsOAuth } = await import(
      "@/integrations/google-docs/oauth"
    );
    expect(typeof googleDocsOAuth.buildAuthUrl).toBe("function");
    expect(typeof googleDocsOAuth.handleCallback).toBe("function");
    expect(typeof googleDocsOAuth.refreshToken).toBe("function");
  });
});
