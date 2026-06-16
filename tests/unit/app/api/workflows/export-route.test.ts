/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-3 / CS-BD-4A — GET /api/workflows/[id]/export.
 * Mirrors the detail-route mocks (supabase auth + workflows repo + membership). Proves auth/
 * membership/404 gating, the export metadata + sanitized graph, the attachment header, and that
 * no planted secret/token/email/id appears in the response.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

import { GET } from "@/app/api/workflows/[id]/export/route";
import { REDACTION_MARKER } from "@/services/workflows/exportWorkflow";

const record = {
  id: "wf-1",
  accountId: "acct-leak-1",
  createdByUserId: "user-leak-1",
  name: "Export Me",
  state: "draft",
  draftDefinition: {
    nodes: [
      {
        id: "n1",
        kind: "action",
        provider: "slack",
        type: "post_message",
        position: { x: 0, y: 0 },
        config: { channel: "C123", botToken: (["xoxb", "planted", "secret", "1234567"].join("-")), to: "ceo@acme.com" },
      },
    ],
    edges: [],
  },
};

function params() {
  return { params: Promise.resolve({ id: "wf-1" }) };
}
function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMember.mockResolvedValue(true);
});

it("401 when unauthenticated — no repo read", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  const res = await GET(new Request("http://x/wf-1/export"), params());
  expect(res.status).toBe(401);
  expect(mockGetById).not.toHaveBeenCalled();
});

it("404 for a missing workflow", async () => {
  authed();
  mockGetById.mockResolvedValueOnce(null);
  const res = await GET(new Request("http://x/wf-1/export"), params());
  expect(res.status).toBe(404);
});

it("404 for a soft-deleted workflow", async () => {
  authed();
  mockGetById.mockResolvedValueOnce({ ...record, state: "deleted" });
  const res = await GET(new Request("http://x/wf-1/export"), params());
  expect(res.status).toBe(404);
});

it("404 (no leak) for a non-member", async () => {
  authed();
  mockGetById.mockResolvedValueOnce(record);
  mockIsMember.mockResolvedValue(false);
  const res = await GET(new Request("http://x/wf-1/export"), params());
  expect(res.status).toBe(404);
});

it("member gets the export with metadata, name, sanitized graph + attachment header", async () => {
  authed();
  mockGetById.mockResolvedValueOnce(record);
  const res = await GET(new Request("http://x/wf-1/export"), params());
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="workflow-wf-1\.json"/);
  const body = await res.json();
  expect(body).toMatchObject({
    source: "chainreactv2",
    schemaVersion: 1,
    redactionMarker: REDACTION_MARKER,
    workflow: { name: "Export Me" },
  });
  expect(typeof body.exportedAt).toBe("string");
  expect(body.workflow.definition.nodes[0].config.channel).toBe("C123");
  expect(body.workflow.definition.nodes[0].config.botToken).toBe(REDACTION_MARKER);
});

it("response contains NO planted secret / token / email / account or user id", async () => {
  authed();
  mockGetById.mockResolvedValueOnce(record);
  const res = await GET(new Request("http://x/wf-1/export"), params());
  const text = await res.text();
  expect(text).not.toMatch((new RegExp(["xoxb", "planted", "secret"].join("-"))));
  expect(text).not.toMatch(/ceo@acme\.com/);
  expect(text).not.toMatch(/acct-leak-1/);
  expect(text).not.toMatch(/user-leak-1/);
});
