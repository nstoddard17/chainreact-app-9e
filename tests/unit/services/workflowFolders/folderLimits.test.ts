/**
 * @jest-environment node
 *
 * Central folder-limit constants (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 */

import {
  FOLDER_LIMITS,
  MAX_FOLDER_DEPTH,
  folderLimitFor,
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
