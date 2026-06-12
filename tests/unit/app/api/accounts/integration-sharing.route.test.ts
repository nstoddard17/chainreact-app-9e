/**
 * @jest-environment node
 *
 * Route tests for POST /api/accounts/[id]/integrations/[integrationId]/sharing
 * (Slice 4.CONN-SHARE / CS-2). Mocks session auth + the sharing service; asserts
 * the thin route's scope validation, the typed-error → HTTP mapping, the
 * session-caller plumbing, and a sanitized response DTO. The authz matrix itself
 * lives in the service test.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockSetSharing = jest.fn();
jest.mock("@/services/integrations/connectionSharing", () => ({
  setIntegrationSharingScope: (...a: unknown[]) => mockSetSharing(...a),
}));

import { POST } from "@/app/api/accounts/[id]/integrations/[integrationId]/sharing/route";

const CALLER = "user-1";
const ACCOUNT = "acc-1";
const INTEGRATION = "int-1";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT, integrationId: INTEGRATION }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER } }, error: null });
}
function req(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => jest.clearAllMocks());

describe("POST integrations/[integrationId]/sharing", () => {
  it("401 when unauthenticated — service not called", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ scope: "shared_with_account" }), params());
    expect(res.status).toBe(401);
    expect(mockSetSharing).not.toHaveBeenCalled();
  });

  it.each([
    ["missing scope", {}],
    ["unknown scope", { scope: "public" }],
    ["non-string scope", { scope: 1 }],
    ["empty body", undefined],
  ])("400 INVALID_SHARING_SCOPE for %s — service not called", async (_label, body) => {
    signedIn();
    const res = await POST(req(body), params());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_SHARING_SCOPE");
    expect(mockSetSharing).not.toHaveBeenCalled();
  });

  it("200 share: passes session caller id + path ids + scope; returns {scope, shared:true, changed}", async () => {
    signedIn();
    mockSetSharing.mockResolvedValueOnce({ ok: true, scope: "shared_with_account", changed: true });
    const res = await POST(req({ scope: "shared_with_account" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scope: "shared_with_account", shared: true, changed: true });
    expect(mockSetSharing).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      integrationId: INTEGRATION,
      callerUserId: CALLER,
      scope: "shared_with_account",
    });
  });

  it("200 unshare: returns {scope, shared:false, changed}", async () => {
    signedIn();
    mockSetSharing.mockResolvedValueOnce({ ok: true, scope: "private_to_connector", changed: false });
    const res = await POST(req({ scope: "private_to_connector" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scope: "private_to_connector", shared: false, changed: false });
  });

  it.each([
    ["not_enabled", 404, "CONNECTION_SHARING_NOT_ENABLED"],
    ["not_found", 404, "INTEGRATION_NOT_FOUND"],
    ["forbidden", 403, "FORBIDDEN"],
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["account_provider_not_shareable", 422, "ACCOUNT_PROVIDER_NOT_SHAREABLE"],
  ] as const)("maps service reason %s ⇒ %i %s", async (reason, status, code) => {
    signedIn();
    mockSetSharing.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(req({ scope: "shared_with_account" }), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });

  it("NO LEAK: success body has exactly {changed, scope, shared}, no token/provider detail", async () => {
    signedIn();
    mockSetSharing.mockResolvedValueOnce({ ok: true, scope: "shared_with_account", changed: true });
    const res = await POST(req({ scope: "shared_with_account" }), params());
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["changed", "scope", "shared"]);
    expect(JSON.stringify(body)).not.toMatch(/token|enc-|secret|provider_account|@/i);
  });
});
