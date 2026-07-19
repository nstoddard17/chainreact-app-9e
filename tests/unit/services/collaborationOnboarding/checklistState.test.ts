/**
 * @jest-environment node
 *
 * Orchestration tests for services/collaborationOnboarding/checklistState.ts
 * (5.ONBOARD-4). Mocks the repository boundaries; the pure derivation runs for
 * real so DTO shapes reflect production.
 *
 * Covers required proofs: 1 (account creators get the owner checklist), 2
 * (invited members get the member checklist), 6 (role-specific progress is
 * isolated), 7 (account switching selects the correct checklist), 8 (role
 * changes select the correct track), 10 (existing owner accounts silently derive
 * real setup progress), 11 (member learning steps require real usage evidence),
 * 12 (personal accounts get nothing), 13 (authoritative plan data).
 */
const mockGetRole = jest.fn();
const mockCountMembers = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
  countMembersServiceRole: (...a: unknown[]) => mockCountMembers(...a),
}));

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockGetPlan = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getPlan: (...a: unknown[]) => mockGetPlan(...a),
}));

const mockCountPendingInvites = jest.fn();
jest.mock("@/repositories/accountInvitations", () => ({
  countPendingForAccountServiceRole: (...a: unknown[]) => mockCountPendingInvites(...a),
}));

const mockListIntegrations = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...a: unknown[]) => mockListIntegrations(...a),
}));

const mockListWorkflows = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByAccountServiceRole: (...a: unknown[]) => mockListWorkflows(...a),
}));

const mockHasRunByUser = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  hasSucceededRunByUserInAccountServiceRole: (...a: unknown[]) =>
    mockHasRunByUser(...a),
}));

const mockFindRecordedTypes = jest.fn();
jest.mock("@/repositories/onboarding/onboardingEvents", () => ({
  findRecordedTypesServiceRole: (...a: unknown[]) => mockFindRecordedTypes(...a),
}));

const mockGetCollabState = jest.fn();
const mockLatchFirstShown = jest.fn();
const mockLatchCompletion = jest.fn();
jest.mock("@/repositories/onboarding/collaborationOnboardingStates", () => ({
  getServiceRole: (...a: unknown[]) => mockGetCollabState(...a),
  latchFirstShownServiceRole: (...a: unknown[]) => mockLatchFirstShown(...a),
  latchCompletionServiceRole: (...a: unknown[]) => mockLatchCompletion(...a),
}));

const mockRecordEvent = jest.fn();
jest.mock("@/services/onboarding/onboardingEvents", () => ({
  recordOnboardingEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));

import { getCollaborationChecklist } from "@/services/collaborationOnboarding/checklistState";

const USER = "user-1";
const ACCOUNT = "acct-1";

/** Account fully set up: 2 members, a healthy shared app, a workflow. */
function fullySetUpAccount() {
  mockCountMembers.mockResolvedValue(2);
  mockCountPendingInvites.mockResolvedValue(0);
  mockListIntegrations.mockResolvedValue([
    { provider: "slack", disconnectedAt: null, needsReconnectAt: null },
  ]);
  mockListWorkflows.mockResolvedValue([{ id: "wf-1" }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ENABLE_COLLABORATION_ONBOARDING = "true";
  mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "team" });
  mockGetPlan.mockResolvedValue("team");
  mockGetCollabState.mockResolvedValue(null);
  mockCountMembers.mockResolvedValue(1);
  mockCountPendingInvites.mockResolvedValue(0);
  mockListIntegrations.mockResolvedValue([]);
  mockListWorkflows.mockResolvedValue([]);
  mockHasRunByUser.mockResolvedValue(false);
  mockFindRecordedTypes.mockResolvedValue(new Set());
  mockLatchCompletion.mockResolvedValue(true);
  mockLatchFirstShown.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.ENABLE_COLLABORATION_ONBOARDING;
});

describe("role selection — proofs 1, 2, 8", () => {
  it("gives the account creator (owner) the owner checklist", async () => {
    mockGetRole.mockResolvedValue("owner");
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto?.track).toBe("team_owner");
    expect(dto?.steps.map((s) => s.key)).toEqual([
      "invite_teammate",
      "teammate_joined",
      "connect_shared_app",
      "create_shared_workflow",
    ]);
  });

  it("gives an invited user who joined the MEMBER checklist", async () => {
    mockGetRole.mockResolvedValue("member");
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto?.track).toBe("team_member");
    const keys = dto!.steps.map((s) => s.key);
    expect(keys).not.toContain("invite_teammate");
    expect(keys).not.toContain("teammate_joined");
  });

  it("gives an admin the admin checklist", async () => {
    mockGetRole.mockResolvedValue("admin");
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto?.track).toBe("team_admin");
  });

  it("reads the role from the database on EVERY call — a role change re-tracks", async () => {
    // Proof 8: same user, same account, role changed between loads.
    mockGetRole.mockResolvedValueOnce("member");
    const before = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(before?.track).toBe("team_member");

    mockGetRole.mockResolvedValueOnce("admin");
    const after = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(after?.track).toBe("team_admin");

    // The role is never taken from caller input — only (accountId, userId).
    expect(mockGetRole).toHaveBeenCalledWith(ACCOUNT, USER);
  });

  it("returns null when the user has no membership row", async () => {
    mockGetRole.mockResolvedValue(null);
    await expect(
      getCollaborationChecklist({ userId: USER, accountId: ACCOUNT }),
    ).resolves.toBeNull();
  });
});

describe("progress isolation — proofs 6, 7", () => {
  it("reads and latches state keyed by TRACK, so roles never share a record", async () => {
    mockGetRole.mockResolvedValue("member");
    await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    // Every state read is (user, account, track) — never (user, account) alone.
    expect(mockGetCollabState).toHaveBeenCalledWith(USER, ACCOUNT, "team_member");
    expect(mockGetCollabState).not.toHaveBeenCalledWith(USER, ACCOUNT, "team_owner");
  });

  it("does not let one track's completion satisfy another", async () => {
    // The owner track is already complete for this user...
    mockGetRole.mockResolvedValue("member");
    mockGetCollabState.mockImplementation(
      async (_u: string, _a: string, track: string) =>
        track === "team_owner"
          ? { completedAt: "2026-01-01T00:00:00Z", firstShownAt: null, minimized: false, dismissedAt: null, celebratedAt: null }
          : null,
    );
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    // ...but the member track is untouched and starts fresh.
    expect(dto?.track).toBe("team_member");
    expect(dto?.completed).toBe(false);
    expect(dto?.completedStepCount).toBe(0);
  });

  it("scopes every account fact to the requested account (switching re-derives)", async () => {
    mockGetRole.mockResolvedValue("owner");
    const OTHER = "acct-2";
    await getCollaborationChecklist({ userId: USER, accountId: OTHER });
    expect(mockGetRole).toHaveBeenCalledWith(OTHER, USER);
    expect(mockCountMembers).toHaveBeenCalledWith(OTHER);
    expect(mockCountPendingInvites).toHaveBeenCalledWith(OTHER);
    expect(mockListIntegrations).toHaveBeenCalledWith(OTHER);
    // No call anywhere used the previous account id.
    const allArgs = [
      ...mockCountMembers.mock.calls,
      ...mockListIntegrations.mock.calls,
      ...mockListWorkflows.mock.calls,
    ].flat();
    expect(allArgs).not.toContain(ACCOUNT);
  });

  it("selects the correct checklist per account for the SAME user", async () => {
    // Proof 7: owner of account A, member of account B.
    mockGetRole.mockImplementation(async (accountId: string) =>
      accountId === "acct-A" ? "owner" : "member",
    );
    mockGetAccount.mockResolvedValue({ id: "x", type: "team" });
    const a = await getCollaborationChecklist({ userId: USER, accountId: "acct-A" });
    const b = await getCollaborationChecklist({ userId: USER, accountId: "acct-B" });
    expect(a?.track).toBe("team_owner");
    expect(b?.track).toBe("team_member");
  });
});

describe("eligibility — proofs 12, 13", () => {
  it("returns null for a personal account", async () => {
    mockGetRole.mockResolvedValue("owner");
    mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "personal" });
    mockGetPlan.mockResolvedValue("pro");
    await expect(
      getCollaborationChecklist({ userId: USER, accountId: ACCOUNT }),
    ).resolves.toBeNull();
  });

  it("reads the plan from authoritative billing data, not the account type", async () => {
    mockGetRole.mockResolvedValue("owner");
    mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "organization" });
    mockGetPlan.mockResolvedValue("enterprise");
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockGetPlan).toHaveBeenCalledWith(ACCOUNT);
    // Enterprise reuses the team_* tracks because its steps do not differ.
    expect(dto?.track).toBe("team_owner");
  });

  it("returns null for a shared account on a non-collaboration plan", async () => {
    mockGetRole.mockResolvedValue("owner");
    mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "team" });
    mockGetPlan.mockResolvedValue("free");
    await expect(
      getCollaborationChecklist({ userId: USER, accountId: ACCOUNT }),
    ).resolves.toBeNull();
  });

  it("fails closed when the plan read throws", async () => {
    mockGetRole.mockResolvedValue("owner");
    mockGetPlan.mockRejectedValue(new Error("billing down"));
    await expect(
      getCollaborationChecklist({ userId: USER, accountId: ACCOUNT }),
    ).resolves.toBeNull();
  });

  it("returns null when the feature flag is off", async () => {
    process.env.ENABLE_COLLABORATION_ONBOARDING = "false";
    mockGetRole.mockResolvedValue("owner");
    await expect(
      getCollaborationChecklist({ userId: USER, accountId: ACCOUNT }),
    ).resolves.toBeNull();
    // Nothing was even read.
    expect(mockGetRole).not.toHaveBeenCalled();
  });
});

describe("shared-app step — personal credentials must not count", () => {
  it("ignores a healthy PERSONAL-provider connection", async () => {
    mockGetRole.mockResolvedValue("owner");
    // gmail is a personal-credential provider.
    mockListIntegrations.mockResolvedValue([
      { provider: "gmail", disconnectedAt: null, needsReconnectAt: null },
    ]);
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto?.steps.find((s) => s.key === "connect_shared_app")?.status).not.toBe(
      "complete",
    );
  });

  it("counts a healthy ACCOUNT-provider connection", async () => {
    mockGetRole.mockResolvedValue("owner");
    mockListIntegrations.mockResolvedValue([
      { provider: "slack", disconnectedAt: null, needsReconnectAt: null },
    ]);
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto?.steps.find((s) => s.key === "connect_shared_app")?.status).toBe(
      "complete",
    );
  });

  it("ignores an UNHEALTHY shared connection", async () => {
    mockGetRole.mockResolvedValue("owner");
    mockListIntegrations.mockResolvedValue([
      { provider: "slack", disconnectedAt: null, needsReconnectAt: "2026-01-01T00:00:00Z" },
    ]);
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto?.steps.find((s) => s.key === "connect_shared_app")?.status).not.toBe(
      "complete",
    );
  });
});

describe("member learning evidence — proof 11", () => {
  it("requires real recorded evidence, not membership, for learning steps", async () => {
    mockGetRole.mockResolvedValue("member");
    fullySetUpAccount(); // a mature account this member just joined
    mockFindRecordedTypes.mockResolvedValue(new Set()); // nothing recorded
    mockHasRunByUser.mockResolvedValue(false);

    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(dto?.completedStepCount).toBe(0);
  });

  it("scopes the evidence read to THIS user and THIS account", async () => {
    mockGetRole.mockResolvedValue("member");
    await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockFindRecordedTypes).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, accountId: ACCOUNT }),
    );
  });

  it("completes 'use a team workflow' only from a run THIS member triggered", async () => {
    mockGetRole.mockResolvedValue("member");
    mockHasRunByUser.mockResolvedValue(true);
    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockHasRunByUser).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      userId: USER,
    });
    expect(dto?.steps.find((s) => s.key === "use_shared_workflow")?.status).toBe(
      "complete",
    );
  });

  it("accepts EITHER apps or team viewing for the directory step", async () => {
    mockGetRole.mockResolvedValue("member");
    mockFindRecordedTypes.mockResolvedValue(new Set(["collab_apps_viewed"]));
    const viaApps = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(viaApps?.steps.find((s) => s.key === "explore_directory")?.status).toBe(
      "complete",
    );

    mockFindRecordedTypes.mockResolvedValue(new Set(["collab_team_viewed"]));
    const viaTeam = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(viaTeam?.steps.find((s) => s.key === "explore_directory")?.status).toBe(
      "complete",
    );
  });

  it("never queries member learning evidence for the owner track", async () => {
    mockGetRole.mockResolvedValue("owner");
    await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockFindRecordedTypes).not.toHaveBeenCalled();
    expect(mockHasRunByUser).not.toHaveBeenCalled();
  });
});

describe("existing accounts — proof 10 (silent historical completion)", () => {
  it("silently completes an owner whose setup already happened, with NO celebration", async () => {
    mockGetRole.mockResolvedValue("owner");
    fullySetUpAccount();
    mockGetCollabState
      // First read: never shown, not completed.
      .mockResolvedValueOnce(null)
      // Re-read after the latch.
      .mockResolvedValueOnce({
        completedAt: "2026-07-19T00:00:00Z",
        celebratedAt: "2026-07-19T00:00:00Z", // silent latch stamps this
        firstShownAt: null,
        dismissedAt: null,
        minimized: false,
      });

    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });

    expect(mockLatchCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ track: "team_owner", silent: true }),
    );
    expect(dto?.completed).toBe(true);
    // The celebration is already acknowledged → the card never appears.
    expect(dto?.presentation.celebrationPending).toBe(false);
  });

  it("DOES celebrate when the user had already seen the checklist", async () => {
    mockGetRole.mockResolvedValue("owner");
    fullySetUpAccount();
    mockGetCollabState
      .mockResolvedValueOnce({
        completedAt: null,
        celebratedAt: null,
        firstShownAt: "2026-07-01T00:00:00Z", // they watched it happen
        dismissedAt: null,
        minimized: false,
      })
      .mockResolvedValueOnce({
        completedAt: "2026-07-19T00:00:00Z",
        celebratedAt: null,
        firstShownAt: "2026-07-01T00:00:00Z",
        dismissedAt: null,
        minimized: false,
      });

    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ silent: false }),
    );
    expect(dto?.presentation.celebrationPending).toBe(true);
  });

  it("does not re-latch an already-completed track", async () => {
    mockGetRole.mockResolvedValue("owner");
    fullySetUpAccount();
    mockGetCollabState.mockResolvedValue({
      completedAt: "2026-01-01T00:00:00Z",
      celebratedAt: "2026-01-01T00:00:00Z",
      firstShownAt: null,
      dismissedAt: null,
      minimized: false,
    });
    await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchCompletion).not.toHaveBeenCalled();
  });

  it("does not silently complete a MEMBER who merely belongs to a set-up account", async () => {
    mockGetRole.mockResolvedValue("member");
    fullySetUpAccount();
    mockFindRecordedTypes.mockResolvedValue(new Set());
    mockHasRunByUser.mockResolvedValue(false);
    await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    expect(mockLatchCompletion).not.toHaveBeenCalled();
  });
});

describe("no-leak", () => {
  it("returns only step keys, statuses, counts and a track — no account internals", async () => {
    mockGetRole.mockResolvedValue("owner");
    fullySetUpAccount();
    mockCountMembers.mockResolvedValue(7);
    mockCountPendingInvites.mockResolvedValue(3);
    // A plan value that is NOT a substring of any track id, so the assertion
    // below genuinely discriminates (every track contains the word "team").
    mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "organization" });
    mockGetPlan.mockResolvedValue("enterprise");

    const dto = await getCollaborationChecklist({ userId: USER, accountId: ACCOUNT });
    const blob = JSON.stringify(dto);

    // No member count, no invitation count, no provider identity, no plan.
    expect(blob).not.toMatch(/\b7\b/);
    expect(blob).not.toMatch(/\b3\b/);
    expect(blob).not.toContain("slack");
    expect(blob).not.toContain("enterprise"); // the PLAN is read then discarded
    expect(dto?.track).toBe("team_owner");
    expect(Object.keys(dto!).sort()).toEqual([
      "completed",
      "completedAt",
      "completedStepCount",
      "presentation",
      "steps",
      "totalStepCount",
      "track",
    ]);
    for (const step of dto!.steps) {
      expect(Object.keys(step).sort()).toEqual(["key", "status"]);
    }
  });
});
