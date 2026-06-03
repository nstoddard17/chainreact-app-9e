/**
 * @jest-environment node
 *
 * Tests for services/options/workflowCreatorContext.ts
 * (Slice 4.ACCOUNT-MODEL-22D-1).
 *
 * PLUMBING ONLY. The helper resolves the workflow creator's user id so a LATER
 * slice (22D-2) can apply the creator-pinned credential policy for personal
 * providers. These tests pin that resolution is best-effort, RLS-respecting,
 * and never throws — so it can never break an options request that previously
 * worked.
 */

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

import { resolveWorkflowCreatorContext } from "@/services/options/workflowCreatorContext";

beforeEach(() => {
  mockGetById.mockReset();
});

describe("resolveWorkflowCreatorContext", () => {
  it("returns the workflow id + created_by_user_id + account id when the workflow resolves", async () => {
    mockGetById.mockResolvedValue({
      id: "wf-1",
      createdByUserId: "creator-1",
      accountId: "acct-x",
    });

    const result = await resolveWorkflowCreatorContext("wf-1");

    expect(result).toEqual({
      workflowId: "wf-1",
      createdByUserId: "creator-1",
      accountId: "acct-x",
    });
    expect(mockGetById).toHaveBeenCalledWith("wf-1");
  });

  it("trims the workflowId before the lookup", async () => {
    mockGetById.mockResolvedValue({ id: "wf-1", createdByUserId: "creator-1" });

    await resolveWorkflowCreatorContext("  wf-1  ");

    expect(mockGetById).toHaveBeenCalledWith("wf-1");
  });

  it("returns null for a blank / whitespace-only id WITHOUT a DB round-trip", async () => {
    await expect(resolveWorkflowCreatorContext("   ")).resolves.toBeNull();
    await expect(resolveWorkflowCreatorContext("")).resolves.toBeNull();
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("returns null when the workflow is not visible / not found (no existence leak)", async () => {
    // getById is RLS-scoped — a workflowId the caller can't see resolves null.
    mockGetById.mockResolvedValue(null);

    await expect(resolveWorkflowCreatorContext("wf-foreign")).resolves.toBeNull();
  });

  it("returns null (never throws, never leaks) when the lookup fails", async () => {
    mockGetById.mockRejectedValue(
      new Error("supabase: secret connection string leaked here"),
    );

    await expect(resolveWorkflowCreatorContext("wf-1")).resolves.toBeNull();
  });
});
