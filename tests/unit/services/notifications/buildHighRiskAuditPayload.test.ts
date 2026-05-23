/**
 * @jest-environment node
 *
 * Slice 3.POSTSEC-8 — tests for the pure high-risk-audit payload builder.
 *
 * The builder is the single choke point that decides what makes it
 * into `notifications.metadata`. These tests verify both the
 * documented inclusions AND — more importantly — the documented
 * exclusions. No DB, no fetch, no mocks: pure function in / out.
 */
import {
  buildHighRiskAuditPayload,
  type BuildHighRiskAuditPayloadInput,
  type HighRiskAuditMetadata,
} from "@/services/notifications/buildHighRiskAuditPayload";

const SAMPLE_ACTION = {
  nodeId: "refund-node",
  provider: "stripe",
  type: "create_refund",
  displayName: "Create Refund",
  riskDescription:
    "Reverses a Stripe charge — moves money back to the customer.",
} as const;

const BASE_INPUT: BuildHighRiskAuditPayloadInput = {
  eventType: "workflow_high_risk_activated",
  workflowId: "wf-1",
  workflowName: "Quarterly refunds",
  actorUserId: "user-1",
  confirmationRequiredActions: [SAMPLE_ACTION],
  emittedAt: "2026-05-24T10:00:00.000Z",
};

// ── eventType ↔ field pairing ──────────────────────────────────────────────
describe("buildHighRiskAuditPayload — eventType ↔ field pairing", () => {
  it("throws when workflow_high_risk_run is supplied without runId", () => {
    expect(() =>
      buildHighRiskAuditPayload({
        ...BASE_INPUT,
        eventType: "workflow_high_risk_run",
      }),
    ).toThrow(/workflow_high_risk_run requires runId/);
  });

  it("throws when workflow_high_risk_activated is supplied with a runId", () => {
    expect(() =>
      buildHighRiskAuditPayload({
        ...BASE_INPUT,
        eventType: "workflow_high_risk_activated",
        runId: "run-123",
      }),
    ).toThrow(/must not carry runId/);
  });

  it("accepts workflow_high_risk_activated with no runId", () => {
    expect(() => buildHighRiskAuditPayload(BASE_INPUT)).not.toThrow();
  });

  it("accepts workflow_high_risk_run with a runId", () => {
    expect(() =>
      buildHighRiskAuditPayload({
        ...BASE_INPUT,
        eventType: "workflow_high_risk_run",
        runId: "run-456",
        isTest: false,
        triggeredBy: "manual",
      }),
    ).not.toThrow();
  });
});

// ── inclusions ─────────────────────────────────────────────────────────────
describe("buildHighRiskAuditPayload — metadata includes the documented safe fields", () => {
  it("activation metadata carries the event type, ids, actor, timestamp, and actions", () => {
    const payload = buildHighRiskAuditPayload(BASE_INPUT);
    const md = payload.metadata;
    expect(md.eventType).toBe("workflow_high_risk_activated");
    expect(md.workflowId).toBe("wf-1");
    expect(md.workflowName).toBe("Quarterly refunds");
    expect(md.actorUserId).toBe("user-1");
    expect(md.emittedAt).toBe("2026-05-24T10:00:00.000Z");
    expect(md.confirmationRequiredActions).toHaveLength(1);
    expect(md.confirmationRequiredActions[0]).toEqual({
      nodeId: "refund-node",
      provider: "stripe",
      type: "create_refund",
      displayName: "Create Refund",
      riskDescription:
        "Reverses a Stripe charge — moves money back to the customer.",
    });
  });

  it("activation metadata does NOT carry runId / isTest / triggeredBy (none supplied)", () => {
    const payload = buildHighRiskAuditPayload(BASE_INPUT);
    expect(payload.metadata).not.toHaveProperty("runId");
    expect(payload.metadata).not.toHaveProperty("isTest");
    expect(payload.metadata).not.toHaveProperty("triggeredBy");
  });

  it("run metadata carries runId + isTest + triggeredBy", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      eventType: "workflow_high_risk_run",
      runId: "run-789",
      isTest: false,
      triggeredBy: "manual",
    });
    expect(payload.metadata.runId).toBe("run-789");
    expect(payload.metadata.isTest).toBe(false);
    expect(payload.metadata.triggeredBy).toBe("manual");
  });

  it("omits riskDescription from a per-action entry when the source action did not supply one", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      confirmationRequiredActions: [
        {
          nodeId: "n",
          provider: "gmail",
          type: "delete_email",
          displayName: "Delete Email",
          // no riskDescription
        },
      ],
    });
    expect(payload.metadata.confirmationRequiredActions[0]).toEqual({
      nodeId: "n",
      provider: "gmail",
      type: "delete_email",
      displayName: "Delete Email",
    });
    expect(payload.metadata.confirmationRequiredActions[0]).not.toHaveProperty(
      "riskDescription",
    );
  });
});

// ── exclusions / no-leak ───────────────────────────────────────────────────
describe("buildHighRiskAuditPayload — exclusions / no-leak", () => {
  it("re-projects each action defensively — extra fields on the source object are dropped", () => {
    // The source type is `ConfirmationRequiredAction` whose shape is
    // route-safe today, but the builder must NOT trust the input
    // verbatim. If a caller passes an object with extra fields (e.g.
    // accidentally spreading the full WorkflowNode), those fields
    // must not leak through.
    const dangerousAction = {
      nodeId: "refund-node",
      provider: "stripe",
      type: "create_refund",
      displayName: "Create Refund",
      riskDescription: "Reverses a Stripe charge.",
      // Things that MUST NEVER leak — pretend a buggy caller passed them.
      config: { chargeId: "ch_secret_super_sensitive" },
      resolvedValues: { amount: 9999 },
      stripeObjectId: "re_1A2B3C",
    } as unknown as import("@/services/workflows/riskConfirmation").ConfirmationRequiredAction;
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      confirmationRequiredActions: [dangerousAction],
    });
    const text = JSON.stringify(payload.metadata);
    expect(text).not.toContain("ch_secret_super_sensitive");
    expect(text).not.toContain("re_1A2B3C");
    expect(text).not.toContain("amount");
    expect(text).not.toContain("config");
    expect(text).not.toContain("resolvedValues");
    expect(text).not.toContain("stripeObjectId");
    // But the projected fields DO survive.
    expect(text).toContain("refund-node");
    expect(text).toContain("Create Refund");
  });

  it("does not include any provider-derived response data or workflow config in title / body / metadata", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      workflowName: "Workflow with ch_secret_X in the name",
      confirmationRequiredActions: [
        {
          ...SAMPLE_ACTION,
          riskDescription: "Safe text — no secrets here.",
        },
      ],
    });
    const text = JSON.stringify(payload);
    // Workflow name itself is intentionally surfaced (the owner needs
    // to know which workflow tripped the audit). We don't sanitize
    // names — the title / body show the literal name. But the metadata
    // MUST NOT introduce any new sources of leaky data beyond the name.
    expect(text).toContain("Workflow with ch_secret_X in the name");
    // No config / resolved / provider response surface in the metadata.
    expect(payload.metadata).not.toHaveProperty("config");
    expect(payload.metadata).not.toHaveProperty("resolvedValues");
    expect(payload.metadata).not.toHaveProperty("response");
    expect(payload.metadata).not.toHaveProperty("draftDefinition");
  });

  it("metadata shape contains ONLY the documented top-level keys", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      eventType: "workflow_high_risk_run",
      runId: "run-1",
      isTest: false,
      triggeredBy: "manual",
    });
    const allowedKeys = new Set<keyof HighRiskAuditMetadata>([
      "eventType",
      "workflowId",
      "workflowName",
      "actorUserId",
      "runId",
      "isTest",
      "triggeredBy",
      "emittedAt",
      "confirmationRequiredActions",
    ]);
    for (const key of Object.keys(payload.metadata)) {
      expect(allowedKeys.has(key as keyof HighRiskAuditMetadata)).toBe(true);
    }
  });
});

// ── name sanitization ──────────────────────────────────────────────────────
describe("buildHighRiskAuditPayload — workflow name sanitization", () => {
  it("trims whitespace from the workflow name", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      workflowName: "  Padded name  ",
    });
    expect(payload.metadata.workflowName).toBe("Padded name");
    expect(payload.body).toContain("Padded name");
  });

  it("falls back to a placeholder when the workflow name is empty / whitespace", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      workflowName: "   ",
    });
    expect(payload.metadata.workflowName).toBe("(unnamed workflow)");
    expect(payload.body).toContain("(unnamed workflow)");
  });
});

// ── copy ───────────────────────────────────────────────────────────────────
describe("buildHighRiskAuditPayload — title / body copy", () => {
  it("activation title is human-readable + matches the event", () => {
    const payload = buildHighRiskAuditPayload(BASE_INPUT);
    expect(payload.title).toBe("High-risk workflow activated");
    expect(payload.body).toMatch(/Quarterly refunds/);
    expect(payload.body).toMatch(/after typed confirmation/);
    expect(payload.body).toMatch(/1 action/);
  });

  it("run title says 'High-risk workflow run' and body says 'ran manually'", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      eventType: "workflow_high_risk_run",
      runId: "run-1",
      isTest: false,
      triggeredBy: "manual",
    });
    expect(payload.title).toBe("High-risk workflow run");
    expect(payload.body).toMatch(/ran manually/);
  });

  it("pluralizes the action count correctly", () => {
    const payload = buildHighRiskAuditPayload({
      ...BASE_INPUT,
      confirmationRequiredActions: [
        SAMPLE_ACTION,
        { ...SAMPLE_ACTION, nodeId: "n2" },
        { ...SAMPLE_ACTION, nodeId: "n3" },
      ],
    });
    expect(payload.body).toMatch(/3 actions/);
  });
});
