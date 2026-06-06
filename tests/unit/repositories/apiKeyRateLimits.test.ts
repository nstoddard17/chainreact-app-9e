/**
 * @jest-environment node
 *
 * Tests for repositories/apiKeyRateLimits (Slice 4.API-KEYS-RATE-LIMIT-1). Mocks the
 * service-role client's `.rpc` to verify the increment RPC name + params and the
 * TABLE-row → counts mapping. No DB.
 */

const mockRpc = jest.fn();
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => ({ rpc: (...a: unknown[]) => mockRpc(...a) })),
}));

import { incrementApiKeyRateLimitWindowsServiceRole } from "@/repositories/apiKeyRateLimits";

const INPUT = {
  keyBucket: "key:k1:60000",
  workflowBucket: "wf:a1:wf1:60000",
  accountBucket: "acct:a1:60000",
  windowStart: "2026-06-05T00:01:00.000Z",
  expiresAt: "2026-06-05T00:02:00.000Z",
};

beforeEach(() => mockRpc.mockReset());

describe("incrementApiKeyRateLimitWindowsServiceRole", () => {
  it("calls the increment RPC with mapped params and returns the counts", async () => {
    mockRpc.mockResolvedValue({
      data: [{ key_count: 2, workflow_count: 3, account_count: 4 }],
      error: null,
    });
    const counts = await incrementApiKeyRateLimitWindowsServiceRole(INPUT);
    expect(counts).toEqual({ key: 2, workflow: 3, account: 4 });
    expect(mockRpc).toHaveBeenCalledWith("increment_api_key_rate_limits", {
      p_key_bucket: "key:k1:60000",
      p_workflow_bucket: "wf:a1:wf1:60000",
      p_account_bucket: "acct:a1:60000",
      p_window_start: "2026-06-05T00:01:00.000Z",
      p_expires_at: "2026-06-05T00:02:00.000Z",
    });
  });

  it("accepts a single-object data shape too", async () => {
    mockRpc.mockResolvedValue({
      data: { key_count: 1, workflow_count: 1, account_count: 1 },
      error: null,
    });
    expect(await incrementApiKeyRateLimitWindowsServiceRole(INPUT)).toEqual({
      key: 1,
      workflow: 1,
      account: 1,
    });
  });

  it("throws on an RPC error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(incrementApiKeyRateLimitWindowsServiceRole(INPUT)).rejects.toThrow(/boom/);
  });

  it("throws when no row is returned", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(incrementApiKeyRateLimitWindowsServiceRole(INPUT)).rejects.toThrow(/no row/);
  });
});
