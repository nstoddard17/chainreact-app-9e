/**
 * @jest-environment node
 *
 * services/workflows/templateManagement (CS-XT-5A). Mocks the repos + capability resolver +
 * display-name read; lets the real createTemplateFromWorkflow + export sanitizer run. Proves
 * tier gating (Free blocked / limit reached / enterprise unlimited), same-account workflow
 * binding, creator-only edit, owner-override delete, publish-metadata stamping, and that the
 * stored definition is sanitized (no planted secret).
 */

const repo = {
  countTemplatesByAccountServiceRole: jest.fn(),
  createTemplateServiceRole: jest.fn(),
  listTemplatesByAccountServiceRole: jest.fn(),
  listMarketplaceTemplatesServiceRole: jest.fn(),
  getTemplateByIdServiceRole: jest.fn(),
  updateTemplateMetadataServiceRole: jest.fn(),
  deleteTemplateServiceRole: jest.fn(),
};
jest.mock("@/repositories/workflowTemplates", () => repo);

const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({ getById: (...a: unknown[]) => mockGetWorkflow(...a) }));

const mockGetDisplayName = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({ getDisplayName: (...a: unknown[]) => mockGetDisplayName(...a) }));

const mockResolveCaps = jest.fn();
jest.mock("@/services/billing/planCapabilities", () => ({
  resolveAccountCapabilities: (...a: unknown[]) => mockResolveCaps(...a),
}));

import {
  listAccountTemplates,
  createAccountTemplate,
  updateAccountTemplate,
  deleteAccountTemplate,
} from "@/services/workflows/templateManagement";

const ACCOUNT = "acct-1";
const ACTOR = "user-1";

function workflow(over: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    accountId: ACCOUNT,
    createdByUserId: ACTOR,
    name: "Lead intake",
    state: "draft",
    draftDefinition: {
      nodes: [{ id: "n1", kind: "action", provider: "slack", type: "post", position: { x: 0, y: 0 }, config: { channel: "C1", botToken: (["xoxb", "planted", "secret", "123456"].join("-")), contact: "vp@acme.com" } }],
      edges: [],
    },
    ...over,
  };
}

function templateRecord(over: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    accountId: ACCOUNT,
    createdByUserId: ACTOR,
    name: "T",
    description: null,
    source: "user",
    visibility: "private",
    definition: { nodes: [], edges: [] },
    schemaVersion: 1,
    publishedAt: null,
    unpublishedAt: null,
    forkedFromTemplateId: null,
    creatorDisplayNameSnapshot: null,
    usageCount: 0,
    forkCount: 0,
    createdAt: "2026-06-07T00:00:00Z",
    updatedAt: "2026-06-07T00:00:00Z",
    ...over,
  };
}

function caps(canCreateTemplates: boolean, plan = "pro") {
  return { plan, fallback: false, capabilities: { plan, canBulkExport: true, canCreateTemplates, canUseBuiltInTemplates: true } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveCaps.mockResolvedValue(caps(true, "pro"));
  repo.countTemplatesByAccountServiceRole.mockResolvedValue(0);
  repo.createTemplateServiceRole.mockImplementation(async (input: Record<string, unknown>) =>
    templateRecord({ definition: input.definition, visibility: input.visibility, publishedAt: input.publishedAt, creatorDisplayNameSnapshot: input.creatorDisplayNameSnapshot }),
  );
  mockGetWorkflow.mockResolvedValue(workflow());
  mockGetDisplayName.mockResolvedValue("Jane Doe");
});

describe("listAccountTemplates — data minimization (no raw creator id) + canManage", () => {
  it("never surfaces createdByUserId and resolves canManage per the authed viewer", async () => {
    const OTHER = "user-2";
    repo.listTemplatesByAccountServiceRole.mockResolvedValue([
      templateRecord({ id: "mine", createdByUserId: ACTOR }), // creator → manageable
      templateRecord({ id: "theirs", createdByUserId: OTHER }), // co-member → not manageable
      templateRecord({ id: "orphan", createdByUserId: null }), // deleted author → manageable by nobody
    ]);

    const summaries = await listAccountTemplates(ACCOUNT, ACTOR);

    // No raw user id (the viewer's OR a co-member's) and no createdByUserId key leaves the service.
    const blob = JSON.stringify(summaries);
    expect(blob).not.toContain(OTHER);
    expect(blob).not.toContain(ACTOR);
    expect(blob).not.toContain("createdByUserId");
    for (const s of summaries) expect(s).not.toHaveProperty("createdByUserId");

    // canManage is creator-only — matching the updateAccountTemplate gate.
    expect(summaries.map((s) => [s.id, s.canManage])).toEqual([
      ["mine", true],
      ["theirs", false],
      ["orphan", false],
    ]);
  });

  it("an official record (source='official', null creator) returned here is canManage:false", async () => {
    repo.listTemplatesByAccountServiceRole.mockResolvedValue([
      templateRecord({ id: "off", source: "official", createdByUserId: null }),
    ]);
    const summary = (await listAccountTemplates(ACCOUNT, ACTOR))[0]!;
    expect(summary.source).toBe("official");
    expect(summary.canManage).toBe(false);
  });
});

describe("createAccountTemplate — tier + binding", () => {
  it("Free (cannot create templates) → tier_forbidden, no workflow read / create", async () => {
    mockResolveCaps.mockResolvedValue(caps(false, "free"));
    const r = await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-1" });
    expect(r).toEqual({ ok: false, reason: "tier_forbidden" });
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    expect(repo.createTemplateServiceRole).not.toHaveBeenCalled();
  });

  it("Pro at the limit → limit_reached", async () => {
    mockResolveCaps.mockResolvedValue(caps(true, "pro"));
    repo.countTemplatesByAccountServiceRole.mockResolvedValue(25); // pro cap
    const r = await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-1" });
    expect(r).toEqual({ ok: false, reason: "limit_reached", limit: 25, count: 25 });
    expect(repo.createTemplateServiceRole).not.toHaveBeenCalled();
  });

  it("Enterprise (null limit) skips the count check and creates", async () => {
    mockResolveCaps.mockResolvedValue(caps(true, "enterprise"));
    const r = await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-1" });
    expect(r.ok).toBe(true);
    expect(repo.countTemplatesByAccountServiceRole).not.toHaveBeenCalled();
  });

  it("workflow from another account → workflow_not_found (no cross-account templating)", async () => {
    mockGetWorkflow.mockResolvedValue(workflow({ accountId: "other-acct" }));
    const r = await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-1" });
    expect(r).toEqual({ ok: false, reason: "workflow_not_found" });
  });

  it("deleted / missing workflow → workflow_not_found", async () => {
    mockGetWorkflow.mockResolvedValue(null);
    expect(await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-x" })).toEqual({ ok: false, reason: "workflow_not_found" });
  });

  it("stores a SANITIZED definition (planted secret redacted) and source stays user", async () => {
    const r = await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-1" });
    expect(r.ok).toBe(true);
    const arg = repo.createTemplateServiceRole.mock.calls[0]![0];
    const blob = JSON.stringify(arg.definition);
    expect(blob).not.toMatch((new RegExp(["xoxb", "planted", "secret"].join("-"))));
    expect(blob).not.toMatch(/vp@acme\.com/);
    expect(arg.source).toBeUndefined(); // never 'official' from this path (repo defaults 'user')
  });

  it("private create does NOT stamp publish metadata", async () => {
    await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-1" });
    const arg = repo.createTemplateServiceRole.mock.calls[0]![0];
    expect(arg.publishedAt).toBeNull();
    expect(arg.creatorDisplayNameSnapshot).toBeNull();
    expect(mockGetDisplayName).not.toHaveBeenCalled();
  });

  it("public create stamps published_at + a SAFE display-name snapshot", async () => {
    await createAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, workflowId: "wf-1", visibility: "public", now: () => "2026-06-07T12:00:00Z" });
    const arg = repo.createTemplateServiceRole.mock.calls[0]![0];
    expect(arg.visibility).toBe("public");
    expect(arg.publishedAt).toBe("2026-06-07T12:00:00Z");
    expect(arg.creatorDisplayNameSnapshot).toBe("Jane Doe");
  });
});

describe("updateAccountTemplate — creator-only", () => {
  it("missing template → not_found", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(null);
    expect(await updateAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, templateId: "tpl-x", name: "x" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("non-creator cannot edit the original (even owner/admin)", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(templateRecord({ createdByUserId: "someone-else", visibility: "public" }));
    const r = await updateAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, templateId: "tpl-1", name: "hijack" });
    expect(r).toEqual({ ok: false, reason: "forbidden_not_creator" });
    expect(repo.updateTemplateMetadataServiceRole).not.toHaveBeenCalled();
  });

  it("creator updates name/description", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(templateRecord());
    repo.updateTemplateMetadataServiceRole.mockResolvedValue(templateRecord({ name: "New" }));
    const r = await updateAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, templateId: "tpl-1", name: "New" });
    expect(r.ok).toBe(true);
    expect(repo.updateTemplateMetadataServiceRole).toHaveBeenCalledWith(ACCOUNT, "tpl-1", expect.objectContaining({ name: "New" }));
  });

  it("publish (private → public) stamps published_at + snapshot, clears unpublished_at", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(templateRecord({ visibility: "private", publishedAt: null, creatorDisplayNameSnapshot: null }));
    repo.updateTemplateMetadataServiceRole.mockResolvedValue(templateRecord({ visibility: "public" }));
    await updateAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, templateId: "tpl-1", visibility: "public", now: () => "2026-06-07T12:00:00Z" });
    const patch = repo.updateTemplateMetadataServiceRole.mock.calls[0]![2];
    expect(patch).toMatchObject({ visibility: "public", publishedAt: "2026-06-07T12:00:00Z", unpublishedAt: null, creatorDisplayNameSnapshot: "Jane Doe" });
  });

  it("unpublish (public → private) stamps unpublished_at", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(templateRecord({ visibility: "public", publishedAt: "2026-06-01T00:00:00Z" }));
    repo.updateTemplateMetadataServiceRole.mockResolvedValue(templateRecord({ visibility: "private" }));
    await updateAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, templateId: "tpl-1", visibility: "private", now: () => "2026-06-07T12:00:00Z" });
    const patch = repo.updateTemplateMetadataServiceRole.mock.calls[0]![2];
    expect(patch).toMatchObject({ visibility: "private", unpublishedAt: "2026-06-07T12:00:00Z" });
  });
});

describe("deleteAccountTemplate — creator OR account owner", () => {
  it("missing → not_found", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(null);
    expect(await deleteAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, actorRole: "admin", templateId: "tpl-x" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("non-creator admin cannot delete someone else's template", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(templateRecord({ createdByUserId: "other" }));
    const r = await deleteAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, actorRole: "admin", templateId: "tpl-1" });
    expect(r).toEqual({ ok: false, reason: "forbidden_not_creator" });
    expect(repo.deleteTemplateServiceRole).not.toHaveBeenCalled();
  });

  it("creator can delete their own", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(templateRecord({ createdByUserId: ACTOR }));
    expect(await deleteAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, actorRole: "admin", templateId: "tpl-1" })).toEqual({ ok: true });
    expect(repo.deleteTemplateServiceRole).toHaveBeenCalledWith(ACCOUNT, "tpl-1");
  });

  it("account OWNER can delete another member's template (moderation)", async () => {
    repo.getTemplateByIdServiceRole.mockResolvedValue(templateRecord({ createdByUserId: "other" }));
    expect(await deleteAccountTemplate({ accountId: ACCOUNT, actorUserId: ACTOR, actorRole: "owner", templateId: "tpl-1" })).toEqual({ ok: true });
  });
});
