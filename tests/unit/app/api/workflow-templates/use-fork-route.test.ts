/**
 * @jest-environment node
 *
 * POST /api/workflow-templates/[templateId]/use + /fork (CS-XT-5B). Mocks auth and the service.
 * Proves auth required; strict bodies; and the typed-reason → HTTP mapping for both routes.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockUse = jest.fn();
const mockFork = jest.fn();
jest.mock("@/services/workflows/templateManagement", () => ({
  createWorkflowFromTemplate: (...a: unknown[]) => mockUse(...a),
  forkTemplateToAccount: (...a: unknown[]) => mockFork(...a),
}));

import { POST as USE } from "@/app/api/workflow-templates/[templateId]/use/route";
import { POST as FORK } from "@/app/api/workflow-templates/[templateId]/fork/route";

const TPL = "tpl-1";
const ACCT = "11111111-1111-1111-1111-111111111111";
function params() {
  return { params: Promise.resolve({ templateId: TPL }) };
}
function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@x.test" } }, error: null });
}
function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  jest.clearAllMocks();
  authed();
  mockUse.mockResolvedValue({ ok: true, workflowId: "wf-new", workflowName: "T" });
  mockFork.mockResolvedValue({ ok: true, template: { id: "tpl-fork", visibility: "private" } });
});

describe("use route", () => {
  it("401 unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await USE(req({ targetAccountId: ACCT }), params())).status).toBe(401);
  });

  it("strict body rejects unknown fields → 400", async () => {
    const res = await USE(req({ targetAccountId: ACCT, source: "official" }), params());
    expect(res.status).toBe(400);
    expect(mockUse).not.toHaveBeenCalled();
  });

  it("creates a workflow (201)", async () => {
    const res = await USE(req({ targetAccountId: ACCT, workflowName: "My WF" }), params());
    expect(res.status).toBe(201);
    expect((await res.json()).workflowId).toBe("wf-new");
    expect(mockUse).toHaveBeenCalledWith(expect.objectContaining({ templateId: TPL, targetAccountId: ACCT, actorUserId: "user-1", workflowName: "My WF" }));
  });

  it("template_not_found → 404", async () => {
    mockUse.mockResolvedValue({ ok: false, reason: "template_not_found" });
    const res = await USE(req({ targetAccountId: ACCT }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("TEMPLATE_NOT_FOUND");
  });

  it("target_not_member → 403 NOT_ACCOUNT_MEMBER", async () => {
    mockUse.mockResolvedValue({ ok: false, reason: "target_not_member" });
    const res = await USE(req({ targetAccountId: ACCT }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });

  it("invalid_template → 422", async () => {
    mockUse.mockResolvedValue({ ok: false, reason: "invalid_template" });
    expect((await USE(req({ targetAccountId: ACCT }), params())).status).toBe(422);
  });
});

describe("fork route", () => {
  it("forks (201)", async () => {
    const res = await FORK(req({ targetAccountId: ACCT, name: "My copy" }), params());
    expect(res.status).toBe(201);
    expect((await res.json()).template.id).toBe("tpl-fork");
  });

  it("tier_forbidden → 403 TEMPLATES_REQUIRE_UPGRADE", async () => {
    mockFork.mockResolvedValue({ ok: false, reason: "tier_forbidden" });
    const res = await FORK(req({ targetAccountId: ACCT }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TEMPLATES_REQUIRE_UPGRADE");
  });

  it("limit_reached → 403 TEMPLATE_LIMIT_REACHED", async () => {
    mockFork.mockResolvedValue({ ok: false, reason: "limit_reached", limit: 25, count: 25 });
    const res = await FORK(req({ targetAccountId: ACCT }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TEMPLATE_LIMIT_REACHED");
  });

  it("target_forbidden (member, not owner/admin) → 403 FORBIDDEN", async () => {
    mockFork.mockResolvedValue({ ok: false, reason: "target_forbidden" });
    const res = await FORK(req({ targetAccountId: ACCT }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("template_not_found → 404", async () => {
    mockFork.mockResolvedValue({ ok: false, reason: "template_not_found" });
    expect((await FORK(req({ targetAccountId: ACCT }), params())).status).toBe(404);
  });

  it("strict body rejects unknown fields → 400", async () => {
    const res = await FORK(req({ targetAccountId: ACCT, source: "official", usage_count: 9 }), params());
    expect(res.status).toBe(400);
    expect(mockFork).not.toHaveBeenCalled();
  });
});
