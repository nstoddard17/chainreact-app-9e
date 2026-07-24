/**
 * @jest-environment node
 *
 * Tests for services/triggers/preconditions.ts.
 *
 * Verifies the locked rules from workflow-lifecycle.md:
 *   - activate / resume require all referenced providers to have an active
 *     integration row.
 *   - pause / disable / etc. skip the precondition gate (return ok).
 *   - Empty workflow rejects with EMPTY_WORKFLOW.
 */
const mockListActiveByUser = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...args: unknown[]) => mockListActiveByUser(...args),
}));

import { checkActivationPreconditions } from "@/services/triggers/preconditions";
import type { WorkflowRecord } from "@/repositories/workflows";

function makeWorkflow(
  nodes: WorkflowRecord["draftDefinition"]["nodes"],
): WorkflowRecord {
  return {
    id: "wf-1",
    createdByUserId: "user-1",
    accountId: "acct-user-1",
    name: "Test",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: { nodes, edges: [] },
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-05-07T00:00:00Z",
    updatedAt: "2026-05-07T00:00:00Z",
  };
}

const slackTrigger = {
  id: "n1",
  kind: "trigger" as const,
  provider: "slack",
  type: "message_received",
  config: {},
  position: { x: 0, y: 0 },
};

const gmailAction = {
  id: "n2",
  kind: "action" as const,
  provider: "gmail",
  type: "send_email",
  config: {},
  position: { x: 0, y: 100 },
};

beforeEach(() => {
  mockListActiveByUser.mockReset();
});

describe("checkActivationPreconditions — non-activate transitions skip the gate", () => {
  it.each(["pause", "disable", "delete", "markEligibleToResume"] as const)(
    "%s returns ok without querying integrations",
    async (transition) => {
      const result = await checkActivationPreconditions(
        makeWorkflow([slackTrigger]),
        transition,
      );
      expect(result).toEqual({ ok: true });
      expect(mockListActiveByUser).not.toHaveBeenCalled();
    },
  );
});

describe("checkActivationPreconditions — activate", () => {
  it("rejects EMPTY_WORKFLOW when no nodes exist", async () => {
    const result = await checkActivationPreconditions(makeWorkflow([]), "activate");
    expect(result.ok).toBe(false);
    expect(result.failures?.[0]?.code).toBe("EMPTY_WORKFLOW");
    expect(mockListActiveByUser).not.toHaveBeenCalled();
  });

  it("returns ok when all required providers have an active integration", async () => {
    mockListActiveByUser.mockResolvedValueOnce([
      { provider: "slack" },
      { provider: "gmail" },
    ]);
    const result = await checkActivationPreconditions(
      makeWorkflow([slackTrigger, gmailAction]),
      "activate",
    );
    expect(result.ok).toBe(true);
    expect(mockListActiveByUser).toHaveBeenCalledWith("acct-user-1");
  });

  it("rejects with INTEGRATION_NOT_CONNECTED for each missing provider", async () => {
    mockListActiveByUser.mockResolvedValueOnce([{ provider: "slack" }]);
    const result = await checkActivationPreconditions(
      makeWorkflow([slackTrigger, gmailAction]),
      "activate",
    );
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures?.[0]).toMatchObject({
      code: "INTEGRATION_NOT_CONNECTED",
      message: expect.stringContaining("gmail"),
    });
  });

  it("dedupes by provider when the workflow uses two nodes from the same provider", async () => {
    const twoSlack = makeWorkflow([
      slackTrigger,
      {
        id: "n3",
        kind: "action" as const,
        provider: "slack",
        type: "send_channel_message",
        config: {},
        position: { x: 0, y: 100 },
      },
    ]);
    mockListActiveByUser.mockResolvedValueOnce([]);
    const result = await checkActivationPreconditions(twoSlack, "activate");
    expect(result.failures).toHaveLength(1);
    expect(result.failures?.[0]?.message).toMatch(/slack/);
  });
});

describe("checkActivationPreconditions — native pseudo-provider", () => {
  // Native nodes (http_request / format_transformer / delay — Native Slice 1
  // Tier A) have providerId "native" but no `integrations` row / no OAuth.
  // The activation gate skips them so workflows using native nodes can be
  // activated. See docs/slices/parity/native-nodes-1-tier-a-plan.md §7.

  const nativeAction = {
    id: "native-1",
    kind: "action" as const,
    provider: "native",
    type: "delay",
    config: { seconds: 5 },
    position: { x: 0, y: 100 },
  };

  it("activates a workflow whose only action is a native node, with the OAuth provider present for the trigger", async () => {
    mockListActiveByUser.mockResolvedValueOnce([{ provider: "slack" }]);
    const result = await checkActivationPreconditions(
      makeWorkflow([slackTrigger, nativeAction]),
      "activate",
    );
    expect(result.ok).toBe(true);
    expect(mockListActiveByUser).toHaveBeenCalledTimes(1);
  });

  it("does NOT add an INTEGRATION_NOT_CONNECTED failure for the native provider", async () => {
    mockListActiveByUser.mockResolvedValueOnce([]);
    const result = await checkActivationPreconditions(
      makeWorkflow([slackTrigger, nativeAction]),
      "activate",
    );
    expect(result.ok).toBe(false);
    // Exactly one failure (for slack) — none for native.
    expect(result.failures).toHaveLength(1);
    expect(result.failures?.[0]?.message).toMatch(/slack/);
    expect(result.failures?.[0]?.message).not.toMatch(/native/);
  });

  it("skips integrations lookup entirely when every node is native", async () => {
    const allNative = makeWorkflow([
      { ...nativeAction, id: "n1", type: "http_request" },
      { ...nativeAction, id: "n2", type: "format_transformer" },
      { ...nativeAction, id: "n3", type: "delay" },
    ]);
    const result = await checkActivationPreconditions(allNative, "activate");
    expect(result).toEqual({ ok: true });
    expect(mockListActiveByUser).not.toHaveBeenCalled();
  });

  // AI-PROVIDER-ROLLOUT-1 — the live-activation regression, pinned at the
  // consumer: the first production AI workflow could not be activated
  // ("Connect ai before activating this workflow.") because this gate's
  // provider skip-list predated the connectionless `ai` provider.
  it("activates a manual-trigger + AI-action workflow with NO integrations connected", async () => {
    const aiWorkflow = makeWorkflow([
      { ...nativeAction, id: "t1", kind: "trigger" as const, type: "manual.run", config: {} },
      {
        id: "ai-1",
        kind: "action" as const,
        provider: "ai",
        type: "analyze_document",
        config: { file: "text", mode: "summarize" },
        position: { x: 0, y: 100 },
      },
    ]);
    const result = await checkActivationPreconditions(aiWorkflow, "activate");
    expect(result).toEqual({ ok: true });
    expect(mockListActiveByUser).not.toHaveBeenCalled();
  });
});

describe("checkActivationPreconditions — resume", () => {
  it("re-runs the same gate for resume (rule §eligible_to_resume must re-check)", async () => {
    mockListActiveByUser.mockResolvedValueOnce([]);
    const result = await checkActivationPreconditions(
      makeWorkflow([slackTrigger]),
      "resume",
    );
    expect(result.ok).toBe(false);
    expect(result.failures?.[0]?.code).toBe("INTEGRATION_NOT_CONNECTED");
  });
});
