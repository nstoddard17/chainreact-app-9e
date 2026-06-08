/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-4 / CS-BD-4B — GET /api/accounts/[id]/workflows/export.
 * Mocks supabase auth + account role gate + workflows repo. Proves auth/membership/no-leak gating,
 * the bulk export metadata + per-workflow sanitized graphs, the attachment header, the too-many
 * limit, and that no planted secret/token/email/user id appears in the serialized response.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockListByAccount = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByAccount: (...a: unknown[]) => mockListByAccount(...a),
}));

// Tier+role gating is always on (the env flag was removed): normal bulk export is owner/admin
// only AND the plan must permit bulk export. These no-leak / metadata cases mock a permitting plan.
const mockResolveCaps = jest.fn();
jest.mock("@/services/billing/planCapabilities", () => ({
  resolveAccountCapabilities: (...a: unknown[]) => mockResolveCaps(...a),
}));

import { GET } from "@/app/api/accounts/[id]/workflows/export/route";
import { REDACTION_MARKER, ACCOUNT_WORKFLOW_EXPORT_LIMIT } from "@/services/workflows/exportWorkflow";

const ACCOUNT = "acct-leak-bulk";

function rec(id: string, name: string, token: string) {
  return {
    id,
    accountId: ACCOUNT,
    createdByUserId: "user-leak-bulk",
    name,
    state: "draft",
    draftDefinition: {
      nodes: [
        {
          id: "n1",
          kind: "action",
          provider: "slack",
          type: "post",
          position: { x: 0, y: 0 },
          config: { channel: "C1", botToken: token, contact: "vp@acme.com" },
        },
      ],
      edges: [],
    },
  };
}

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@x.test" } }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
  mockResolveCaps.mockResolvedValue({
    plan: "business",
    fallback: false,
    capabilities: { plan: "business", canBulkExport: true, canCreateTemplates: false, canUseBuiltInTemplates: true },
  });
  mockListByAccount.mockResolvedValue([
    rec("wf-1", "Alpha", "xoxb-planted-A-1234567"),
    rec("wf-2", "Beta", "ya29.plantedB12345678"),
  ]);
});

it("401 when unauthenticated — no role check, no repo read", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  const res = await GET(new Request("http://x"), params());
  expect(res.status).toBe(401);
  expect(mockRequireRole).not.toHaveBeenCalled();
  expect(mockListByAccount).not.toHaveBeenCalled();
});

it("403 NOT_ACCOUNT_MEMBER for a non-member (no leak) — no repo read", async () => {
  authed();
  mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
  const res = await GET(new Request("http://x"), params());
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  expect(mockListByAccount).not.toHaveBeenCalled();
});

it("requires owner/admin (bulk export of a whole account is an admin action)", async () => {
  authed();
  await GET(new Request("http://x"), params());
  expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin"]);
});

it("owner/admin gets the bulk export with metadata, per-workflow graphs + attachment header", async () => {
  authed();
  const res = await GET(new Request("http://x"), params());
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toMatch(
    /attachment; filename="chainreact-workflows-acct-leak-bulk\.json"/,
  );
  const body = await res.json();
  expect(body).toMatchObject({
    source: "chainreactv2",
    schemaVersion: 1,
    redactionMarker: REDACTION_MARKER,
    accountId: ACCOUNT,
    workflowCount: 2,
  });
  expect(body.workflows.map((w: { name: string }) => w.name)).toEqual(["Alpha", "Beta"]);
  expect(body.workflows[0].definition.nodes[0].config.channel).toBe("C1");
  expect(body.workflows[0].definition.nodes[0].config.botToken).toBe(REDACTION_MARKER);
});

it("serialized response contains NO planted secret / token / email / user id", async () => {
  authed();
  const res = await GET(new Request("http://x"), params());
  const text = await res.text();
  expect(text).not.toMatch(/xoxb-planted-A/);
  expect(text).not.toMatch(/ya29\.plantedB/);
  expect(text).not.toMatch(/vp@acme\.com/);
  expect(text).not.toMatch(/user-leak-bulk/);
});

it("413 TOO_MANY_WORKFLOWS over the export limit", async () => {
  authed();
  mockListByAccount.mockResolvedValue(
    Array.from({ length: ACCOUNT_WORKFLOW_EXPORT_LIMIT + 1 }, (_, i) =>
      rec(`wf-${i}`, `W${i}`, "xoxb-x-1234567"),
    ),
  );
  const res = await GET(new Request("http://x"), params());
  expect(res.status).toBe(413);
  expect((await res.json()).code).toBe("TOO_MANY_WORKFLOWS");
});

it("handles an empty account (zero workflows) with a valid 200 export", async () => {
  authed();
  mockListByAccount.mockResolvedValue([]);
  const res = await GET(new Request("http://x"), params());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.workflowCount).toBe(0);
  expect(body.workflows).toEqual([]);
});
