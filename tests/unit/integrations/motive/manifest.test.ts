/**
 * @jest-environment node
 *
 * MOTIVE-1 — manifest capability + scope + credential-class pins.
 */
import { motiveManifest } from "@/integrations/motive/manifest";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";

describe("motive manifest", () => {
  it("declares the honest capability set (actions + webhook + polling)", () => {
    expect(motiveManifest.id).toBe("motive");
    expect(motiveManifest.displayName).toBe("Motive");
    expect(motiveManifest.isEnabled).toBe(true);
    expect(motiveManifest.apiVersion).toBe("v1");
    expect(motiveManifest.accountIdField).toBe("companyId");
    expect(motiveManifest.refreshable).toBe(true);
    expect(motiveManifest.capabilities).toMatchObject({
      oauth: true,
      actions: true,
      webhookTrigger: true,
      pollingTrigger: true,
    });
  });

  // The exact Doorkeeper scope identifiers the shipped nodes require — pinned so
  // adding/removing a scope forces a deliberate test update.
  const EXPECTED_SCOPES = [
    "companies.read",
    "fuel_purchases.read",
    "fuel_purchases.manage",
    "vehicles.read",
    "vehicles.manage",
    "users.read",
    "users.manage",
    "messages.manage",
    "company_webhooks.manage",
    "inspection_reports.read",
    "hos_logs.hos_violation",
    "driver_performance_events.read",
    "speeding_events.read",
    "fault_codes.read",
  ];

  it("requests EXACTLY the 14 scopes the shipped nodes use, with no duplicates", () => {
    expect([...motiveManifest.scopes.required].sort()).toEqual(
      [...EXPECTED_SCOPES].sort(),
    );
    expect(motiveManifest.scopes.required).toHaveLength(14);
    // No duplicates.
    expect(new Set(motiveManifest.scopes.required).size).toBe(14);
    expect(motiveManifest.scopes.optional).toEqual([]);
  });

  it("covers every shipped capability and excludes non-authorizing / unused scopes", () => {
    const req = new Set(motiveManifest.scopes.required);
    // Webhook creation is mandatory for the 7 webhook triggers.
    expect(req.has("company_webhooks.manage")).toBe(true);
    // Each safety/inspection trigger's read scope is present.
    for (const s of [
      "inspection_reports.read",
      "hos_logs.hos_violation",
      "driver_performance_events.read",
      "speeding_events.read",
      "fault_codes.read",
    ]) {
      expect(req.has(s)).toBe(true);
    }
    // Dispatch-Forms scopes do NOT authorize Inspection Reports — must be absent.
    expect(req.has("forms.read")).toBe(false);
    expect(req.has("form_entries.read")).toBe(false);
    // No unused broad scopes.
    expect(req.has("dispatches.manage")).toBe(false);
    expect(req.has("locations.vehicle_locations_list")).toBe(false);
  });

  it("is an ACCOUNT credential provider (shared company fleet)", () => {
    expect(isAccountCredentialProvider("motive")).toBe(true);
  });
});
