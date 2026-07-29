import type {
  AgentConnectionSignal,
  AgentReadinessBlocker,
  AgentReadinessVerdict,
} from "@/core/workflows/agentReadiness";
import {
  deriveGuidedBuildStage,
  stepForStage,
} from "@/core/workflows/guidedBuildStage";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided stage is a PURE projection over the
 * readiness verdict + connection signal. These tests lock the ordering rules:
 * connect before configure, configure before test, connection truth required
 * before leaving Connect, and derivability after a reload (same inputs → same
 * stage; no hidden state).
 */

function verdict(overrides: Partial<AgentReadinessVerdict> = {}): AgentReadinessVerdict {
  return {
    status: "ready_to_test",
    title: "Ready to test",
    summary: "",
    blockers: [],
    warnings: [],
    nextActions: [],
    lastTestStatus: "not_tested",
    ...overrides,
  };
}

function blocker(
  kind: AgentReadinessBlocker["kind"],
  extra: Partial<AgentReadinessBlocker> = {},
): AgentReadinessBlocker {
  return { kind, message: `${kind} message`, nextStep: "do the thing", blocking: true, ...extra };
}

const RESOLVED_ALL_CONNECTED: AgentConnectionSignal = {
  state: "resolved",
  providers: [
    { provider: "slack", name: "Slack", nodeIds: ["n2"], state: "connected", canReconnect: true },
    { provider: "stripe", name: "Stripe", nodeIds: ["n1"], state: "connected", canReconnect: true },
  ],
  allConnected: true,
};

const RESOLVED_STRIPE_MISSING: AgentConnectionSignal = {
  state: "resolved",
  providers: [
    { provider: "slack", name: "Slack", nodeIds: ["n2"], state: "connected", canReconnect: true },
    { provider: "stripe", name: "Stripe", nodeIds: ["n1"], state: "missing", canReconnect: true },
  ],
  allConnected: false,
};

function derive(
  input: Partial<Parameters<typeof deriveGuidedBuildStage>[0]> = {},
) {
  return deriveGuidedBuildStage({
    previewActive: false,
    sessionActive: true,
    workflowState: "draft",
    verdict: verdict(),
    connection: RESOLVED_ALL_CONNECTED,
    ...input,
  });
}

describe("session / preview gating", () => {
  it("no session → creating", () => {
    expect(derive({ sessionActive: false }).stage).toBe("creating");
  });

  it("an open preview → preview_ready (even mid-session)", () => {
    expect(derive({ previewActive: true }).stage).toBe("preview_ready");
  });

  it("an active workflow inside a session → complete", () => {
    expect(derive({ workflowState: "active" }).stage).toBe("complete");
  });
});

describe("connect before configure (product rule 1)", () => {
  it("a missing connection owns the stage even with missing fields", () => {
    const v = verdict({
      status: "blocked",
      blockers: [
        blocker("missing_required_field", { nodeId: "n2", fieldPath: "channel" }),
        blocker("missing_connection", { nodeId: "n1" }),
      ],
    });
    const snap = derive({ verdict: v, connection: RESOLVED_STRIPE_MISSING });
    expect(snap.stage).toBe("connecting");
    expect(snap.connectionBlockers).toHaveLength(1);
    expect(snap.configureBlockers).toHaveLength(1);
    expect(snap.connectionProviders).toHaveLength(2);
  });

  it("an invalid connection also keeps the user in Connect", () => {
    const v = verdict({ status: "blocked", blockers: [blocker("invalid_connection")] });
    expect(derive({ verdict: v }).stage).toBe("connecting");
  });

  it("an UNRESOLVED connection check (loading) stays in Connect — never configure on an unverified claim", () => {
    const v = verdict({
      status: "not_ready",
      blockers: [blocker("missing_required_field")],
    });
    const snap = derive({ verdict: v, connection: { state: "loading" } });
    expect(snap.stage).toBe("connecting");
    expect(snap.connectionUnresolved).toBe(true);
    expect(snap.connectionProviders).toHaveLength(0);
  });

  it("a connection resolve ERROR also stays in Connect (retry surface)", () => {
    expect(derive({ connection: { state: "error" } }).stage).toBe("connecting");
  });
});

describe("configure stage", () => {
  it("connections clean + missing fields → configuring", () => {
    const v = verdict({
      status: "not_ready",
      blockers: [blocker("missing_required_field", { nodeId: "n2", fieldPath: "channel" })],
    });
    expect(derive({ verdict: v }).stage).toBe("configuring");
  });

  it("an unresolved variable is configure work too", () => {
    const v = verdict({ status: "blocked", blockers: [blocker("unresolved_variable")] });
    expect(derive({ verdict: v }).stage).toBe("configuring");
  });

  it("a harder blocker (broken graph) alongside fields → blocked, not configuring", () => {
    const v = verdict({
      status: "blocked",
      blockers: [blocker("missing_required_field"), blocker("invalid_graph")],
    });
    const snap = derive({ verdict: v });
    expect(snap.stage).toBe("blocked");
    expect(snap.otherBlockers).toHaveLength(1);
  });
});

describe("test / activate stages", () => {
  it("clean + testable → ready_to_test", () => {
    expect(derive().stage).toBe("ready_to_test");
  });

  it("a running test → testing", () => {
    const v = verdict({ lastTestStatus: "running" });
    expect(derive({ verdict: v }).stage).toBe("testing");
  });

  it("verdict ready_to_activate (test passed) → ready_to_activate", () => {
    const v = verdict({ status: "ready_to_activate", lastTestStatus: "passed" });
    expect(derive({ verdict: v }).stage).toBe("ready_to_activate");
  });

  it("a failed test → blocked (test_failed is an other-blocker; retest lives there)", () => {
    const v = verdict({
      status: "blocked",
      lastTestStatus: "failed",
      blockers: [blocker("test_failed")],
    });
    const snap = derive({ verdict: v });
    expect(snap.stage).toBe("blocked");
    expect(snap.otherBlockers[0]!.kind).toBe("test_failed");
  });

  it("lifecycle conflict → blocked", () => {
    const v = verdict({ status: "blocked", blockers: [blocker("lifecycle_warning")] });
    expect(derive({ verdict: v }).stage).toBe("blocked");
  });
});

describe("reload derivability (journey 6 — no hidden stage state)", () => {
  it("the same inputs always derive the same stage", () => {
    const v = verdict({
      status: "blocked",
      blockers: [blocker("missing_connection", { nodeId: "n1" })],
    });
    const a = derive({ verdict: v, connection: RESOLVED_STRIPE_MISSING });
    const b = derive({ verdict: v, connection: RESOLVED_STRIPE_MISSING });
    expect(a).toEqual(b);
    expect(a.stage).toBe("connecting");
  });
});

describe("stepper mapping", () => {
  it("maps stages to steps", () => {
    expect(stepForStage("connecting")).toBe("connect");
    expect(stepForStage("configuring")).toBe("configure");
    expect(stepForStage("ready_to_test")).toBe("test");
    expect(stepForStage("testing")).toBe("test");
    expect(stepForStage("ready_to_activate")).toBe("activate");
    expect(stepForStage("complete")).toBe("activate");
    expect(stepForStage("blocked")).toBeNull();
    expect(stepForStage("creating")).toBeNull();
  });
});
