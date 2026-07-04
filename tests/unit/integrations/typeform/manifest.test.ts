/**
 * @jest-environment node
 *
 * Manifest pins for Typeform — Slice 5.TYPEFORM-1. Mirrors the Asana
 * manifest test: exact scope set (no silent bloat), honest capabilities
 * (ZERO actions this slice — the form_response payload is
 * self-contained), refreshable flag, personal token scope.
 */
import { typeformManifest } from "@/integrations/typeform/manifest";
import { getProvider } from "@/integrations/_registry";

describe("typeform manifest", () => {
  it("is registered in the provider registry under the stable id", () => {
    expect(getProvider("typeform")).toBe(typeformManifest);
  });

  it("pins the exact minimum scope set (accounts:read, forms:read, webhooks:write, offline)", () => {
    expect([...typeformManifest.scopes.required].sort()).toEqual([
      "accounts:read",
      "forms:read",
      "offline",
      "webhooks:write",
    ]);
    expect(typeformManifest.scopes.optional).toEqual([]);
    // No scope bloat: webhooks:read / responses:read deliberately absent.
    expect(typeformManifest.scopes.required).not.toContain("webhooks:read");
    expect(typeformManifest.scopes.required).not.toContain("responses:read");
  });

  it("declares honest capabilities: oauth + webhookTrigger only (ZERO actions this slice)", () => {
    expect(typeformManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: false,
    });
  });

  it("is refreshable with a user token scope and email account id field", () => {
    expect(typeformManifest.refreshable).toBe(true);
    expect(typeformManifest.tokenScope).toBe("user");
    expect(typeformManifest.accountIdField).toBe("email");
    expect(typeformManifest.isEnabled).toBe(true);
  });
});
