/**
 * @jest-environment node
 *
 * Slice 3.SEC-2 — tests for services/execution/testModeGate.ts.
 *
 * The gate is the single decision function the engine consults before
 * invoking a handler in test mode. Tested in isolation via the
 * `decideTestModeBlockWith` variant that takes an injected meta resolver
 * so we don't have to mock the entire discovery registry.
 */

import type { ActionMeta } from "@/contracts/actionMeta";
import {
  buildTestModeMockOutput,
  decideTestModeBlock,
  decideTestModeBlockWith,
} from "@/services/execution/testModeGate";

function meta(overrides: Partial<ActionMeta>): ActionMeta {
  // Minimal valid ActionMeta. Tests mutate the risk-related fields only.
  return {
    key: "test:placeholder",
    provider: "test",
    type: "placeholder",
    displayName: "Placeholder",
    description: "x",
    category: "other",
    requiresIntegration: false,
    fields: [],
    outputs: [],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: null,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
    ...overrides,
  };
}

function resolver(...metas: ActionMeta[]): (key: string) => ActionMeta | undefined {
  const byKey = new Map(metas.map((m) => [m.key, m]));
  return (key) => byKey.get(key);
}

describe("decideTestModeBlockWith — fail-closed on missing meta", () => {
  it("blocks an action whose meta is not registered (unknown action)", () => {
    const decision = decideTestModeBlockWith("ghost", "noop", resolver());
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_UNKNOWN_ACTION_BLOCKED");
  });
});

describe("decideTestModeBlockWith — destructive / confirmation defense-in-depth", () => {
  it("blocks isDestructive with the DESTRUCTIVE reason code", () => {
    const m = meta({
      key: "stripe:create_refund",
      provider: "stripe",
      type: "create_refund",
      requiresIntegration: true,
      isDestructive: true,
      requiresConfirmation: true,
      riskLevel: "high",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_DESTRUCTIVE_BLOCKED");
  });

  it("blocks requiresConfirmation (non-destructive) with the CONFIRMATION reason code", () => {
    // Synthetic case for symmetry: requiresConfirmation without
    // isDestructive shouldn't exist in production metas, but the gate
    // still reports the correct reason if it does.
    const m = meta({
      key: "stripe:hypothetical_confirm_only",
      provider: "stripe",
      type: "hypothetical_confirm_only",
      requiresIntegration: true,
      requiresConfirmation: true,
      riskLevel: "high",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_CONFIRMATION_REQUIRED_BLOCKED");
  });
});

describe("decideTestModeBlockWith — high-risk gate", () => {
  it("blocks high-risk action that is NOT destructive (create_payment_intent shape)", () => {
    const m = meta({
      key: "stripe:create_payment_intent",
      provider: "stripe",
      type: "create_payment_intent",
      requiresIntegration: true,
      riskLevel: "high",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_HIGH_RISK_BLOCKED");
  });

  it("blocks native:http_request even though it requiresIntegration=false", () => {
    const m = meta({
      key: "native:http_request",
      provider: "native",
      type: "http_request",
      requiresIntegration: false,
      riskLevel: "high",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_HIGH_RISK_BLOCKED");
  });
});

describe("decideTestModeBlockWith — external-integration gate", () => {
  it("blocks any external-integration action even when riskLevel is medium", () => {
    const m = meta({
      key: "gmail:send_email",
      provider: "gmail",
      type: "send_email",
      requiresIntegration: true,
      riskLevel: "medium",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_EXTERNAL_ACTION_BLOCKED");
  });

  it("blocks an external-integration action even when riskLevel is low (a read)", () => {
    // Reads are still blocked — they consume rate limits and bleed real
    // provider data into test runs.
    const m = meta({
      key: "gmail:search_emails",
      provider: "gmail",
      type: "search_emails",
      requiresIntegration: true,
      riskLevel: "low",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_EXTERNAL_ACTION_BLOCKED");
  });
});

describe("decideTestModeBlockWith — allowed actions", () => {
  it("allows native logic actions (no integration, low risk)", () => {
    const m = meta({
      key: "native:if_then_condition",
      provider: "native",
      type: "if_then_condition",
      requiresIntegration: false,
      riskLevel: "low",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(false);
    expect(decision.reason).toBeUndefined();
  });

  it("allows native:format_transformer (pure transform)", () => {
    const m = meta({
      key: "native:format_transformer",
      provider: "native",
      type: "format_transformer",
    });
    const decision = decideTestModeBlockWith(m.provider, m.type, resolver(m));
    expect(decision.blocked).toBe(false);
  });
});

describe("decideTestModeBlock — production wiring", () => {
  // Smoke-test that the production variant talks to the real discovery
  // registry. Uses the well-known native:format_transformer (low-risk,
  // no integration) which the registry guarantees is present.
  it("allows native:format_transformer through the real discovery registry", () => {
    const decision = decideTestModeBlock("native", "format_transformer");
    expect(decision.blocked).toBe(false);
  });

  it("blocks native:http_request through the real discovery registry", () => {
    const decision = decideTestModeBlock("native", "http_request");
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_HIGH_RISK_BLOCKED");
  });

  it("blocks stripe:create_refund through the real discovery registry", () => {
    const decision = decideTestModeBlock("stripe", "create_refund");
    expect(decision.blocked).toBe(true);
    // create_refund is BOTH destructive AND requires confirmation; the
    // gate returns DESTRUCTIVE because that check comes first.
    expect(decision.reason).toBe("TEST_MODE_DESTRUCTIVE_BLOCKED");
  });

  it("blocks stripe:create_payment_intent (high-risk, NOT destructive — safety regression guard)", () => {
    const decision = decideTestModeBlock("stripe", "create_payment_intent");
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe("TEST_MODE_HIGH_RISK_BLOCKED");
  });
});

describe("buildTestModeMockOutput", () => {
  it("returns the deterministic shape: testMode + actionSkipped + reason + provider + type", () => {
    const out = buildTestModeMockOutput("stripe", "create_refund", "TEST_MODE_DESTRUCTIVE_BLOCKED");
    expect(out).toEqual({
      testMode: true,
      actionSkipped: true,
      reason: "TEST_MODE_DESTRUCTIVE_BLOCKED",
      provider: "stripe",
      type: "create_refund",
    });
  });

  it("does NOT include fabricated provider ids that could be confused with real values", () => {
    const out = buildTestModeMockOutput("stripe", "create_refund", "TEST_MODE_DESTRUCTIVE_BLOCKED");
    expect(out).not.toHaveProperty("refundId");
    expect(out).not.toHaveProperty("paymentIntentId");
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("amount");
  });
});
