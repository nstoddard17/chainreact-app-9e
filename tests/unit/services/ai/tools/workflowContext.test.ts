/**
 * @jest-environment node
 *
 * Tests for services/ai/tools/workflowContext.ts (Slice 4.AI-2).
 *
 * Mocks the workflows + integrations repos; uses the REAL discovery registry
 * and the REAL activation-precondition + structural-schema validators.
 */
const mockGetById = jest.fn();
const mockListActiveByUser = jest.fn();
const mockIsMember = jest.fn();

jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...args: unknown[]) => mockListActiveByUser(...args),
}));
// 4.ACCOUNT-MODEL-22D-3: loadOwned now authorizes by ACCOUNT MEMBERSHIP (so
// team workflows are addressable). Default: anyone except "intruder" is a
// member; availability tests override per-case.
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

import {
  getWorkflowGraphForAI,
  getWorkflowSummaryForAI,
  getWorkflowValidationStateForAI,
  getWorkflowIntegrationAvailabilityForAI,
} from "@/services/ai/tools/workflowContext";
import { REDACTED } from "@/services/ai/tools/redact";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const triggerMeta = listAllTriggerMetas()[0]!;
const actionMeta = listAllActionMetas()[0]!;

function makeRecord(
  draftDefinition: WorkflowDefinition,
  overrides: Partial<WorkflowRecord> = {},
): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-owner-1",
    createdByUserId: "owner-1",
    name: "My Workflow",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition,
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-05-25T00:00:00Z",
    updatedAt: "2026-05-25T01:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetById.mockReset();
  mockListActiveByUser.mockReset();
  mockIsMember.mockReset();
  // Membership default: every caller except "intruder" belongs to the account.
  mockIsMember.mockImplementation(async (userId: string) => userId !== "intruder");
});

describe("getWorkflowGraphForAI", () => {
  it("returns nodes/edges and redacts secret-shaped config values", async () => {
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          {
            id: "n1",
            kind: "action",
            provider: "native",
            type: "http_request",
            config: {
              channel: "general",
              apiKey: "SUPERSECRET",
              headers: { Authorization: "Bearer T", "Content-Type": "application/json" },
            },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      }),
    );
    const result = await getWorkflowGraphForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    const cfg = result.data.nodes[0]!.config as Record<string, unknown>;
    expect(cfg.channel).toBe("general");
    expect(cfg.apiKey).toBe(REDACTED);
    expect((cfg.headers as Record<string, unknown>).Authorization).toBe(REDACTED);
    expect((cfg.headers as Record<string, unknown>)["Content-Type"]).toBe("application/json");
  });

  it("returns NOT_FOUND when the caller does not own the workflow", async () => {
    mockGetById.mockResolvedValue(makeRecord({ nodes: [], edges: [] }));
    const result = await getWorkflowGraphForAI("intruder", "wf-1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when the workflow is missing", async () => {
    mockGetById.mockResolvedValue(null);
    const result = await getWorkflowGraphForAI("owner-1", "missing");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });
});

describe("getWorkflowSummaryForAI", () => {
  it("summarizes trigger, actions, providers, and unknown nodes", async () => {
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "trigger", provider: triggerMeta.provider, type: triggerMeta.type, config: {}, position: { x: 0, y: 0 } },
          { id: "n2", kind: "action", provider: actionMeta.provider, type: actionMeta.type, config: {}, position: { x: 0, y: 1 } },
          { id: "n3", kind: "action", provider: "madeup", type: "nope", config: {}, position: { x: 0, y: 2 } },
        ],
        edges: [
          { id: "e1", from: "n1", to: "n2" },
          { id: "e2", from: "n2", to: "n3" },
        ],
      }),
    );
    const result = await getWorkflowSummaryForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.nodeCount).toBe(3);
    expect(result.data.edgeCount).toBe(2);
    expect(result.data.hasTrigger).toBe(true);
    expect(result.data.trigger?.key).toBe(triggerMeta.key);
    expect(result.data.actions.some((a) => a.key === actionMeta.key)).toBe(true);
    expect(result.data.unknownNodes).toContainEqual({ nodeId: "n3", key: "madeup:nope" });
    expect(result.data.providersUsed).toEqual(
      expect.arrayContaining([triggerMeta.provider, actionMeta.provider, "madeup"]),
    );
  });

  it("flags high-risk / destructive action nodes when present", async () => {
    const risky = listAllActionMetas().find(
      (m) => m.riskLevel === "high" || m.isDestructive || m.requiresConfirmation,
    );
    if (!risky) return; // registry has no high-risk action — skip
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "action", provider: risky.provider, type: risky.type, config: {}, position: { x: 0, y: 0 } },
        ],
        edges: [],
      }),
    );
    const result = await getWorkflowSummaryForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.highRiskNodes.some((n) => n.key === risky.key)).toBe(true);
  });
});

describe("getWorkflowValidationStateForAI", () => {
  it("flags EMPTY_WORKFLOW without an integration lookup", async () => {
    mockGetById.mockResolvedValue(makeRecord({ nodes: [], edges: [] }));
    const result = await getWorkflowValidationStateForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.ok).toBe(false);
    expect(result.data.issues.some((i) => i.code === "EMPTY_WORKFLOW")).toBe(true);
    expect(mockListActiveByUser).not.toHaveBeenCalled();
    expect(result.data.coverage.checked.length).toBeGreaterThan(0);
    expect(result.data.coverage.deferredToAI3.length).toBeGreaterThan(0);
  });

  it("flags UNKNOWN_NODE_TYPE and INTEGRATION_NOT_CONNECTED", async () => {
    mockListActiveByUser.mockResolvedValue([]);
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "action", provider: "madeup", type: "nope", config: {}, position: { x: 0, y: 0 } },
        ],
        edges: [],
      }),
    );
    const result = await getWorkflowValidationStateForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    const codes = result.data.issues.map((i) => i.code);
    expect(codes).toContain("UNKNOWN_NODE_TYPE");
    expect(codes).toContain("INTEGRATION_NOT_CONNECTED");
    expect(result.data.ok).toBe(false);
  });

  it("flags MISSING_REQUIRED_FIELD when a required field is blank", async () => {
    const withRequired = listAllActionMetas().find(
      (m) => m.requiresIntegration && m.fields.some((f) => f.required),
    );
    if (!withRequired) return; // no provider action with a required field — skip
    const requiredField = withRequired.fields.find((f) => f.required)!;
    mockListActiveByUser.mockResolvedValue([{ provider: withRequired.provider }]);
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "action", provider: withRequired.provider, type: withRequired.type, config: {}, position: { x: 0, y: 0 } },
        ],
        edges: [],
      }),
    );
    const result = await getWorkflowValidationStateForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(
      result.data.issues.some(
        (i) => i.code === "MISSING_REQUIRED_FIELD" && i.field === requiredField.name,
      ),
    ).toBe(true);
  });

  it("flags a variable reference to a non-existent node but not trigger/existing nodes", async () => {
    mockListActiveByUser.mockResolvedValue([
      { provider: triggerMeta.provider },
      { provider: actionMeta.provider },
    ]);
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "trigger", provider: triggerMeta.provider, type: triggerMeta.type, config: {}, position: { x: 0, y: 0 } },
          {
            id: "n2",
            kind: "action",
            provider: actionMeta.provider,
            type: actionMeta.type,
            config: { a: "{{ghost.foo}}", b: "{{n1.bar}}", c: "{{trigger.baz}}" },
            position: { x: 0, y: 1 },
          },
        ],
        edges: [{ id: "e1", from: "n1", to: "n2" }],
      }),
    );
    const result = await getWorkflowValidationStateForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    const varIssues = result.data.issues.filter((i) => i.code === "INVALID_VARIABLE_REFERENCE");
    expect(varIssues).toHaveLength(1);
    expect(varIssues[0]!.message).toContain("ghost");
  });
});

// ─── Slice 4.ACCOUNT-MODEL-22D-3 — credential-sharing availability ───────────
describe("getWorkflowIntegrationAvailabilityForAI (22D-3)", () => {
  function wfWith(
    providers: { provider: string; type: string }[],
    overrides: Partial<WorkflowRecord> = {},
  ): WorkflowRecord {
    return makeRecord(
      {
        nodes: providers.map((p, i) => ({
          id: `n${i}`,
          kind: "action",
          provider: p.provider,
          type: p.type,
          config: {},
          position: { x: 0, y: i },
        })),
        edges: [],
      },
      overrides,
    );
  }

  it("reports account providers as connected when the account has a row (visible to a non-creator)", async () => {
    mockGetById.mockResolvedValue(wfWith([{ provider: "slack", type: "send" }]));
    mockListActiveByUser.mockResolvedValue([
      { provider: "slack", connectedByUserId: "someone-else" },
    ]);
    const result = await getWorkflowIntegrationAvailabilityForAI("editor-2", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.providers).toEqual([
      { provider: "slack", sharing: "account", connected: true },
    ]);
  });

  it("reports the creator's personal provider as connected — full state to the creator", async () => {
    mockGetById.mockResolvedValue(wfWith([{ provider: "gmail", type: "send" }]));
    mockListActiveByUser.mockResolvedValue([
      { provider: "gmail", connectedByUserId: "owner-1" },
    ]);
    const result = await getWorkflowIntegrationAvailabilityForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: true },
    ]);
  });

  it("reports the creator's personal provider as ownerControlled for a non-creator (no labels)", async () => {
    mockGetById.mockResolvedValue(wfWith([{ provider: "gmail", type: "send" }]));
    mockListActiveByUser.mockResolvedValue([
      { provider: "gmail", connectedByUserId: "owner-1", displayName: "owner@example.com" },
    ]);
    const result = await getWorkflowIntegrationAvailabilityForAI("editor-2", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: true, ownerControlled: true },
    ]);
    expect(JSON.stringify(result.data)).not.toContain("owner@example.com");
  });

  it("does NOT count a co-member's personal credential — reports ownerMustConnect (no leak)", async () => {
    mockGetById.mockResolvedValue(wfWith([{ provider: "gmail", type: "send" }]));
    mockListActiveByUser.mockResolvedValue([
      { provider: "gmail", connectedByUserId: "other-member", displayName: "other@example.com" },
    ]);
    // Even the creator viewing — a co-member's personal credential is never used.
    const result = await getWorkflowIntegrationAvailabilityForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: false, ownerMustConnect: true },
    ]);
    expect(JSON.stringify(result.data)).not.toContain("other@example.com");
  });

  it("reports ownerMustConnect when the creator has no personal credential at all", async () => {
    mockGetById.mockResolvedValue(wfWith([{ provider: "gmail", type: "send" }]));
    mockListActiveByUser.mockResolvedValue([]);
    const result = await getWorkflowIntegrationAvailabilityForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: false, ownerMustConnect: true },
    ]);
  });

  it("is addressable by a member of a TEAM workflow account, NOT_FOUND for a non-member", async () => {
    mockGetById.mockResolvedValue(
      wfWith([{ provider: "slack", type: "send" }], {
        accountId: "acct-team",
        createdByUserId: "owner-1",
      }),
    );
    mockListActiveByUser.mockResolvedValue([
      { provider: "slack", connectedByUserId: "owner-1" },
    ]);

    mockIsMember.mockResolvedValueOnce(true);
    const ok = await getWorkflowIntegrationAvailabilityForAI("editor-2", "wf-1");
    expect(ok.ok).toBe(true);

    mockIsMember.mockResolvedValueOnce(false);
    const notFound = await getWorkflowIntegrationAvailabilityForAI("stranger", "wf-1");
    expect(notFound.ok).toBe(false);
    if (notFound.ok) return;
    expect(notFound.code).toBe("NOT_FOUND");
  });

  it("returns an empty provider list when every node is native (no integration required)", async () => {
    mockGetById.mockResolvedValue(wfWith([{ provider: "native", type: "http_request" }]));
    const result = await getWorkflowIntegrationAvailabilityForAI("owner-1", "wf-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.providers).toEqual([]);
    expect(mockListActiveByUser).not.toHaveBeenCalled();
  });
});
