/**
 * @jest-environment node
 *
 * Manifest pins for Calendly — Slice 5.CALENDLY-1. Mirrors the
 * Asana/Typeform manifest tests: exact scope set (no silent bloat),
 * honest capabilities (ZERO actions this slice — the invitee payload
 * embeds the scheduled_event), refreshable flag, personal token scope.
 */
import { calendlyManifest } from "@/integrations/calendly/manifest";
import { getProvider } from "@/integrations/_registry";

describe("calendly manifest", () => {
  it("is registered in the provider registry under the stable id", () => {
    expect(getProvider("calendly")).toBe(calendlyManifest);
  });

  it("pins the exact minimum scope set (users:read, event_types:read, scheduled_events:read, webhooks:write)", () => {
    expect([...calendlyManifest.scopes.required].sort()).toEqual([
      "event_types:read",
      "scheduled_events:read",
      "users:read",
      "webhooks:write",
    ]);
    expect(calendlyManifest.scopes.optional).toEqual([]);
    // No scope bloat: webhooks:read / write scopes deliberately absent.
    expect(calendlyManifest.scopes.required).not.toContain("webhooks:read");
    expect(calendlyManifest.scopes.required).not.toContain("scheduled_events:write");
    expect(calendlyManifest.scopes.required).not.toContain("event_types:write");
  });

  it("declares honest capabilities: oauth + webhookTrigger only (ZERO actions this slice)", () => {
    expect(calendlyManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: false,
    });
  });

  it("is refreshable with a user token scope and email account id field", () => {
    expect(calendlyManifest.refreshable).toBe(true);
    expect(calendlyManifest.tokenScope).toBe("user");
    expect(calendlyManifest.accountIdField).toBe("email");
    expect(calendlyManifest.isEnabled).toBe(true);
  });
});
