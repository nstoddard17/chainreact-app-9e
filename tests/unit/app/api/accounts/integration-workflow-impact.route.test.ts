/**
 * @jest-environment node
 *
 * Route tests for GET /api/accounts/[id]/integrations/[integrationId]/workflow-impact
 * (Slice 4.APPS-DISCONNECT / CD-2). Mocks session auth + the advisory service.
 * Proves: flag gate, 401 unauth, the typed-error → HTTP mapping, and a sanitized
 * affected-count payload (id + name only). Authorization (who may learn the
 * count) is enforced in the service and asserted there.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockImpact = jest.fn();
jest.mock("@/services/integrations/disconnect", () => ({
  getIntegrationWorkflowImpact: (...a: unknown[]) => mockImpact(...a),
}));

import { GET } from "@/app/api/accounts/[id]/integrations/[integrationId]/workflow-impact/route";

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

describe("GET integrations/[integrationId]/workflow-impact", () => {
  it("401 when unauthenticated — service not called", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(401);
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("200 returns the safe affected-count summary; calls service with session caller id", async () => {
    signedIn();
    mockImpact.mockResolvedValueOnce({
      ok: true,
      affectedWorkflowCount: 2,
      workflows: [
        { id: "wf-1", name: "Daily digest" },
        { id: "wf-2", name: "Paused mailer" },
      ],
    });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      affectedWorkflowCount: 2,
      workflows: [
        { id: "wf-1", name: "Daily digest" },
        { id: "wf-2", name: "Paused mailer" },
      ],
    });
    expect(mockImpact).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      integrationId: INTEGRATION,
      callerUserId: CALLER,
    });
  });

  it.each([
    ["not_found", 404, "INTEGRATION_NOT_FOUND"],
    ["forbidden", 403, "FORBIDDEN"],
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
  ] as const)("maps service reason %s ⇒ %i %s (never the count)", async (reason, status, code) => {
    signedIn();
    mockImpact.mockResolvedValueOnce({ ok: false, reason });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.code).toBe(code);
    expect(body).not.toHaveProperty("affectedWorkflowCount");
  });

  it("NO LEAK: payload exposes only affectedWorkflowCount + workflows[{id,name}]", async () => {
    signedIn();
    mockImpact.mockResolvedValueOnce({
      ok: true,
      affectedWorkflowCount: 1,
      workflows: [{ id: "wf-1", name: "Daily digest" }],
    });
    const res = await GET(new Request("http://x"), params());
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["affectedWorkflowCount", "workflows"]);
    expect(Object.keys(body.workflows[0]).sort()).toEqual(["id", "name"]);
  });
});
