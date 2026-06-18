/**
 * @jest-environment node
 *
 * Central folder-limit constants (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 */

import {
  FOLDER_LIMITS,
  MAX_FOLDER_DEPTH,
  folderLimitFor,
  folderLimitForPlan,
  folderLimitForAccount,
} from "@/services/workflowFolders/folderLimits";

describe("folder limits", () => {
  it("max depth is 3 for all tiers", () => {
    expect(MAX_FOLDER_DEPTH).toBe(3);
  });

  it("maps each account type to its locked cap", () => {
    expect(folderLimitFor("personal")).toBe(10);
    expect(folderLimitFor("team")).toBe(100);
    expect(folderLimitFor("organization")).toBe(250);
  });

  it("exposes the limits as a single config map (one seam, no per-tier code path)", () => {
    expect(FOLDER_LIMITS).toEqual({ personal: 10, team: 100, organization: 250 });
  });
});

describe("folderLimitForPlan (plan-aware, PRICING-LOCK)", () => {
  it("maps each plan to its folder cap: Free 10 / Pro 25 / Team 100 / Business 250", () => {
    expect(folderLimitForPlan("free")).toBe(10);
    expect(folderLimitForPlan("pro")).toBe(25);
    expect(folderLimitForPlan("team")).toBe(100);
    expect(folderLimitForPlan("business")).toBe(250);
  });

  it("Enterprise is uncapped (null)", () => {
    expect(folderLimitForPlan("enterprise")).toBeNull();
  });

  it("Pro raises the cap above Free even though both are personal-type accounts", () => {
    expect(folderLimitForPlan("pro")).toBeGreaterThan(folderLimitForPlan("free")!);
  });
});

describe("folderLimitForAccount (display fallback)", () => {
  it("uses the plan cap when the plan is known (Pro personal = 25, Free personal = 10)", () => {
    expect(folderLimitForAccount("pro", "personal")).toBe(25);
    expect(folderLimitForAccount("free", "personal")).toBe(10);
    expect(folderLimitForAccount("team", "team")).toBe(100);
    expect(folderLimitForAccount("business", "organization")).toBe(250);
  });

  it("falls back to the account-type default when the plan is unknown", () => {
    expect(folderLimitForAccount(null, "personal")).toBe(10);
    expect(folderLimitForAccount(null, "team")).toBe(100);
    expect(folderLimitForAccount(null, "organization")).toBe(250);
  });

  it("falls back to the type default for an uncapped (Enterprise) plan rather than returning null", () => {
    expect(folderLimitForAccount("enterprise", "organization")).toBe(250);
  });
});
