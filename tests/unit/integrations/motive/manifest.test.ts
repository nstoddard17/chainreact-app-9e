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
  // adding/removing a scope forces a deliberate test update. One scope per
  // developer-portal permission row: Motive's portal grants EXACTLY ONE variant
  // per row ("Read and write" REPLACES `.read` with `.manage`), so requesting a
  // `.read` alongside its `.manage` rejects the whole authorize request
  // (live-verified 2026-07-24).
  const EXPECTED_SCOPES = [
    "companies.read",
    "fuel_purchases.manage",
    "vehicles.manage",
    "users.manage",
    "messages.manage",
    "company_webhooks.manage",
    "inspection_reports.read",
    "hos_logs.hos_violation",
    "driver_performance_events.read",
    "speeding_events.read",
    "fault_codes.read",
  ];

  it("requests EXACTLY the 11 scopes the shipped nodes use, with no duplicates", () => {
    expect([...motiveManifest.scopes.required].sort()).toEqual(
      [...EXPECTED_SCOPES].sort(),
    );
    expect(motiveManifest.scopes.required).toHaveLength(11);
    // No duplicates.
    expect(new Set(motiveManifest.scopes.required).size).toBe(11);
    expect(motiveManifest.scopes.optional).toEqual([]);
    // A `.read` must NEVER be requested for a row set to Read-and-write — the
    // portal grants only the `.manage` variant and the pair 403s the authorize.
    for (const readWriteRowRead of [
      "fuel_purchases.read",
      "vehicles.read",
      "users.read",
      "messages.read",
    ]) {
      expect(motiveManifest.scopes.required).not.toContain(readWriteRowRead);
    }
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
