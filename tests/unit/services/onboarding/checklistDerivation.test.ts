/**
 * Pure derivation matrix for the first-workflow onboarding checklist
 * (5.ONBOARD-1 Batch 1). Proves the honesty rules: every step's completion
 * comes only from the supplied authoritative facts, failed/absent evidence
 * never completes a step, and the automated-trigger path never fakes a test.
 */
import {
  deriveChecklistSteps,
  pickActivationEvidenceWorkflow,
  workflowProvesPriorActivation,
  type SelectedWorkflowFacts,
} from "@/services/onboarding/checklistDerivation";
import type { OnboardingProviderEntry } from "@/contracts/onboarding";

function facts(overrides: Partial<SelectedWorkflowFacts> = {}): SelectedWorkflowFacts {
  return {
    id: "wf-1",
    name: "Lead intake",
    state: "draft",
    nodeCount: 2,
    hasManualTrigger: true,
    allRequiredConnected: true,
    providers: [],
    writePathReady: false,
    hasSucceededRun: false,
    lastRunFailed: false,
    ...overrides,
  };
}

function provider(overrides: Partial<OnboardingProviderEntry> = {}): OnboardingProviderEntry {
  return {
    provider: "slack",
    name: "Slack",
    ready: false,
    reconnectNeeded: false,
    canConnect: true,
    adminRequired: false,
    ...overrides,
  };
}

function stepByKey(result: ReturnType<typeof deriveChecklistSteps>, key: string) {
  const step = result.steps.find((s) => s.key === key);
  if (!step) throw new Error(`missing step ${key}`);
  return step;
}

describe("deriveChecklistSteps", () => {
  it("brand-new account: no workflows → only create is current, nothing complete", () => {
    const r = deriveChecklistSteps({ hasAnyWorkflow: false, selected: null });
    expect(stepByKey(r, "create").status).toBe("current");
    for (const key of ["connect", "configure", "test", "activate"]) {
      expect(stepByKey(r, key).status).toBe("pending");
    }
    expect(r.completedStepCount).toBe(0);
    expect(r.totalStepCount).toBe(5);
  });

  it("workflow exists but none selectable → create complete, rest pending", () => {
    const r = deriveChecklistSteps({ hasAnyWorkflow: true, selected: null });
    expect(stepByKey(r, "create").status).toBe("complete");
    expect(stepByKey(r, "connect").status).toBe("pending");
  });

  it("empty graph: connect is NOT complete (zero providers is not 'fully connected') and configure is current", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({ nodeCount: 0, allRequiredConnected: undefined, writePathReady: false }),
    });
    const connect = stepByKey(r, "connect");
    expect(connect.status).toBe("blocked");
    expect(connect.blockedReason).toBe("add_steps_first");
    expect(stepByKey(r, "configure").status).toBe("current");
  });

  it("native-only workflow with nodes: connect completes vacuously", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({ providers: [], allRequiredConnected: true }),
    });
    expect(stepByKey(r, "connect").status).toBe("complete");
  });

  it("missing connection → connect current with provider detail, not complete", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({
        allRequiredConnected: false,
        providers: [provider({ ready: false })],
      }),
    });
    const connect = stepByKey(r, "connect");
    expect(connect.status).toBe("current");
    expect(connect.providers).toHaveLength(1);
  });

  it("reconnect required → connect blocked with reconnect_required", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({
        allRequiredConnected: false,
        providers: [provider({ ready: false, reconnectNeeded: true })],
      }),
    });
    const connect = stepByKey(r, "connect");
    expect(connect.status).toBe("blocked");
    expect(connect.blockedReason).toBe("reconnect_required");
  });

  it("admin-required provider for a plain member → connect blocked with admin_required (wins over reconnect)", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({
        allRequiredConnected: false,
        providers: [
          provider({ ready: false, reconnectNeeded: true }),
          provider({ provider: "stripe", name: "Stripe", ready: false, canConnect: false, adminRequired: true }),
        ],
      }),
    });
    expect(stepByKey(r, "connect").blockedReason).toBe("admin_required");
  });

  it("REGRESSION: a needs_reconnect provider un-completes Connect even when the readiness ladder says ready", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({
        // The diagnosis ladder still reports OK…
        allRequiredConnected: true,
        // …but the execution seam flagged the credential as needing reconnect.
        providers: [provider({ ready: true, reconnectNeeded: true })],
      }),
    });
    const connect = stepByKey(r, "connect");
    expect(connect.status).toBe("blocked");
    expect(connect.blockedReason).toBe("reconnect_required");
  });

  it("connected but unconfigured → configure current", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({ writePathReady: false }),
    });
    expect(stepByKey(r, "connect").status).toBe("complete");
    expect(stepByKey(r, "configure").status).toBe("current");
  });

  it("configured, no run yet → test current; failed last run surfaces lastRunFailed and stays incomplete", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({ writePathReady: true, hasSucceededRun: false, lastRunFailed: true }),
    });
    const test = stepByKey(r, "test");
    expect(test.status).toBe("current");
    expect(test.lastRunFailed).toBe(true);
  });

  it("succeeded run (test or live) completes the test step", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({ writePathReady: true, hasSucceededRun: true }),
    });
    expect(stepByKey(r, "test").status).toBe("complete");
    expect(stepByKey(r, "activate").status).toBe("current");
  });

  it.each(["draft", "paused", "disabled", "eligible_to_resume", "deleted"])(
    "state %s never completes the activate step",
    (state) => {
      const r = deriveChecklistSteps({
        hasAnyWorkflow: true,
        selected: facts({ state, writePathReady: true, hasSucceededRun: true }),
      });
      expect(stepByKey(r, "activate").status).not.toBe("complete");
    },
  );

  it("state active completes the activate step", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({ state: "active", writePathReady: true, hasSucceededRun: true }),
    });
    expect(stepByKey(r, "activate").status).toBe("complete");
    expect(r.completedStepCount).toBe(5);
  });

  it("automated trigger, not yet active: test is skipped as current — activate is the actionable step, test not faked", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({ hasManualTrigger: false, writePathReady: true }),
    });
    const test = stepByKey(r, "test");
    expect(test.status).toBe("pending");
    expect(test.testable).toBe(false);
    expect(stepByKey(r, "activate").status).toBe("current");
  });

  it("automated trigger, activated, no run yet: waiting for first run — test stays incomplete", () => {
    const r = deriveChecklistSteps({
      hasAnyWorkflow: true,
      selected: facts({
        hasManualTrigger: false,
        writePathReady: true,
        state: "active",
        hasSucceededRun: false,
      }),
    });
    const test = stepByKey(r, "test");
    expect(test.status).toBe("current");
    expect(test.waitingForFirstRun).toBe(true);
    expect(stepByKey(r, "activate").status).toBe("complete");
    expect(r.completedStepCount).toBe(4);
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
