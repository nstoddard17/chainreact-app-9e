/**
 * @jest-environment node
 *
 * Slice 3.SEC-4B — unit tests for the destructive-action enumerator.
 *
 * Lets the real discovery registry run (registries are pure, no
 * network / DB; module-load Zod parsing guarantees well-formedness).
 * This gives end-to-end coverage of the
 * (workflow node → action meta → confirmation decision) pipeline
 * for the production-shipped Stripe / Gmail / Outlook / Slack metas.
 *
 * The helper is pure (`services/workflows/riskConfirmation.ts`) — no
 * mocking required.
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import {
  REQUIRED_CONFIRMATION_TEXT,
  findConfirmationRequiredActions,
  isValidConfirmationText,
} from "@/services/workflows/riskConfirmation";

function actionNode(opts: {
  id: string;
  provider: string;
  type: string;
}): WorkflowNode {
  return {
    id: opts.id,
    kind: "action",
    provider: opts.provider,
    type: opts.type,
    config: {},
    position: { x: 0, y: 0 },
  };
}

function triggerNode(opts: {
  id: string;
  provider: string;
  type: string;
}): WorkflowNode {
  return {
    id: opts.id,
    kind: "trigger",
    provider: opts.provider,
    type: opts.type,
    config: {},
    position: { x: 0, y: 0 },
  };
}

// ─── empty / trivial workflows ──────────────────────────────────────────────

describe("findConfirmationRequiredActions — trivial cases", () => {
  it("returns no actions for an empty node list", () => {
    const result = findConfirmationRequiredActions([]);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.actions).toEqual([]);
    expect(result.confirmationText).toBe(REQUIRED_CONFIRMATION_TEXT);
  });

  it("ignores trigger nodes", () => {
    const result = findConfirmationRequiredActions([
      triggerNode({
        id: "t1",
        provider: "native",
        type: "manual.run",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.actions).toEqual([]);
  });

  it("returns confirmationText = 'CONFIRM' always (stable contract)", () => {
    const result = findConfirmationRequiredActions([]);
    expect(result.confirmationText).toBe("CONFIRM");
  });
});

// ─── destructive Stripe actions ─────────────────────────────────────────────

describe("findConfirmationRequiredActions — destructive Stripe actions", () => {
  it("flags stripe:create_refund (isDestructive + requiresConfirmation, riskLevel high)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "stripe", type: "create_refund" }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.nodeId).toBe("n1");
    expect(result.actions[0]!.provider).toBe("stripe");
    expect(result.actions[0]!.type).toBe("create_refund");
    expect(result.actions[0]!.displayName).toBe("Create Refund");
    expect(result.actions[0]!.riskDescription).toBeDefined();
  });

  it("flags stripe:capture_payment_intent", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n2",
        provider: "stripe",
        type: "capture_payment_intent",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.type).toBe("capture_payment_intent");
  });

  it("flags stripe:cancel_subscription", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n3",
        provider: "stripe",
        type: "cancel_subscription",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.type).toBe("cancel_subscription");
  });
});

// ─── destructive Gmail / Outlook / Slack / Notion actions ───────────────────

describe("findConfirmationRequiredActions — destructive provider actions", () => {
  it("flags gmail:delete_email", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "gmail", type: "delete_email" }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.provider).toBe("gmail");
    expect(result.actions[0]!.type).toBe("delete_email");
  });

  it("flags microsoft-outlook:delete_email", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n1",
        provider: "microsoft-outlook",
        type: "delete_email",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.provider).toBe("microsoft-outlook");
  });

  it("flags slack:delete_message", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "slack", type: "delete_message" }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.provider).toBe("slack");
    expect(result.actions[0]!.type).toBe("delete_message");
  });
});

// ─── read-only / low-risk actions are NOT flagged ───────────────────────────

describe("findConfirmationRequiredActions — read-only / low-risk pass-through", () => {
  it("does NOT flag stripe:find_customer (riskLevel low, read-only)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "stripe", type: "find_customer" }),
    ]);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.actions).toEqual([]);
  });

  it("does NOT flag stripe:get_payments", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "stripe", type: "get_payments" }),
    ]);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("does NOT flag gmail:send_email (medium risk, not destructive)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "gmail", type: "send_email" }),
    ]);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("does NOT flag native:delay (low risk)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "native", type: "delay" }),
    ]);
    expect(result.requiresConfirmation).toBe(false);
  });
});

// ─── high-risk non-destructive: NOT flagged in v1 ───────────────────────────

describe("findConfirmationRequiredActions — high-risk-only actions (POSTSEC-3 policy)", () => {
  // Slice 3.POSTSEC-3 — flipped. The 5 Stripe money-moving actions now
  // carry `requiresConfirmation: true` even though they remain
  // `isDestructive: false` (they have a reversible second-action path).
  // Their workflows therefore DO require typed confirmation at
  // activation + real Run-now. native:http_request remains
  // high-risk-only / non-destructive / non-confirm (a single egress
  // request is not by itself irreversible enough to warrant friction;
  // the egress denylist + redaction stack is the mitigation).
  it("flags stripe:create_payment_intent (POSTSEC-3 requiresConfirmation:true; reversible via Cancel before capture)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n1",
        provider: "stripe",
        type: "create_payment_intent",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.type).toBe("create_payment_intent");
    expect(result.actions[0]!.riskDescription).toBeDefined();
  });

  it("flags stripe:confirm_payment_intent (POSTSEC-3 requiresConfirmation:true; triggers real charge attempt)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n1",
        provider: "stripe",
        type: "confirm_payment_intent",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.type).toBe("confirm_payment_intent");
  });

  it("flags stripe:create_subscription (POSTSEC-3 requiresConfirmation:true; starts recurring billing)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n1",
        provider: "stripe",
        type: "create_subscription",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.type).toBe("create_subscription");
  });

  it("flags stripe:update_subscription (POSTSEC-3 requiresConfirmation:true; proration may trigger immediate charge)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n1",
        provider: "stripe",
        type: "update_subscription",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.type).toBe("update_subscription");
  });

  it("flags stripe:create_invoice (POSTSEC-3 requiresConfirmation:true; default autoAdvance finalizes + collects)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({
        id: "n1",
        provider: "stripe",
        type: "create_invoice",
      }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.type).toBe("create_invoice");
  });

  it("does NOT flag native:http_request (riskLevel high, generic egress, but not destructive and not requiresConfirmation)", () => {
    // Egress is high-risk for data exfil but firing one request is not
    // by itself irreversible. SEC-3 denylist mitigates the actual
    // attack surface; confirmation friction here would over-block.
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "native", type: "http_request" }),
    ]);
    expect(result.requiresConfirmation).toBe(false);
  });
});

// ─── multi-action workflows ─────────────────────────────────────────────────

describe("findConfirmationRequiredActions — multi-action workflows", () => {
  it("flags only the destructive nodes (mixed read + destructive)", () => {
    const result = findConfirmationRequiredActions([
      triggerNode({ id: "t1", provider: "native", type: "manual.run" }),
      actionNode({ id: "n1", provider: "stripe", type: "find_customer" }),
      actionNode({ id: "n2", provider: "stripe", type: "create_refund" }),
      actionNode({ id: "n3", provider: "gmail", type: "send_email" }),
      actionNode({ id: "n4", provider: "gmail", type: "delete_email" }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions).toHaveLength(2);
    const ids = result.actions.map((a) => a.nodeId).sort();
    expect(ids).toEqual(["n2", "n4"]);
  });

  it("preserves node order in actions array (stable for UI rendering)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "first", provider: "stripe", type: "create_refund" }),
      actionNode({
        id: "second",
        provider: "stripe",
        type: "cancel_subscription",
      }),
    ]);
    expect(result.actions.map((a) => a.nodeId)).toEqual(["first", "second"]);
  });
});

// ─── fail-closed: unknown action meta ───────────────────────────────────────

describe("findConfirmationRequiredActions — fail-closed defaults", () => {
  it("treats unknown provider:type as confirmation-required", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "ghost", type: "noop" }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.nodeId).toBe("n1");
    expect(result.actions[0]!.displayName).toBe("ghost:noop");
    expect(result.actions[0]!.riskDescription).toMatch(/unavailable/i);
  });

  it("treats empty provider as confirmation-required (unconfigured action)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "", type: "send_email" }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.displayName).toBe("Unconfigured action");
  });

  it("treats empty type as confirmation-required (unconfigured action)", () => {
    const result = findConfirmationRequiredActions([
      actionNode({ id: "n1", provider: "stripe", type: "" }),
    ]);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actions[0]!.displayName).toBe("Unconfigured action");
    expect(result.actions[0]!.riskDescription).toMatch(/incomplete/i);
  });
});

// ─── response shape — no leaky fields ───────────────────────────────────────

describe("findConfirmationRequiredActions — response shape is route-safe", () => {
  it("returned action descriptors never include config, params, or resolved values", () => {
    const result = findConfirmationRequiredActions([
      {
        id: "n1",
        kind: "action",
        provider: "stripe",
        type: "create_refund",
        config: {
          chargeId: "ch_secret_1",
          reason: "fraud",
          metadata: { internal: "do-not-leak" },
        },
        position: { x: 0, y: 0 },
      },
    ]);
    expect(result.requiresConfirmation).toBe(true);
    const action = result.actions[0]!;
    const keys = Object.keys(action);
    expect(keys).toEqual(
      expect.arrayContaining(["nodeId", "provider", "type", "displayName"]),
    );
    // Strictly: only nodeId / provider / type / displayName / riskDescription.
    for (const k of keys) {
      expect([
        "nodeId",
        "provider",
        "type",
        "displayName",
        "riskDescription",
      ]).toContain(k);
    }
    // Sanity — no config/metadata/IDs leaked.
    expect(JSON.stringify(action)).not.toContain("ch_secret_1");
    expect(JSON.stringify(action)).not.toContain("do-not-leak");
  });
});

// ─── isValidConfirmationText ────────────────────────────────────────────────

describe("isValidConfirmationText", () => {
  it("accepts the literal 'CONFIRM'", () => {
    expect(isValidConfirmationText("CONFIRM")).toBe(true);
  });

  it("accepts surrounding whitespace (paste-friendly)", () => {
    expect(isValidConfirmationText("  CONFIRM  ")).toBe(true);
    expect(isValidConfirmationText("\nCONFIRM\n")).toBe(true);
  });

  it("rejects case mismatch (case sensitive)", () => {
    expect(isValidConfirmationText("confirm")).toBe(false);
    expect(isValidConfirmationText("Confirm")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidConfirmationText("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidConfirmationText(undefined)).toBe(false);
  });

  it("rejects non-string types (defensive — Zod gate catches before this)", () => {
    expect(isValidConfirmationText(true as unknown as string)).toBe(false);
    expect(isValidConfirmationText(123 as unknown as string)).toBe(false);
  });

  it("rejects partial matches", () => {
    expect(isValidConfirmationText("CONFIRM!")).toBe(false);
    expect(isValidConfirmationText("CONFIRMED")).toBe(false);
  });
});
