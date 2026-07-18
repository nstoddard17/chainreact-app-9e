/**
 * @jest-environment node
 *
 * Orchestration tests for services/onboarding/checklistState.ts (5.ONBOARD-1
 * Batch 1). Mocks the repository + diagnosis boundaries; the pure derivation
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

const mockDiagnose = jest.fn();
jest.mock("@/services/diagnostics/integrationConnection", () => ({
  diagnoseWorkflowConnections: (...a: unknown[]) => mockDiagnose(...a),
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

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ENABLE_ONBOARDING_CHECKLIST = "true";
  mockDiagnose.mockResolvedValue({
    workflowId: "wf-1",
    access: "OK",
    allRequiredConnected: true,
    providers: [],
  });
  mockWritePath.mockReturnValue(null);
  mockHasSucceededRun.mockResolvedValue(false);
  mockListRuns.mockResolvedValue([]);
  mockUpdatePresentation.mockResolvedValue(stateRow());
  mockLatchFirstShown.mockResolvedValue(undefined);
  mockLatchCompletion.mockResolvedValue(undefined);
  mockGetWorkflowById.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.ENABLE_ONBOARDING_CHECKLIST;
});

describe("getOnboardingChecklist", () => {
  it("flag off → {enabled:false} and touches nothing", async () => {
    delete process.env.ENABLE_ONBOARDING_CHECKLIST;
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto).toEqual({ enabled: false });
    expect(mockListByAccount).not.toHaveBeenCalled();
    expect(mockGetState).not.toHaveBeenCalled();
  });

  it("brand-new account: no workflows, no row → create current, first_shown latched, no completion latch", async () => {
    mockGetState.mockResolvedValue(null);
    mockListByAccount.mockResolvedValue([]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.enabled).toBe(true);
    expect(dto.completed).toBe(false);
    expect(dto.selectedWorkflow).toBeNull();
    expect(dto.steps?.[0]).toMatchObject({ key: "create", status: "current" });
    expect(mockLatchFirstShown).toHaveBeenCalledWith(USER, ACCOUNT);
    expect(mockLatchCompletion).not.toHaveBeenCalled();
  });

  it("draft-only account: selects the newest workflow and persists the repoint", async () => {
    mockGetState.mockResolvedValue(stateRow());
    mockListByAccount.mockResolvedValue([wf({ id: "wf-new" }), wf({ id: "wf-old" })]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.selectedWorkflow?.id).toBe("wf-new");
    expect(mockUpdatePresentation).toHaveBeenCalledWith(USER, ACCOUNT, {
      selectedWorkflowId: "wf-new",
    });
  });

  it("valid persisted selection wins over the newest workflow and is not re-persisted", async () => {
    mockGetState.mockResolvedValue(stateRow({ selectedWorkflowId: "wf-old" }));
    mockListByAccount.mockResolvedValue([wf({ id: "wf-new" }), wf({ id: "wf-old" })]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.selectedWorkflow?.id).toBe("wf-old");
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("deleted selected workflow: auto-repoints to the newest remaining workflow", async () => {
    mockGetState.mockResolvedValue(stateRow({ selectedWorkflowId: "wf-gone" }));
    mockListByAccount.mockResolvedValue([wf({ id: "wf-new" })]);
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto.selectedWorkflow?.id).toBe("wf-new");
    expect(mockUpdatePresentation).toHaveBeenCalledWith(USER, ACCOUNT, {
      selectedWorkflowId: "wf-new",
    });
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

  it("connection diagnosis feeds the connect step; unhealthy provider keeps it incomplete", async () => {
    mockGetState.mockResolvedValue(stateRow({ selectedWorkflowId: "wf-1" }));
    mockListByAccount.mockResolvedValue([wf()]);
    mockDiagnose.mockResolvedValue({
      workflowId: "wf-1",
      access: "OK",
      allRequiredConnected: false,
      providers: [
        {
          provider: "slack",
          name: "Slack",
          credentialClass: "account",
          nodeIds: ["a"],
          nodeCount: 1,
          status: "DISCONNECTED",
          ready: false,
          providerEnabled: true,
          refreshable: true,
          tokenExpired: null,
          scopesSatisfied: true,
          missingScopeCount: 0,
          reconnectNeeded: false,
          canReconnect: true,
        },
      ],
    });
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    const connect = dto.steps?.find((s) => s.key === "connect");
    expect(connect?.status).toBe("current");
    expect(connect?.providers?.[0]).toMatchObject({
      provider: "slack",
      ready: false,
      canConnect: true,
      adminRequired: false,
    });
    expect(mockDiagnose).toHaveBeenCalledWith({
      subjectUserId: USER,
      workflowId: "wf-1",
    });
  });

  it("account-class provider a member cannot connect → adminRequired entry + blocked step", async () => {
    mockGetState.mockResolvedValue(stateRow({ selectedWorkflowId: "wf-1" }));
    mockListByAccount.mockResolvedValue([wf()]);
    mockDiagnose.mockResolvedValue({
      workflowId: "wf-1",
      access: "OK",
      allRequiredConnected: false,
      providers: [
        {
          provider: "stripe",
          name: "Stripe",
          credentialClass: "account",
          nodeIds: ["a"],
          nodeCount: 1,
          status: "DISCONNECTED",
          ready: false,
          providerEnabled: true,
          refreshable: true,
          tokenExpired: null,
          scopesSatisfied: true,
          missingScopeCount: 0,
          reconnectNeeded: false,
          canReconnect: false,
        },
      ],
    });
    const dto = await getOnboardingChecklist({ userId: USER, accountId: ACCOUNT });
    const connect = dto.steps?.find((s) => s.key === "connect");
    expect(connect?.status).toBe("blocked");
    expect(connect?.blockedReason).toBe("admin_required");
    expect(connect?.providers?.[0]?.adminRequired).toBe(true);
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
