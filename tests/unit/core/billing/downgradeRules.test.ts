/**
 * Slice 4.BILLING-PLAN-METADATA-6 / CS-5 — pure downgrade safety rules.
 * Validation/preview only; never mutates or deletes. Limits come from plan policy
 * (Team: 5 members / 100 folders; Free: 1 member / 10 folders; enterprise: uncapped).
 */

import { evaluateDowngrade } from "@/core/billing/downgradeRules";

describe("evaluateDowngrade", () => {
  it("allows when usage is within the target limits", () => {
    const r = evaluateDowngrade({ memberCount: 3, folderCount: 40 }, "team");
    expect(r.ok).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("allows equality (usage == limit is fine)", () => {
    const r = evaluateDowngrade({ memberCount: 5, folderCount: 100 }, "team");
    expect(r.ok).toBe(true);
  });

  it("Business → Team blocks when members exceed 5", () => {
    const r = evaluateDowngrade({ memberCount: 12, folderCount: 10 }, "team");
    expect(r.ok).toBe(false);
    expect(r.blockers).toContainEqual({ kind: "members", current: 12, limit: 5 });
  });

  it("Business → Team blocks when folders exceed the Team cap (100)", () => {
    const r = evaluateDowngrade({ memberCount: 2, folderCount: 150 }, "team");
    expect(r.ok).toBe(false);
    expect(r.blockers).toContainEqual({ kind: "folders", current: 150, limit: 100 });
  });

  it("reports BOTH blockers when members and folders overflow", () => {
    const r = evaluateDowngrade({ memberCount: 12, folderCount: 150 }, "team");
    expect(r.ok).toBe(false);
    expect(r.blockers).toHaveLength(2);
  });

  it("Pro → Free blocks when folders exceed the Free cap (10)", () => {
    const r = evaluateDowngrade({ memberCount: 1, folderCount: 25 }, "free");
    expect(r.ok).toBe(false);
    expect(r.blockers).toContainEqual({ kind: "folders", current: 25, limit: 10 });
  });

  it("Pro → Free allows when under the Free caps", () => {
    const r = evaluateDowngrade({ memberCount: 1, folderCount: 8 }, "free");
    expect(r.ok).toBe(true);
  });

  it("enterprise target (null limits) never blocks", () => {
    const r = evaluateDowngrade({ memberCount: 1000, folderCount: 9999 }, "enterprise");
    expect(r.ok).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});
