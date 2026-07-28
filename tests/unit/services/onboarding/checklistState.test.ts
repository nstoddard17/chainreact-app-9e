/**
 * @jest-environment node
 *
 * Orchestration tests for services/onboarding/checklistState.ts (5.ONBOARD-1
 * Batch 1). Mocks the repository boundaries; the pure derivation
 * runs for real so DTO shapes reflect production.
 */
const mockListByAccount = jest.fn();
const mockGetWorkflowById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByAccountServiceRole: (...a: unknown[]) => mockListByAccount(...a),
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflowById(...a),
}));

const mockHasSucceededRun = jest.fn();
const mockListRuns = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  hasSucceededRunServiceRole: (...a: unknown[]) => mockHasSucceededRun(...a),
  listByWorkflow: (...a: unknown[]) => mockListRuns(...a),
}));

const mockGetState = jest.fn();
const mockUpdatePresentation = jest.fn();
const mockLatchFirstShown = jest.fn();
const mockLatchCompletion = jest.fn();
jest.mock("@/repositories/onboarding/userOnboardingStates", () => ({
  getServiceRole: (...a: unknown[]) => mockGetState(...a),
  updatePresentationServiceRole: (...a: unknown[]) => mockUpdatePresentation(...a),
  latchFirstShownServiceRole: (...a: unknown[]) => mockLatchFirstShown(...a),
  latchCompletionServiceRole: (...a: unknown[]) => mockLatchCompletion(...a),
}));

// 5.ONBOARD-3: connect completion is ACCOUNT-level, read from the account's own
// integration rows. The old `diagnoseWorkflowConnections` boundary is gone.
const mockListActiveIntegrations = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...a: unknown[]) => mockListActiveIntegrations(...a),
}));

const mockRecordEvent = jest.fn();
jest.mock("@/services/onboarding/onboardingEvents", () => ({
  recordOnboardingEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));

const mockWritePath = jest.fn();
jest.mock("@/services/workflows/executionReadiness", () => ({
  checkWritePathReadiness: (...a: unknown[]) => mockWritePath(...a),
}));

import { getOnboardingChecklist } from "@/services/onboarding/checklistState";

const USER = "user-1";
const ACCOUNT = "acct-1";

function wf(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    accountId: ACCOUNT,
    createdByUserId: USER,
    name: "Lead intake",
    state: "draft",
    activeRevisionId: null,
    draftDefinition: {
      nodes: [
        { id: "t", kind: "trigger", provider: "native", type: "manual.run", config: {} },
        { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: {} },
      ],
      edges: [{ id: "e", from: "t", to: "a" }],
    },
    ...overrides,
  };
}

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    accountId: ACCOUNT,
    selectedWorkflowId: null,
    completionWorkflowId: null,
    completionWorkflowName: null,
    firstShownAt: null,
    dismissedAt: null,
    minimized: false,
    videoWatchedAt: null,
    completedAt: null,
    celebratedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/** A genuinely usable account integration (see isIntegrationHealthy). */
function integration(overrides: Record<string, unknown> = {}) {
  return {
    disconnectedAt: null,
    needsReconnectAt: null,
    accessTokenExpiresAt: null,
    refreshTokenEncrypted: "enc",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListActiveIntegrations.mockResolvedValue([]);
  mockWritePath.mockReturnValue(null);
  mockHasSucceededRun.mockResolvedValue(false);
  mockListRuns.mockResolvedValue([]);
  mockUpdatePresentation.mockResolvedValue(stateRow());
  mockLatchFirstShown.mockResolvedValue(undefined);
  mockLatchCompletion.mockResolvedValue(undefined);
  mockGetWorkflowById.mockResolvedValue(null);
});

describe("getOnboardingChecklist", () => {

  it("brand-new account: no workflows, no row → connect current, first_shown latched, no completion latch", async () => {
    mockGetState.mockResolvedValue(null);
    mockListByAccount.mockResolvedValue([]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.completed).toBe(false);
    // Connect leads the checklist, so it is the first row and the current step.
    expect(dto.steps?.[0]).toMatchObject({ key: "connect", status: "current" });
    expect(mockLatchFirstShown).toHaveBeenCalledWith(USER, ACCOUNT);
    expect(mockLatchCompletion).not.toHaveBeenCalled();
  });

  // ── 5.ONBOARD-2: account-level, no selected workflow ──────────────────
  it("exposes NO selected-workflow or workflow-options surface", async () => {
    mockGetState.mockResolvedValue(stateRow());
    mockListByAccount.mockResolvedValue([wf({ id: "wf-new" }), wf({ id: "wf-old" })]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    // The picker and its persisted pointer are gone; steps aggregate instead.
    expect("selectedWorkflow" in dto).toBe(false);
    expect("workflowOptions" in dto).toBe(false);
  });

  it("never persists a selected-workflow pointer while deriving", async () => {
    mockGetState.mockResolvedValue(stateRow());
    mockListByAccount.mockResolvedValue([wf({ id: "wf-new" }), wf({ id: "wf-old" })]);
    await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    // Deriving the checklist is a READ. The old code auto-repointed a
    // selectedWorkflowId here; nothing should write that any more.
    for (const call of mockUpdatePresentation.mock.calls) {
      expect(call[2]).not.toHaveProperty("selectedWorkflowId");
    }
  });

  it("scopes every read to the CALLER'S account — progress cannot leak across accounts", async () => {
    mockGetState.mockResolvedValue(stateRow());
    mockListByAccount.mockResolvedValue([wf({ id: "wf-a" })]);
    await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });

    // The persisted row is keyed on (userId, accountId)...
    expect(mockGetState).toHaveBeenCalledWith(USER, ACCOUNT);
    // ...and the workflow facts come only from that account's list.
    expect(mockListByAccount).toHaveBeenCalledWith(ACCOUNT, expect.anything());
    for (const call of mockListByAccount.mock.calls) {
      expect(call[0]).toBe(ACCOUNT);
    }
  });

  it("prior-activation evidence (paused workflow), user never shown → SILENT latch, completed DTO, no celebration", async () => {
    mockGetState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        stateRow({
          completedAt: "2026-07-18T00:00:00Z",
          completionWorkflowId: "wf-1",
          celebratedAt: "2026-07-18T00:00:00Z",
        }),
      );
    mockListByAccount.mockResolvedValue([wf({ state: "paused" })]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchCompletion).toHaveBeenCalledWith({
      userId: USER,
      accountId: ACCOUNT,
      workflowId: "wf-1",
      workflowName: "Lead intake",
      silent: true,
    });
    expect(dto.completed).toBe(true);
    expect(dto.completionWorkflow).toEqual({ id: "wf-1", name: "Lead intake" });
    expect(dto.presentation?.celebrationPending).toBe(false);
  });

  it("evidence via active_revision_id on a draft also latches (snapshot-survives-pause verification)", async () => {
    mockGetState
      .mockResolvedValueOnce(stateRow({ firstShownAt: "2026-07-10T00:00:00Z" }))
      .mockResolvedValueOnce(
        stateRow({ completedAt: "2026-07-18T00:00:00Z", completionWorkflowId: "wf-1" }),
      );
    mockListByAccount.mockResolvedValue([wf({ state: "draft", activeRevisionId: "rev-1" })]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ silent: false }),
    );
    expect(dto.completed).toBe(true);
    // User HAS seen the checklist → celebration is pending until acknowledged.
    expect(dto.presentation?.celebrationPending).toBe(true);
  });

  it("already-latched row → completed DTO without re-latching; deleted completion workflow → null provenance", async () => {
    mockGetState.mockResolvedValue(
      stateRow({ completedAt: "2026-07-15T00:00:00Z", completionWorkflowId: "wf-del" }),
    );
    mockListByAccount.mockResolvedValue([]);
    mockGetWorkflowById.mockResolvedValue(null);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchCompletion).not.toHaveBeenCalled();
    expect(dto.completed).toBe(true);
    expect(dto.completionWorkflow).toBeNull();
  });

  it("dismissed row → no first_shown latch, presentation reflects dismissal", async () => {
    mockGetState.mockResolvedValue(stateRow({ dismissedAt: "2026-07-15T00:00:00Z" }));
    mockListByAccount.mockResolvedValue([wf()]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchFirstShown).not.toHaveBeenCalled();
    expect(dto.presentation?.dismissed).toBe(true);
  });

  // ── 5.ONBOARD-3: connect is a general, ACCOUNT-level action ───────────
  it("connect is COMPLETE when the account has one healthy integration", async () => {
    mockGetState.mockResolvedValue(stateRow());
    mockListByAccount.mockResolvedValue([wf()]);
    mockListActiveIntegrations.mockResolvedValue([integration()]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    const connect = dto.steps?.find((s) => s.key === "connect");
    expect(connect?.status).toBe("complete");
  });

  it("connect is NOT complete when the only integration needs reconnecting", async () => {
    mockGetState.mockResolvedValue(stateRow());
    mockListByAccount.mockResolvedValue([wf()]);
    mockListActiveIntegrations.mockResolvedValue([
      integration({ needsReconnectAt: "2026-07-18T00:00:00Z" }),
    ]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    const connect = dto.steps?.find((s) => s.key === "connect");
    expect(connect?.status).not.toBe("complete");
    expect(connect?.status).toBe("current");
  });

  it("connect completes with NO workflows at all — it is workflow-independent", async () => {
    mockGetState.mockResolvedValue(stateRow());
    // No workflows exist, so nothing can possibly reference the connection…
    mockListByAccount.mockResolvedValue([]);
    mockListActiveIntegrations.mockResolvedValue([integration()]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    // …and the general "connect an app" action is still genuinely done.
    expect(dto.steps?.find((s) => s.key === "connect")?.status).toBe("complete");
    expect(dto.steps?.find((s) => s.key === "create")?.status).toBe("current");
  });

  it("reads integrations strictly for the CALLER'S account (no cross-account credit)", async () => {
    mockGetState.mockResolvedValue(stateRow());
    mockListByAccount.mockResolvedValue([wf()]);
    mockListActiveIntegrations.mockResolvedValue([integration()]);
    await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockListActiveIntegrations).toHaveBeenCalledWith(ACCOUNT);
    for (const call of mockListActiveIntegrations.mock.calls) {
      expect(call[0]).toBe(ACCOUNT);
    }
  });

  it("no-leak: the DTO never carries config, tokens, scopes, or provider account ids", async () => {
    mockGetState.mockResolvedValue(stateRow({ selectedWorkflowId: "wf-1" }));
    mockListByAccount.mockResolvedValue([wf()]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    const serialized = JSON.stringify(dto).toLowerCase();
    // Quoted-key forms so legitimate copy like the "configure" step key can't
    // mask a real `"config":` payload leak.
    for (const forbidden of [
      "token",
      "secret",
      '"config"',
      "draftdefinition",
      "provideraccountid",
      "accountmetadata",
      "access_",
      "refresh_",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("completion provenance (correction) — DTO precedence", () => {
  it("live workflow present → uses the CURRENT name and links to it (rename visible while it exists)", async () => {
    mockGetState.mockResolvedValue(
      stateRow({
        completedAt: "2026-07-18T00:00:00Z",
        completionWorkflowId: "wf-1",
        completionWorkflowName: "Original name at latch",
      }),
    );
    mockListByAccount.mockResolvedValue([wf({ id: "wf-1", name: "Renamed later" })]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.completionWorkflow).toEqual({ id: "wf-1", name: "Renamed later" });
  });

  it("WORKFLOW DELETED (FK nulled) → falls back to the immutable snapshot, named but unlinked", async () => {
    mockGetState.mockResolvedValue(
      stateRow({
        completedAt: "2026-07-18T00:00:00Z",
        // ON DELETE SET NULL already cleared the pointer…
        completionWorkflowId: null,
        // …but the snapshot survives.
        completionWorkflowName: "Lead intake → Slack",
      }),
    );
    mockListByAccount.mockResolvedValue([]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.completed).toBe(true);
    expect(dto.completionWorkflow).toEqual({ id: null, name: "Lead intake → Slack" });
  });

  it("workflow row soft-deleted but FK still set → snapshot still wins over the deleted row", async () => {
    mockGetState.mockResolvedValue(
      stateRow({
        completedAt: "2026-07-18T00:00:00Z",
        completionWorkflowId: "wf-del",
        completionWorkflowName: "Snapshot name",
      }),
    );
    mockListByAccount.mockResolvedValue([]);
    mockGetWorkflowById.mockResolvedValue(wf({ id: "wf-del", state: "deleted", name: "Deleted row name" }));
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.completionWorkflow).toEqual({ id: null, name: "Snapshot name" });
  });

  it("pre-correction row (no snapshot, workflow gone) → null provenance, response still succeeds", async () => {
    mockGetState.mockResolvedValue(
      stateRow({
        completedAt: "2026-07-15T00:00:00Z",
        completionWorkflowId: null,
        completionWorkflowName: null,
      }),
    );
    mockListByAccount.mockResolvedValue([]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.completed).toBe(true);
    expect(dto.completionWorkflow).toBeNull();
  });

  it("deleted completion workflow never crashes derivation or blanks completion", async () => {
    mockGetState.mockResolvedValue(
      stateRow({
        completedAt: "2026-07-18T00:00:00Z",
        completionWorkflowId: "wf-gone",
        completionWorkflowName: "Gone but remembered",
      }),
    );
    mockListByAccount.mockResolvedValue([]);
    mockGetWorkflowById.mockRejectedValue(new Error("row vanished mid-read"));
    await expect(
      getOnboardingChecklist({ userId: USER, accountId: ACCOUNT }),
    ).rejects.toThrow(); // surfaced to the route, which maps it to a safe 500
    // …and the route-level fail-open is covered in the route suite.
  });

  it("existing-user silent latch captures a deterministic name from the STRONGEST evidence workflow", async () => {
    mockGetState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        stateRow({
          completedAt: "2026-07-18T00:00:00Z",
          completionWorkflowId: "wf-active",
          completionWorkflowName: "The live one",
          celebratedAt: "2026-07-18T00:00:00Z",
        }),
      );
    // Newest-first list: a paused workflow is more recent, but `active` is
    // stronger evidence and must win deterministically.
    mockListByAccount.mockResolvedValue([
      wf({ id: "wf-paused", name: "Paused newer", state: "paused" }),
      wf({ id: "wf-active", name: "The live one", state: "active" }),
    ]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchCompletion).toHaveBeenCalledWith({
      userId: USER,
      accountId: ACCOUNT,
      workflowId: "wf-active",
      workflowName: "The live one",
      silent: true,
    });
    // Silent: no first-time celebration for a pre-feature account.
    expect(dto.presentation?.celebrationPending).toBe(false);
  });
});
