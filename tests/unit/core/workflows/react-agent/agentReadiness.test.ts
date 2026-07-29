import {
  computeAgentReadiness,
  type AgentConnectionSignal,
  type ComputeAgentReadinessInput,
  type ReadinessValidationIssue,
} from "@/core/workflows/agentReadiness";

/**
 * REACT-AGENT-READINESS-1 — the readiness verdict is the single answer to "what is
 * left before this workflow can run?". These tests pin the business rules that
 * matter: it never claims ready-to-test / ready-to-activate unless validation,
 * connection, lifecycle, and test state ALL support it, it groups blockers by kind
 * with a next step, and it leaks no config values / secrets / tokens.
 */

const RESOLVED_OK: AgentConnectionSignal = {
  state: "resolved",
  providers: [
    { provider: "gmail", name: "Gmail", nodeIds: ["n2"], state: "connected", canReconnect: true },
  ],
  allConnected: true,
};

function baseInput(over: Partial<ComputeAgentReadinessInput> = {}): ComputeAgentReadinessInput {
  return {
    active: true,
    validationIssues: [],
    triggerChanged: false,
    workflowActive: false,
    canTest: true,
    connection: RESOLVED_OK,
    lastTestStatus: "not_tested",
    ...over,
  };
}

const missingField: ReadinessValidationIssue = {
  code: "missing_required_field",
  severity: "error",
  message: "Gmail needs a To.",
  nodeId: "n2",
  fieldName: "to",
};

describe("computeAgentReadiness — status verdict", () => {
  it("returns unknown when no change is being reviewed (inactive)", () => {
    const v = computeAgentReadiness(baseInput({ active: false }));
    expect(v.status).toBe("unknown");
    expect(v.blockers).toHaveLength(0);
  });

  it("is not_ready (setup-only) when the only blockers are missing required fields", () => {
    const v = computeAgentReadiness(baseInput({ validationIssues: [missingField] }));
    expect(v.status).toBe("not_ready");
    expect(v.blockers).toHaveLength(1);
    expect(v.blockers[0]!.kind).toBe("missing_required_field");
    expect(v.blockers[0]!.nodeId).toBe("n2");
    expect(v.blockers[0]!.nextStep).toMatch(/required field/i);
    expect(v.nextActions).toContain("fill_missing_fields");
  });

  it("is blocked (not merely not_ready) when a graph structure issue exists", () => {
    const v = computeAgentReadiness(
      baseInput({
        validationIssues: [
          { code: "no_trigger", severity: "error", message: "Add a trigger to your workflow." },
        ],
      }),
    );
    expect(v.status).toBe("blocked");
    expect(v.blockers[0]!.kind).toBe("invalid_graph");
    expect(v.nextActions).toContain("review_changes");
  });

  it("treats a broken variable reference as a blocking unresolved_variable", () => {
    const v = computeAgentReadiness(
      baseInput({
        validationIssues: [
          {
            code: "broken_variable_reference",
            severity: "warning",
            message: "Send email uses data from a step that no longer exists.",
            nodeId: "n3",
            fieldName: "body",
          },
        ],
      }),
    );
    expect(v.status).toBe("blocked");
    expect(v.blockers[0]!.kind).toBe("unresolved_variable");
    expect(v.blockers[0]!.blocking).toBe(true);
    expect(v.nextActions).toContain("resolve_variables");
  });

  it("is ready_to_test when nothing blocks, connections are verified, and the workflow is testable", () => {
    const v = computeAgentReadiness(baseInput({ lastTestStatus: "not_tested" }));
    expect(v.status).toBe("ready_to_test");
    expect(v.nextActions).toContain("test_workflow");
    expect(v.summary).toMatch(/connections are ready/i);
  });

  it("does NOT reach ready_to_activate until the change's test has passed", () => {
    const untested = computeAgentReadiness(baseInput({ lastTestStatus: "not_tested" }));
    expect(untested.status).toBe("ready_to_test");
    const passed = computeAgentReadiness(baseInput({ lastTestStatus: "passed" }));
    expect(passed.status).toBe("ready_to_activate");
    expect(passed.nextActions).toContain("activate_workflow");
  });

  it("blocks on a failed test even when fields and connections are fine", () => {
    const v = computeAgentReadiness(baseInput({ lastTestStatus: "failed" }));
    expect(v.status).toBe("blocked");
    expect(v.blockers.some((b) => b.kind === "test_failed")).toBe(true);
    expect(v.nextActions).toContain("retest_after_fix");
  });

  it("caps a trigger change on an active workflow below activate (needs reactivate/resume)", () => {
    const v = computeAgentReadiness(
      baseInput({ workflowActive: true, triggerChanged: true, lastTestStatus: "passed" }),
    );
    expect(v.status).toBe("blocked");
    expect(v.blockers.some((b) => b.kind === "lifecycle_warning")).toBe(true);
  });
});

describe("computeAgentReadiness — connection signal", () => {
  it("surfaces a missing connection as a blocking connect_app blocker", () => {
    const v = computeAgentReadiness(
      baseInput({
        connection: {
          state: "resolved",
          allConnected: false,
          providers: [
            { provider: "gmail", name: "Gmail", nodeIds: ["n2", "n4"], state: "missing", canReconnect: true },
          ],
        },
      }),
    );
    expect(v.status).toBe("blocked");
    const blocker = v.blockers.find((b) => b.kind === "missing_connection")!;
    expect(blocker.message).toContain("Gmail");
    expect(blocker.nextStep).toMatch(/connect gmail/i);
    expect(v.nextActions).toContain("connect_app");
  });

  it("offers reconnect only when the user may reconnect", () => {
    const canReconnect = computeAgentReadiness(
      baseInput({
        connection: {
          state: "resolved",
          allConnected: false,
          providers: [
            { provider: "slack", name: "Slack", nodeIds: ["n1"], state: "invalid", canReconnect: true, reasonCode: "needs_reconnect" },
          ],
        },
      }),
    );
    expect(canReconnect.blockers[0]!.nextStep).toMatch(/reconnect slack/i);

    const cannot = computeAgentReadiness(
      baseInput({
        connection: {
          state: "resolved",
          allConnected: false,
          providers: [
            { provider: "slack", name: "Slack", nodeIds: ["n1"], state: "invalid", canReconnect: false, reasonCode: "needs_reconnect" },
          ],
        },
      }),
    );
    expect(cannot.blockers[0]!.nextStep).toMatch(/owner to reconnect/i);
  });

  it("never claims ready_to_activate while connection resolution is still loading", () => {
    const v = computeAgentReadiness(
      baseInput({ connection: { state: "loading" }, lastTestStatus: "passed" }),
    );
    expect(v.status).not.toBe("ready_to_activate");
    // testable → invite a test; the test exercises the connection.
    expect(v.status).toBe("ready_to_test");
    expect(v.warnings.some((w) => /checking app connections/i.test(w.message))).toBe(true);
  });

  it("allows ready_to_activate for a non-testable workflow once connections are verified", () => {
    const v = computeAgentReadiness(
      baseInput({ canTest: false, lastTestStatus: "not_tested" }),
    );
    expect(v.status).toBe("ready_to_activate");
  });

  it("skips connection gating on the logged-out local-only builder (disabled)", () => {
    const v = computeAgentReadiness(
      baseInput({ connection: { state: "disabled" }, canTest: false, lastTestStatus: "not_tested" }),
    );
    expect(v.status).toBe("ready_to_activate");
  });
});

describe("computeAgentReadiness — no-leak", () => {
  it("never embeds config values / secrets / tokens in any blocker text", () => {
    // Inputs that carry only labels/codes — assert the verdict text stays clean.
    const v = computeAgentReadiness(
      baseInput({
        validationIssues: [missingField],
        connection: {
          state: "resolved",
          allConnected: false,
          providers: [
            { provider: "gmail", name: "Gmail", nodeIds: ["n2"], state: "invalid", canReconnect: true, reasonCode: "token_expired" },
          ],
        },
      }),
    );
    const blob = JSON.stringify(v).toLowerCase();
    // Sanity: the secret-shaped strings a real config might hold must never appear.
    for (const forbidden of ["token", "bearer", "secret", "password", "access_token", "refresh"]) {
      // "token_expired" reason is mapped to friendly prose ("the connection expired"),
      // so even the reasonCode word must not survive into the rendered text.
      expect(blob).not.toContain(forbidden);
    }
  });
});
