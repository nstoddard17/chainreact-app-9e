/**
 * @jest-environment node
 *
 * Manifest pins for Typeform — Slice 5.TYPEFORM-1 + TYPEFORM-2. Mirrors
 * the Asana manifest test: exact scope set (no silent bloat), honest
 * capabilities (TYPEFORM-2 ships the first 2 read actions behind the new
 * responses:read scope), refreshable flag, personal token scope.
 */
import { typeformManifest } from "@/integrations/typeform/manifest";
import { getProvider } from "@/integrations/_registry";

describe("typeform manifest", () => {
  it("is registered in the provider registry under the stable id", () => {
    expect(getProvider("typeform")).toBe(typeformManifest);
  });

  it("pins the exact minimum scope set (accounts:read, forms:read, responses:read, webhooks:write, offline)", () => {
    expect([...typeformManifest.scopes.required].sort()).toEqual([
      "accounts:read",
      "forms:read",
      "offline",
      "responses:read",
      "webhooks:write",
    ]);
    expect(typeformManifest.scopes.optional).toEqual([]);
    // No scope bloat: webhooks:read (we never list webhooks) and every
    // write scope beyond webhooks:write deliberately absent —
    // responses:write / forms:write rejected by the catalog audit
    // (destructive / high-surface).
    expect(typeformManifest.scopes.required).not.toContain("webhooks:read");
    expect(typeformManifest.scopes.required).not.toContain("responses:write");
    expect(typeformManifest.scopes.required).not.toContain("forms:write");
    expect(typeformManifest.scopes.required).not.toContain("workspaces:read");
  });

  it("declares honest capabilities: oauth + webhookTrigger + actions (TYPEFORM-2)", () => {
    expect(typeformManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
  });

  it("is refreshable with a user token scope and email account id field", () => {
    expect(typeformManifest.refreshable).toBe(true);
    expect(typeformManifest.tokenScope).toBe("user");
    expect(typeformManifest.accountIdField).toBe("email");
    expect(typeformManifest.isEnabled).toBe(true);
  });
});
