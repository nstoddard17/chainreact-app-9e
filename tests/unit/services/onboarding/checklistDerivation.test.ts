/**
 * Pure derivation matrix for the first-workflow onboarding checklist
 * (5.ONBOARD-1 Batch 1). Proves the honesty rules: every step's completion
 * comes only from the supplied authoritative facts, failed/absent evidence
 * never completes a step, and the automated-trigger path never fakes a test.
 */
import {
  deriveChecklistSteps,
  pickActivationEvidenceWorkflow,
  isIntegrationHealthy,
  pickStepTarget,
  workflowProvesPriorActivation,
  type WorkflowChecklistFacts,
} from "@/services/onboarding/checklistDerivation";

function facts(overrides: Partial<WorkflowChecklistFacts> = {}): WorkflowChecklistFacts {
  return {
    id: "wf-1",
    name: "Lead intake",
    state: "draft",
    nodeCount: 2,
    hasManualTrigger: true,
    writePathReady: false,
    hasSucceededRun: false,
    lastRunFailed: false,
    ...overrides,
  };
}

function stepByKey(result: ReturnType<typeof deriveChecklistSteps>, key: string) {
  const step = result.steps.find((s) => s.key === key);
  if (!step) throw new Error(`missing step ${key}`);
  return step;
}

describe("deriveChecklistSteps", () => {
  it("emits the steps in checklist order — connect leads, then create", () => {
    const r = deriveChecklistSteps({ workflows: [], accountHasHealthyIntegration: false });
    expect(r.steps.map((s) => s.key)).toEqual([
      "connect",
      "create",
      "configure",
      "test",
      "activate",
    ]);
  });

  it("brand-new account: no workflows → only connect is current, nothing complete", () => {
    const r = deriveChecklistSteps({ workflows: [], accountHasHealthyIntegration: false });
    expect(stepByKey(r, "connect").status).toBe("current");
    for (const key of ["create", "configure", "test", "activate"]) {
      expect(stepByKey(r, key).status).toBe("pending");
    }
    expect(r.completedStepCount).toBe(0);
    expect(r.totalStepCount).toBe(5);
  });

  it("a single empty draft completes only create", () => {
    const r = deriveChecklistSteps({
      workflows: [facts({ nodeCount: 0 })],
      accountHasHealthyIntegration: false,
    });
    expect(stepByKey(r, "create").status).toBe("complete");
    expect(r.completedStepCount).toBe(1);
  });

  // ── 5.ONBOARD-3: Connect is the general "connect an app" action ────────
  it("completes Connect when the ACCOUNT has a healthy integration", () => {
    const r = deriveChecklistSteps({
      workflows: [facts({ nodeCount: 0 })],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "connect").status).toBe("complete");
  });

  it("completes Connect even when NO workflow references the integration", () => {
    // Empty draft, nothing wired up anywhere — the connection alone is enough,
    // because the step teaches the action, not a per-workflow requirement.
    const r = deriveChecklistSteps({
      workflows: [facts({ nodeCount: 0, writePathReady: false })],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "connect").status).toBe("complete");
  });

  it("completes Connect with NO workflows at all", () => {
    const r = deriveChecklistSteps({
      workflows: [],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "connect").status).toBe("complete");
    // create is still the current step — connect being done does not skip it.
    expect(stepByKey(r, "create").status).toBe("current");
  });

  it("leaves Connect incomplete when the account has no healthy integration", () => {
    const r = deriveChecklistSteps({
      workflows: [facts({ nodeCount: 3, writePathReady: true })],
      accountHasHealthyIntegration: false,
    });
    expect(stepByKey(r, "connect").status).not.toBe("complete");
  });

  it("carries NO provider detail and NO blocked state on the Connect step", () => {
    const r = deriveChecklistSteps({
      workflows: [facts({ nodeCount: 2 })],
      accountHasHealthyIntegration: false,
    });
    const connect = stepByKey(r, "connect");
    // The step names no app, exposes no readiness, and has no CTA target: its
    // destination is always /apps.
    expect(connect).not.toHaveProperty("providers");
    expect(connect).not.toHaveProperty("blockedReason");
    expect(connect.ctaWorkflowId).toBeUndefined();
    expect(Object.keys(connect).sort()).toEqual(["key", "status"]);
  });

  it("no step ever reports the removed 'blocked' status", () => {
    const r = deriveChecklistSteps({
      workflows: [facts({ nodeCount: 0 })],
      accountHasHealthyIntegration: false,
    });
    for (const step of r.steps) {
      expect(step.status).not.toBe("blocked");
    }
  });

  it("Connect is a legitimate current step before any workflow has steps", () => {
    // Previously connect was skipped for an empty graph. Connecting an app is a
    // standalone action, so it must remain reachable.
    const r = deriveChecklistSteps({
      workflows: [facts({ nodeCount: 0 })],
      accountHasHealthyIntegration: false,
    });
    expect(stepByKey(r, "connect").status).toBe("current");
  });

  it("connected but unconfigured → configure current", () => {
    const r = deriveChecklistSteps({
            workflows: [facts({ writePathReady: false })],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "connect").status).toBe("complete");
    expect(stepByKey(r, "configure").status).toBe("current");
  });

  it("configured, no run yet → test current; failed last run surfaces lastRunFailed and stays incomplete", () => {
    const r = deriveChecklistSteps({
            workflows: [facts({ writePathReady: true, hasSucceededRun: false, lastRunFailed: true })],
      accountHasHealthyIntegration: true,
    });
    const test = stepByKey(r, "test");
    expect(test.status).toBe("current");
    expect(test.lastRunFailed).toBe(true);
  });

  it("succeeded run (test or live) completes the test step", () => {
    const r = deriveChecklistSteps({
            workflows: [facts({ writePathReady: true, hasSucceededRun: true })],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "test").status).toBe("complete");
    expect(stepByKey(r, "activate").status).toBe("current");
  });

  it.each(["draft", "paused", "disabled", "eligible_to_resume", "deleted"])(
    "state %s never completes the activate step",
    (state) => {
      const r = deriveChecklistSteps({
                workflows: [facts({ state, writePathReady: true, hasSucceededRun: true })],
        accountHasHealthyIntegration: true,
      });
      expect(stepByKey(r, "activate").status).not.toBe("complete");
    },
  );

  it("state active completes the activate step", () => {
    const r = deriveChecklistSteps({
            workflows: [facts({ state: "active", writePathReady: true, hasSucceededRun: true })],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "activate").status).toBe("complete");
    expect(r.completedStepCount).toBe(5);
  });

  it("automated trigger, not yet active: test is skipped as current — activate is the actionable step, test not faked", () => {
    const r = deriveChecklistSteps({
            workflows: [facts({ hasManualTrigger: false, writePathReady: true })],
      accountHasHealthyIntegration: true,
    });
    const test = stepByKey(r, "test");
    expect(test.status).toBe("pending");
    expect(test.testable).toBe(false);
    expect(stepByKey(r, "activate").status).toBe("current");
  });

  it("automated trigger, activated, no run yet: waiting for first run — test stays incomplete", () => {
    const r = deriveChecklistSteps({
            workflows: [facts({
        hasManualTrigger: false,
        writePathReady: true,
        state: "active",
        hasSucceededRun: false,
      })],
      accountHasHealthyIntegration: true,
    });
    const test = stepByKey(r, "test");
    expect(test.status).toBe("current");
    expect(test.waitingForFirstRun).toBe(true);
    expect(stepByKey(r, "activate").status).toBe("complete");
    expect(r.completedStepCount).toBe(4);
  });
});

/**
 * 5.ONBOARD-2 — the checklist is ACCOUNT-level. A step is complete when ANY
 * workflow satisfies it, and different workflows may satisfy different steps.
 * These are the cases the old per-workflow derivation got wrong.
 */
describe("deriveChecklistSteps — account-level aggregation", () => {
  it("aggregates steps across DIFFERENT workflows in the same account", () => {
    // Nothing here satisfies more than one step on its own; together they
    // satisfy four. The old single-workflow derivation would have reported the
    // progress of whichever one happened to be selected.
    const connected = facts({
      id: "wf-connected",
      nodeCount: 2,
      writePathReady: false,
    });
    const configured = facts({
      id: "wf-configured",
      nodeCount: 3,
      writePathReady: true,
    });
    const tested = facts({ id: "wf-tested", hasSucceededRun: true });
    const activated = facts({ id: "wf-activated", state: "active" });

    const r = deriveChecklistSteps({
      workflows: [connected, configured, tested, activated],
      accountHasHealthyIntegration: true,
    });

    expect(stepByKey(r, "create").status).toBe("complete");
    expect(stepByKey(r, "connect").status).toBe("complete");
    expect(stepByKey(r, "configure").status).toBe("complete");
    expect(stepByKey(r, "test").status).toBe("complete");
    expect(stepByKey(r, "activate").status).toBe("complete");
    expect(r.completedStepCount).toBe(5);
  });

  it("does NOT require one workflow to satisfy every step", () => {
    // Two workflows, each satisfying exactly one of the later steps. Neither
    // alone would complete both.
    const onlyTested = facts({ id: "a", hasSucceededRun: true, state: "draft" });
    const onlyActive = facts({ id: "b", hasSucceededRun: false, state: "active" });

    const r = deriveChecklistSteps({ workflows: [onlyTested, onlyActive], accountHasHealthyIntegration: true });

    expect(stepByKey(r, "test").status).toBe("complete");
    expect(stepByKey(r, "activate").status).toBe("complete");
  });

  it("a step stays incomplete when NO workflow satisfies it", () => {
    const r = deriveChecklistSteps({
      workflows: [
        facts({ id: "a", hasSucceededRun: false, state: "draft" }),
        facts({ id: "b", hasSucceededRun: false, state: "paused" }),
      ],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "test").status).not.toBe("complete");
    expect(stepByKey(r, "activate").status).not.toBe("complete");
  });

  it("connect completes when ANY workflow is fully connected, even if others are not", () => {
    const r = deriveChecklistSteps({
      workflows: [
        facts({ id: "broken" }),
        facts({ id: "good" }),
      ],
      accountHasHealthyIntegration: true,
    });
    expect(stepByKey(r, "connect").status).toBe("complete");
  });

  it("empty-graph blocking is account-wide: one workflow WITH steps unblocks connect", () => {
    const r = deriveChecklistSteps({
      workflows: [
        facts({ id: "empty", nodeCount: 0 }),
        facts({ id: "built", nodeCount: 2 }),
      ],
      accountHasHealthyIntegration: true,
    });
    const connect = stepByKey(r, "connect");
    expect(connect).not.toHaveProperty("blockedReason");
  });
});

describe("pickStepTarget — deterministic CTA targeting", () => {
  it("targets the workflow closest to satisfying the step", () => {
    const notReady = facts({ id: "empty", nodeCount: 0, writePathReady: false });
    const closer = facts({ id: "built", nodeCount: 4, writePathReady: false });
    // `configure`: a workflow with steps is closer than an empty draft.
    expect(pickStepTarget("configure", [notReady, closer])?.id).toBe("built");
  });

  it("breaks ties by most recently updated (first in the updated_at DESC list)", () => {
    const newer = facts({ id: "newer", writePathReady: true });
    const older = facts({ id: "older", writePathReady: true });
    expect(pickStepTarget("configure", [newer, older])?.id).toBe("newer");
  });

  it("is deterministic across repeated calls on the same list", () => {
    const list = [
      facts({ id: "a", nodeCount: 2, writePathReady: false }),
      facts({ id: "b", nodeCount: 2, writePathReady: true }),
      facts({ id: "c", nodeCount: 0 }),
    ];
    const first = pickStepTarget("configure", list)?.id;
    for (let i = 0; i < 5; i += 1) {
      expect(pickStepTarget("configure", list)?.id).toBe(first);
    }
  });

  it("returns null when no workflow is a candidate → the UI routes to create", () => {
    expect(pickStepTarget("connect", [])).toBeNull();
    // An empty graph has nothing to connect, so it is not a connect candidate.
    expect(pickStepTarget("connect", [facts({ nodeCount: 0 })])).toBeNull();
  });

  it("create never targets an existing workflow (its CTA opens the chooser)", () => {
    expect(pickStepTarget("create", [facts({ id: "a" })])).toBeNull();
  });

  it("test prefers a workflow the user can actually run now (manual trigger)", () => {
    const automated = facts({ id: "auto", writePathReady: true, hasManualTrigger: false });
    const manual = facts({ id: "manual", writePathReady: true, hasManualTrigger: true });
    expect(pickStepTarget("test", [automated, manual])?.id).toBe("manual");
  });

  it("connect NEVER targets a workflow — its destination is always /apps", () => {
    // 5.ONBOARD-3: connect is an account-level action, so no workflow is a
    // candidate no matter how many exist or how built-out they are.
    expect(pickStepTarget("connect", [facts({ id: "a", nodeCount: 3 })])).toBeNull();
  });

  it("surfaces each step's target on the step DTO so CTAs can differ per step", () => {
    const configured = facts({ id: "wf-config", nodeCount: 3, writePathReady: true });
    const activated = facts({ id: "wf-active", nodeCount: 3, writePathReady: true, state: "active" });
    const r = deriveChecklistSteps({ workflows: [configured, activated], accountHasHealthyIntegration: true });

    // activate is satisfied only by wf-active, so its CTA must point there.
    expect(stepByKey(r, "activate").ctaWorkflowId).toBe("wf-active");
    // Every workflow-scoped step carries a target when a candidate exists.
    // Connect is excluded — it always goes to /apps.
    for (const key of ["configure", "test", "activate"]) {
      expect(stepByKey(r, key).ctaWorkflowId).toBeTruthy();
    }
    expect(stepByKey(r, "create").ctaWorkflowId).toBeUndefined();
    expect(stepByKey(r, "connect").ctaWorkflowId).toBeUndefined();
  });

  it("omits the CTA target when the account has no workflows", () => {
    const r = deriveChecklistSteps({ workflows: [], accountHasHealthyIntegration: true });
    for (const key of ["create", "connect", "configure", "test", "activate"]) {
      expect(stepByKey(r, key).ctaWorkflowId).toBeUndefined();
    }
  });
});

/**
 * 5.ONBOARD-3 — what counts as a genuinely usable connection for the Connect
 * step. The step must never tick green for a connection the next run would
 * fail on, so every known unhealthy signal has to disqualify it.
 */
describe("isIntegrationHealthy", () => {
  const healthy = {
    disconnectedAt: null,
    needsReconnectAt: null,
    accessTokenExpiresAt: null,
    refreshTokenEncrypted: "enc-refresh",
  };

  it("accepts a live connection", () => {
    expect(isIntegrationHealthy(healthy)).toBe(true);
  });

  it("rejects a disconnected connection", () => {
    expect(
      isIntegrationHealthy({ ...healthy, disconnectedAt: "2026-01-01T00:00:00Z" }),
    ).toBe(false);
  });

  it("rejects a reconnect-required connection even when it otherwise looks fine", () => {
    // needs_reconnect_at is set at the execution seam when the credential
    // actually failed (revoked / scopes reduced), so it outranks appearances.
    expect(
      isIntegrationHealthy({ ...healthy, needsReconnectAt: "2026-01-01T00:00:00Z" }),
    ).toBe(false);
  });

  it("rejects an expired token with NO refresh token (nothing can renew it)", () => {
    expect(
      isIntegrationHealthy(
        {
          ...healthy,
          accessTokenExpiresAt: "2026-01-01T00:00:00Z",
          refreshTokenEncrypted: null,
        },
        new Date("2026-06-01T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("ACCEPTS an expired token that HAS a refresh token (refreshAndRetry renews it)", () => {
    expect(
      isIntegrationHealthy(
        { ...healthy, accessTokenExpiresAt: "2026-01-01T00:00:00Z" },
        new Date("2026-06-01T00:00:00Z"),
      ),
    ).toBe(true);
  });

  it("accepts a not-yet-expired token without a refresh token", () => {
    expect(
      isIntegrationHealthy(
        {
          ...healthy,
          accessTokenExpiresAt: "2026-12-01T00:00:00Z",
          refreshTokenEncrypted: null,
        },
        new Date("2026-06-01T00:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("workflowProvesPriorActivation", () => {
  it.each(["active", "paused", "disabled", "eligible_to_resume"])(
    "state %s proves prior activation",
    (state) => {
      expect(workflowProvesPriorActivation({ state, activeRevisionId: null })).toBe(true);
    },
  );

  it("draft without a revision does not prove activation", () => {
    expect(
      workflowProvesPriorActivation({ state: "draft", activeRevisionId: null }),
    ).toBe(false);
  });

  it("non-null active_revision_id proves activation regardless of state", () => {
    expect(
      workflowProvesPriorActivation({ state: "draft", activeRevisionId: "rev-1" }),
    ).toBe(true);
  });
});

describe("activation-evidence pick (provenance correction)", () => {
  const wf = (over: Partial<{ id: string; state: string; activeRevisionId: string | null }> = {}) => ({
    id: "wf-1",
    state: "draft",
    activeRevisionId: null,
    ...over,
  });

  it("prefers a currently-active workflow over merely was-active evidence", () => {
    // List order is `updated_at DESC`, so the paused row is the more recent one.
    const picked = pickActivationEvidenceWorkflow([
      wf({ id: "paused-recent", state: "paused" }),
      wf({ id: "active-older", state: "active" }),
    ]);
    expect(picked?.id).toBe("active-older");
  });

  it("breaks ties by most recently updated (first in the list)", () => {
    const picked = pickActivationEvidenceWorkflow([
      wf({ id: "paused-newest", state: "paused" }),
      wf({ id: "disabled-older", state: "disabled" }),
    ]);
    expect(picked?.id).toBe("paused-newest");
  });

  it("accepts a draft carrying active_revision_id as weaker evidence", () => {
    const picked = pickActivationEvidenceWorkflow([
      wf({ id: "plain-draft" }),
      wf({ id: "was-activated", activeRevisionId: "rev-1" }),
    ]);
    expect(picked?.id).toBe("was-activated");
  });

  it("returns null when nothing proves prior activation", () => {
    expect(pickActivationEvidenceWorkflow([wf(), wf({ id: "wf-2" })])).toBeNull();
  });

  it("is deterministic across repeated calls on the same list", () => {
    const list = [
      wf({ id: "a", state: "paused" }),
      wf({ id: "b", state: "active" }),
      wf({ id: "c", state: "active" }),
    ];
    const first = pickActivationEvidenceWorkflow(list)?.id;
    expect(first).toBe("b");
    expect(pickActivationEvidenceWorkflow(list)?.id).toBe(first);
  });
});
