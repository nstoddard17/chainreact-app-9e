/**
 * @jest-environment node
 *
 * Route tests for DELETE /api/accounts/[id]/integrations/[integrationId]
 * (Slice 4.APPS-DISCONNECT / CD-2). Mocks session auth + the disconnect service;
 * asserts the thin route's REAL typed-error → HTTP mapping, the flag gate, and a
 * sanitized response DTO. The authz matrix itself (which role → which reason)
 * lives in the service test; here we prove every reason maps correctly and the
 * route never invents behavior.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockDisconnect = jest.fn();
jest.mock("@/services/integrations/disconnect", () => ({
  disconnectIntegration: (...a: unknown[]) => mockDisconnect(...a),
}));

import { DELETE } from "@/app/api/accounts/[id]/integrations/[integrationId]/route";

const CALLER = "user-1";
const ACCOUNT = "acc-1";
const INTEGRATION = "int-1";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT, integrationId: INTEGRATION }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER } }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("DELETE integrations/[integrationId]", () => {
  it("401 when unauthenticated — service not called", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await DELETE(new Request("http://x"), params());
    expect(res.status).toBe(401);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it("200 sanitized DTO on a fresh disconnect; calls service with session caller id", async () => {
    signedIn();
    mockDisconnect.mockResolvedValueOnce({
      ok: true,
      disabledWorkflowCount: 2,
      providerRevoked: true,
      alreadyDisconnected: false,
    });
    const res = await DELETE(new Request("http://x"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      disconnected: true,
      alreadyDisconnected: false,
      providerRevoked: true,
      workflowsDisabled: 2,
    });
    expect(mockDisconnect).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      integrationId: INTEGRATION,
      callerUserId: CALLER,
    });
  });

  it("revoke FAILURE still returns 200 success (local disconnect ok, providerRevoked false)", async () => {
    signedIn();
    mockDisconnect.mockResolvedValueOnce({
      ok: true,
      disabledWorkflowCount: 0,
      providerRevoked: false,
      alreadyDisconnected: false,
    });
    const res = await DELETE(new Request("http://x"), params());
    expect(res.status).toBe(200);
    expect((await res.json()).providerRevoked).toBe(false);
  });

  it("idempotent replay ⇒ 200 alreadyDisconnected:true", async () => {
    signedIn();
    mockDisconnect.mockResolvedValueOnce({
      ok: true,
      disabledWorkflowCount: 0,
      providerRevoked: false,
      alreadyDisconnected: true,
    });
    const res = await DELETE(new Request("http://x"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      disconnected: true,
      alreadyDisconnected: true,
      providerRevoked: false,
      workflowsDisabled: 0,
    });
  });

  it.each([
    ["not_found", 404, "INTEGRATION_NOT_FOUND"],
    ["forbidden", 403, "FORBIDDEN"],
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
  ] as const)("maps service reason %s ⇒ %i %s", async (reason, status, code) => {
    signedIn();
    mockDisconnect.mockResolvedValueOnce({ ok: false, reason });
    const res = await DELETE(new Request("http://x"), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });

  it("NO LEAK: success body has exactly the 4 safe keys, no token/error/provider detail", async () => {
    signedIn();
    mockDisconnect.mockResolvedValueOnce({
      ok: true,
      disabledWorkflowCount: 1,
      providerRevoked: true,
      alreadyDisconnected: false,
    });
    const res = await DELETE(new Request("http://x"), params());
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "alreadyDisconnected",
      "disconnected",
      "providerRevoked",
      "workflowsDisabled",
    ]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/token|enc-|provider 5|secret/i);
  });
});
