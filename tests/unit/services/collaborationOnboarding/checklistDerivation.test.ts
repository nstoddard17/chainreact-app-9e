/**
 * @jest-environment node
 *
 * Pure derivation tests for services/collaborationOnboarding/checklistDerivation.ts
 * (5.ONBOARD-4). No mocks — this module has no I/O.
 *
 * Covers required proofs: 3 (members never receive invite/join steps), 4 (admin
 * steps reflect actual admin permissions), 5 (owners receive invite + join),
 * 12 (personal accounts get no collaboration checklist), 13 (Team/Business/
 * Enterprise eligibility uses authoritative plan data).
 */
import {
  deriveCollaborationSteps,
  isCollaborationEligible,
  stepKeysForTrack,
  trackForRole,
  type CollaborationAccountFacts,
  type CollaborationMemberFacts,
} from "@/services/collaborationOnboarding/checklistDerivation";
import { COLLABORATION_TRACKS } from "@/contracts/collaborationOnboarding";

const NO_ACCOUNT_FACTS: CollaborationAccountFacts = {
  memberCount: 1,
  pendingInvitationCount: 0,
  hasSharedIntegration: false,
  hasWorkflow: false,
};

const NO_MEMBER_FACTS: CollaborationMemberFacts = {
  exploredWorkspace: false,
  openedSharedWorkflow: false,
  viewedDirectory: false,
  ranSharedWorkflow: false,
};

function derive(
  track: (typeof COLLABORATION_TRACKS)[number],
  account: Partial<CollaborationAccountFacts> = {},
  member: Partial<CollaborationMemberFacts> = {},
) {
  return deriveCollaborationSteps({
    track,
    account: { ...NO_ACCOUNT_FACTS, ...account },
    member: { ...NO_MEMBER_FACTS, ...member },
  });
}

describe("trackForRole", () => {
  it("maps each membership role to its own distinct track", () => {
    expect(trackForRole("owner")).toBe("team_owner");
    expect(trackForRole("admin")).toBe("team_admin");
    expect(trackForRole("member")).toBe("team_member");
    // Distinct identifiers — never one ambiguous record (task: role selection).
    expect(new Set(COLLABORATION_TRACKS).size).toBe(3);
  });
});

describe("eligibility — proof 12 + 13", () => {
  it("gives personal accounts NO collaboration checklist, whatever the plan", () => {
    for (const plan of ["free", "pro", "team", "business", "enterprise"] as const) {
      expect(
        isCollaborationEligible({ accountType: "personal", plan }),
      ).toBe(false);
    }
  });

  it("uses authoritative PLAN data, not the account type, for Team/Business/Enterprise", () => {
    // `organization` is the internal type behind BOTH Business and Enterprise —
    // the type alone cannot distinguish them, which is exactly why the plan is
    // the authoritative source.
    expect(
      isCollaborationEligible({ accountType: "organization", plan: "business" }),
    ).toBe(true);
    expect(
      isCollaborationEligible({ accountType: "organization", plan: "enterprise" }),
    ).toBe(true);
    expect(isCollaborationEligible({ accountType: "team", plan: "team" })).toBe(true);
  });

  it("refuses a shared account whose stored plan is NOT a collaboration tier", () => {
    // A lapsed / downgraded shared account. Using account.type alone would
    // wrongly hand this account a collaboration checklist.
    expect(isCollaborationEligible({ accountType: "team", plan: "free" })).toBe(false);
    expect(isCollaborationEligible({ accountType: "team", plan: "pro" })).toBe(false);
    expect(
      isCollaborationEligible({ accountType: "organization", plan: "free" }),
    ).toBe(false);
  });

  it("fails closed when no billing row exists (plan null)", () => {
    expect(isCollaborationEligible({ accountType: "team", plan: null })).toBe(false);
  });
});

describe("member track — proof 3", () => {
  const MEMBER_KEYS = stepKeysForTrack("team_member");

  it("never asks a member to invite, wait for a teammate, bill, or assign admins", () => {
    // The explicit forbidden list from the task.
    expect(MEMBER_KEYS).not.toContain("invite_teammate");
    expect(MEMBER_KEYS).not.toContain("teammate_joined");
    // No billing / admin-assignment step key exists on the member track at all.
    expect(MEMBER_KEYS).toEqual([
      "explore_workspace",
      "open_shared_workflow",
      "use_shared_workflow",
      "explore_directory",
    ]);
  });

  it("starts fully incomplete for a brand-new member — belonging proves nothing", () => {
    // Proof 11's derivation half: a member of a mature account (2 members, apps
    // connected, workflows built) has NO steps complete, because none of those
    // account facts is evidence THIS user visited or used anything.
    const derived = derive("team_member", {
      memberCount: 5,
      pendingInvitationCount: 3,
      hasSharedIntegration: true,
      hasWorkflow: true,
    });
    expect(derived.completedStepCount).toBe(0);
    expect(derived.steps.every((s) => s.status !== "complete")).toBe(true);
  });

  it("completes each learning step only from its own real evidence", () => {
    expect(
      derive("team_member", {}, { exploredWorkspace: true }).steps.find(
        (s) => s.key === "explore_workspace",
      )?.status,
    ).toBe("complete");
    expect(
      derive("team_member", {}, { openedSharedWorkflow: true }).steps.find(
        (s) => s.key === "open_shared_workflow",
      )?.status,
    ).toBe("complete");
    expect(
      derive("team_member", {}, { ranSharedWorkflow: true }).steps.find(
        (s) => s.key === "use_shared_workflow",
      )?.status,
    ).toBe("complete");
    expect(
      derive("team_member", {}, { viewedDirectory: true }).steps.find(
        (s) => s.key === "explore_directory",
      )?.status,
    ).toBe("complete");
  });
});

describe("owner track — proof 5", () => {
  const OWNER_KEYS = stepKeysForTrack("team_owner");

  it("receives the invite and teammate-join setup steps", () => {
    expect(OWNER_KEYS).toContain("invite_teammate");
    expect(OWNER_KEYS).toContain("teammate_joined");
    expect(OWNER_KEYS).toEqual([
      "invite_teammate",
      "teammate_joined",
      "connect_shared_app",
      "create_shared_workflow",
    ]);
  });

  it("completes invite_teammate from a pending invitation OR a second member", () => {
    expect(
      derive("team_owner", { pendingInvitationCount: 1 }).steps.find(
        (s) => s.key === "invite_teammate",
      )?.status,
    ).toBe("complete");
    // The OR arm that stops the step REGRESSING the moment the invite is
    // accepted (pending flips to accepted, so the pending count returns to 0).
    expect(
      derive("team_owner", { memberCount: 2, pendingInvitationCount: 0 }).steps.find(
        (s) => s.key === "invite_teammate",
      )?.status,
    ).toBe("complete");
  });

  it("does NOT complete teammate_joined from a pending invitation alone", () => {
    const derived = derive("team_owner", {
      memberCount: 1,
      pendingInvitationCount: 2,
    });
    expect(derived.steps.find((s) => s.key === "teammate_joined")?.status).not.toBe(
      "complete",
    );
    // ...and does once someone actually joined.
    expect(
      derive("team_owner", { memberCount: 2 }).steps.find(
        (s) => s.key === "teammate_joined",
      )?.status,
    ).toBe("complete");
  });

  it("completes connect_shared_app and create_shared_workflow from account facts", () => {
    const derived = derive("team_owner", {
      hasSharedIntegration: true,
      hasWorkflow: true,
    });
    expect(derived.steps.find((s) => s.key === "connect_shared_app")?.status).toBe(
      "complete",
    );
    expect(
      derived.steps.find((s) => s.key === "create_shared_workflow")?.status,
    ).toBe("complete");
  });
});

describe("admin track — proof 4", () => {
  const ADMIN_KEYS = stepKeysForTrack("team_admin");

  it("only contains steps an admin is genuinely authorized to perform", () => {
    // Verified against real enforcement:
    //   invite            → invitations route allows ["owner","admin"]
    //   connect shared    → oauth connect allows ["owner","admin"] for account providers
    //   create workflow   → membership-only, never role-gated
    //   review team       → members route allows all three roles
    expect(ADMIN_KEYS).toEqual([
      "invite_teammate",
      "connect_shared_app",
      "create_shared_workflow",
      "review_team",
    ]);
  });

  it("never shows an owner-only step — it substitutes a real admin action", () => {
    // `teammate_joined` is the owner-only waiting step. The admin track must not
    // contain it AT ALL (not as a blocked/disabled row), and must instead carry
    // an action the admin can actually take.
    expect(ADMIN_KEYS).not.toContain("teammate_joined");
    expect(ADMIN_KEYS).toContain("review_team");
    // No status in the whole system can express "blocked" — there is nothing to
    // render an owner-only step as.
    const statuses = derive("team_admin").steps.map((s) => s.status);
    expect(statuses.every((s) => ["complete", "current", "pending"].includes(s))).toBe(
      true,
    );
  });

  it("does not assume admins have owner-only powers", () => {
    // Transfer-ownership and plan-downgrade are owner-only in the real routes;
    // no track exposes them, and the admin track in particular does not.
    for (const track of COLLABORATION_TRACKS) {
      const keys = stepKeysForTrack(track) as readonly string[];
      expect(keys).not.toContain("transfer_ownership");
      expect(keys).not.toContain("manage_billing");
      expect(keys).not.toContain("assign_admin");
    }
  });
});

describe("step ordering and current-step selection", () => {
  it("marks the first incomplete step as current and the rest pending", () => {
    const derived = derive("team_owner", {
      memberCount: 2,
      pendingInvitationCount: 1,
    });
    // invite + teammate_joined complete → connect_shared_app is current.
    expect(derived.steps.map((s) => s.status)).toEqual([
      "complete",
      "complete",
      "current",
      "pending",
    ]);
    expect(derived.completedStepCount).toBe(2);
    expect(derived.totalStepCount).toBe(4);
  });

  it("has no current step once every step is complete", () => {
    const derived = derive(
      "team_member",
      {},
      {
        exploredWorkspace: true,
        openedSharedWorkflow: true,
        viewedDirectory: true,
        ranSharedWorkflow: true,
      },
    );
    expect(derived.completedStepCount).toBe(derived.totalStepCount);
    expect(derived.steps.some((s) => s.status === "current")).toBe(false);
  });

  it("gives every track exactly four steps", () => {
    for (const track of COLLABORATION_TRACKS) {
      expect(stepKeysForTrack(track)).toHaveLength(4);
    }
  });
});
