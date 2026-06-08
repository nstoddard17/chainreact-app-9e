/**
 * @jest-environment node
 *
 * services/workflows/templateManagement use + fork (CS-XT-5B). Mocks the repos, capability
 * resolver, display-name read, and the account role gate; lets the real
 * Workflow/TemplateDefinition schemas run. Proves template-access rules (public/official → any
 * authed user; private → owning-account member only), target membership/role + tier gating,
 * fork lineage, usage-event recording, and sanitized-definition handling.
 */

const repo = {
  getTemplateByIdAnyAccountServiceRole: jest.fn(),
  countTemplatesByAccountServiceRole: jest.fn(),
  createTemplateServiceRole: jest.fn(),
  recordTemplateUsageEventServiceRole: jest.fn(),
};
jest.mock("@/repositories/workflowTemplates", () => repo);

const mockCreateWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({ create: (...a: unknown[]) => mockCreateWorkflow(...a) }));

const mockGetDisplayName = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({ getDisplayName: (...a: unknown[]) => mockGetDisplayName(...a) }));

const mockResolveCaps = jest.fn();
jest.mock("@/services/billing/planCapabilities", () => ({
  resolveAccountCapabilities: (...a: unknown[]) => mockResolveCaps(...a),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

import { createWorkflowFromTemplate, forkTemplateToAccount } from "@/services/workflows/templateManagement";

const ACTOR = "user-1";
const TARGET = "target-acct";
const SRC = "src-acct";

const SANITIZED_DEF = {
  nodes: [{ id: "n1", kind: "action", provider: "slack", type: "post", position: { x: 0, y: 0 }, config: { channel: "C1", botToken: "__REDACTED__" } }],
  edges: [],
};

function template(over: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    accountId: SRC,
    createdByUserId: "author-9",
    name: "Lead intake",
    description: "desc",
    source: "user",
    visibility: "public",
    definition: SANITIZED_DEF,
    schemaVersion: 1,
    publishedAt: "2026-06-01T00:00:00Z",
    unpublishedAt: null,
    forkedFromTemplateId: null,
    creatorDisplayNameSnapshot: "Author",
    usageCount: 0,
    forkCount: 0,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(template());
  repo.countTemplatesByAccountServiceRole.mockResolvedValue(0);
  repo.createTemplateServiceRole.mockImplementation(async (i: Record<string, unknown>) => template({ id: "tpl-fork", accountId: TARGET, createdByUserId: ACTOR, ...i }));
  repo.recordTemplateUsageEventServiceRole.mockResolvedValue({ id: "ev-1" });
  mockCreateWorkflow.mockResolvedValue({ id: "wf-new", name: "Lead intake" });
  mockGetDisplayName.mockResolvedValue("Jane Doe");
  mockResolveCaps.mockResolvedValue({ plan: "pro", fallback: false, capabilities: { plan: "pro", canBulkExport: true, canCreateTemplates: true, canUseBuiltInTemplates: true } });
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
});

describe("createWorkflowFromTemplate (use)", () => {
  it("public template → creates a workflow for a target member + records used_to_create_workflow", async () => {
    const r = await createWorkflowFromTemplate({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r).toEqual({ ok: true, workflowId: "wf-new", workflowName: "Lead intake" });
    // public source → no role check for access; only the target-membership check runs.
    expect(mockRequireRole).toHaveBeenCalledTimes(1);
    expect(mockRequireRole).toHaveBeenCalledWith(ACTOR, TARGET, ["owner", "admin", "member"]);
    // workflow created with the SANITIZED definition (redaction marker preserved, no secret).
    const createArg = mockCreateWorkflow.mock.calls[0]![0];
    expect(createArg.accountId).toBe(TARGET);
    expect(JSON.stringify(createArg.draftDefinition)).toContain("__REDACTED__");
    expect(JSON.stringify(createArg.draftDefinition)).not.toMatch(/xoxb|token.*[A-Za-z0-9]{10}/);
    // usage event carries the created workflow id.
    expect(repo.recordTemplateUsageEventServiceRole).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "tpl-1", eventType: "used_to_create_workflow", createdWorkflowId: "wf-new", targetAccountId: TARGET }),
    );
  });

  it("official template → usable by any authenticated user", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(template({ source: "official", accountId: null, visibility: "public" }));
    const r = await createWorkflowFromTemplate({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r.ok).toBe(true);
  });

  it("private template → usable by a member of the OWNING account", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(template({ visibility: "private" }));
    mockRequireRole.mockResolvedValue({ ok: true, role: "member" }); // member of both src + target
    const r = await createWorkflowFromTemplate({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r.ok).toBe(true);
    // source-access role check uses the template's owning account.
    expect(mockRequireRole).toHaveBeenCalledWith(ACTOR, SRC, ["owner", "admin", "member"]);
  });

  it("private template → NON-member gets template_not_found (no existence leak)", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(template({ visibility: "private" }));
    mockRequireRole.mockImplementation(async (_u: string, accountId: string) =>
      accountId === SRC ? { ok: false, reason: "not_member" } : { ok: true, role: "owner" },
    );
    const r = await createWorkflowFromTemplate({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "template_not_found" });
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
  });

  it("missing template → template_not_found", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(null);
    expect(await createWorkflowFromTemplate({ templateId: "x", targetAccountId: TARGET, actorUserId: ACTOR })).toEqual({ ok: false, reason: "template_not_found" });
  });

  it("non-member of TARGET account → target_not_member (no workflow, no event)", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    const r = await createWorkflowFromTemplate({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "target_not_member" });
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
    expect(repo.recordTemplateUsageEventServiceRole).not.toHaveBeenCalled();
  });

  it("a template whose graph violates workflow invariants → invalid_template", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(template({
      definition: { nodes: [{ id: "t1", kind: "trigger", provider: "slack", type: "x", position: { x: 0, y: 0 }, config: {} }, { id: "t2", kind: "trigger", provider: "slack", type: "y", position: { x: 0, y: 0 }, config: {} }], edges: [] },
    }));
    expect(await createWorkflowFromTemplate({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR })).toEqual({ ok: false, reason: "invalid_template" });
  });
});

describe("forkTemplateToAccount (copy)", () => {
  it("public template → forked into a Pro account under limit; lineage + 'forked' event", async () => {
    const r = await forkTemplateToAccount({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r.ok).toBe(true);
    const createArg = repo.createTemplateServiceRole.mock.calls[0]![0];
    expect(createArg).toMatchObject({ accountId: TARGET, createdByUserId: ACTOR, source: "user", visibility: "private", forkedFromTemplateId: "tpl-1" });
    expect(JSON.stringify(createArg.definition)).toContain("__REDACTED__");
    expect(repo.recordTemplateUsageEventServiceRole).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "tpl-1", eventType: "forked", createdTemplateId: "tpl-fork" }),
    );
  });

  it("Free target → tier_forbidden (cannot save custom templates)", async () => {
    mockResolveCaps.mockResolvedValue({ plan: "free", fallback: false, capabilities: { plan: "free", canBulkExport: false, canCreateTemplates: false, canUseBuiltInTemplates: true } });
    const r = await forkTemplateToAccount({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "tier_forbidden" });
    expect(repo.createTemplateServiceRole).not.toHaveBeenCalled();
  });

  it("at the template limit → limit_reached", async () => {
    repo.countTemplatesByAccountServiceRole.mockResolvedValue(25);
    const r = await forkTemplateToAccount({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "limit_reached", limit: 25, count: 25 });
  });

  it("shared-account member (not owner/admin) → target_forbidden", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    expect(await forkTemplateToAccount({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR })).toEqual({ ok: false, reason: "target_forbidden" });
    expect(mockRequireRole).toHaveBeenCalledWith(ACTOR, TARGET, ["owner", "admin"]);
  });

  it("non-member of target → target_not_member", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    expect(await forkTemplateToAccount({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR })).toEqual({ ok: false, reason: "target_not_member" });
  });

  it("private source, non-member → template_not_found (no create)", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(template({ visibility: "private" }));
    mockRequireRole.mockImplementation(async (_u: string, accountId: string) =>
      accountId === SRC ? { ok: false, reason: "not_member" } : { ok: true, role: "owner" },
    );
    expect(await forkTemplateToAccount({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR })).toEqual({ ok: false, reason: "template_not_found" });
    expect(repo.createTemplateServiceRole).not.toHaveBeenCalled();
  });

  it("fork as public stamps published_at + a safe snapshot", async () => {
    await forkTemplateToAccount({ templateId: "tpl-1", targetAccountId: TARGET, actorUserId: ACTOR, visibility: "public", now: () => "2026-06-07T12:00:00Z" });
    const createArg = repo.createTemplateServiceRole.mock.calls[0]![0];
    expect(createArg).toMatchObject({ visibility: "public", publishedAt: "2026-06-07T12:00:00Z", creatorDisplayNameSnapshot: "Jane Doe" });
  });
});
