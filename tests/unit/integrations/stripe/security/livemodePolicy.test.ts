/**
 * @jest-environment node
 *
 * Slice 3.SEC-14 — tests for the Stripe livemode policy.
 *
 * Covers:
 *   - `extractStripeLivemode` normalization (boolean / null / wrong-type
 *     / missing keys).
 *   - `evaluateStripeLivemodePolicy` decision matrix — all
 *     (runTestMode × livemode × actionRiskLevel) combinations the
 *     module documents.
 *   - `stripeLivemodePreflight` resolves risk level via the discovery
 *     registry, throws `StripeLivemodePolicyError` on deny, and is a
 *     no-op on allow.
 *
 * SEC-2 already blocks `requiresIntegration: true` actions in test
 * mode before the handler is invoked, so the test-mode policy
 * decisions are defense-in-depth. The tests still exercise them so
 * a future regression that lets a Stripe handler past SEC-2 trips a
 * loud deny here instead of silently calling Stripe.
 */
import type { IntegrationRecord } from "@/repositories/integrations";
import {
  StripeLivemodePolicyError,
  evaluateStripeLivemodePolicy,
  extractStripeLivemode,
  stripeLivemodePreflight,
} from "@/integrations/stripe/security/livemodePolicy";

// Mock the discovery registry so the preflight tests don't pay the
// startup cost of importing every action's meta. The pure-helper
// tests don't go through the registry at all.
const mockGetActionMeta = jest.fn();
jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: (key: string) => mockGetActionMeta(key),
}));

beforeEach(() => {
  mockGetActionMeta.mockReset();
});

function makeIntegration(
  metadata: Record<string, unknown>,
): IntegrationRecord {
  return {
    id: "int-1",
    accountId: "acct-user-1",
    connectedByUserId: "user-1",
    provider: "stripe",
    providerAccountId: "acct_TEST",
    displayName: "Acct test",
    accessTokenEncrypted: "ENC-tok",
    refreshTokenEncrypted: "ENC-refresh",
    accessTokenExpiresAt: null,
    scopes: ["read_write"],
    accountMetadata: metadata,
    disconnectedAt: null,
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
  };
}

// ─── extractStripeLivemode ──────────────────────────────────────────────────

describe("extractStripeLivemode", () => {
  it("returns true when metadata.livemode is boolean true", () => {
    expect(extractStripeLivemode({ livemode: true })).toBe(true);
  });

  it("returns false when metadata.livemode is boolean false", () => {
    expect(extractStripeLivemode({ livemode: false })).toBe(false);
  });

  it("returns null when metadata.livemode is missing", () => {
    expect(extractStripeLivemode({})).toBeNull();
  });

  it("returns null when metadata.livemode is null", () => {
    expect(extractStripeLivemode({ livemode: null })).toBeNull();
  });

  it("returns null when metadata.livemode is a string (non-boolean)", () => {
    // Defensive against schema drift — a jsonb column could carry the
    // string "true" from a buggy migration; we MUST NOT coerce it.
    expect(extractStripeLivemode({ livemode: "true" })).toBeNull();
  });

  it("returns null when metadata.livemode is a number", () => {
    expect(extractStripeLivemode({ livemode: 1 })).toBeNull();
  });

  it("preserves null even when other metadata keys are present", () => {
    expect(
      extractStripeLivemode({
        stripeUserId: "acct_X",
        stripePublishableKey: "pk_test_xxx",
      }),
    ).toBeNull();
  });
});

// ─── evaluateStripeLivemodePolicy: test-mode runs ───────────────────────────

describe("evaluateStripeLivemodePolicy — test-mode runs (defense-in-depth)", () => {
  it("denies when livemode=true and runTestMode=true (high-risk)", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: { livemode: true },
      runTestMode: true,
      actionRiskLevel: "high",
      actionKey: "stripe:create_payment_intent",
    });
    expect(decision.outcome).toBe("deny");
    expect(decision.reason).toBe("STRIPE_LIVEMODE_TEST_MODE_BLOCKED");
    expect(decision.livemode).toBe(true);
    expect(decision.message).toMatch(/test-mode/i);
    expect(decision.message).toMatch(/stripe:create_payment_intent/);
  });

  it("denies when livemode=false and runTestMode=true (defense-in-depth still applies)", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: { livemode: false },
      runTestMode: true,
      actionRiskLevel: "high",
      actionKey: "stripe:create_payment_intent",
    });
    expect(decision.outcome).toBe("deny");
    expect(decision.reason).toBe("STRIPE_LIVEMODE_TEST_MODE_BLOCKED");
    expect(decision.livemode).toBe(false);
  });

  it("denies when livemode=null and runTestMode=true", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: {},
      runTestMode: true,
      actionRiskLevel: "low",
      actionKey: "stripe:find_customer",
    });
    expect(decision.outcome).toBe("deny");
    expect(decision.reason).toBe("STRIPE_LIVEMODE_TEST_MODE_BLOCKED");
    expect(decision.livemode).toBeNull();
  });

  it("test-mode deny applies regardless of action risk level", () => {
    for (const riskLevel of ["low", "medium", "high"] as const) {
      const decision = evaluateStripeLivemodePolicy({
        accountMetadata: { livemode: true },
        runTestMode: true,
        actionRiskLevel: riskLevel,
        actionKey: `stripe:test_${riskLevel}`,
      });
      expect(decision.outcome).toBe("deny");
      expect(decision.reason).toBe("STRIPE_LIVEMODE_TEST_MODE_BLOCKED");
    }
  });
});

// ─── evaluateStripeLivemodePolicy: real-mode runs ───────────────────────────

describe("evaluateStripeLivemodePolicy — real-mode runs", () => {
  it("allows live Stripe integration for high-risk write", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: { livemode: true },
      runTestMode: false,
      actionRiskLevel: "high",
      actionKey: "stripe:create_payment_intent",
    });
    expect(decision.outcome).toBe("allow");
    expect(decision.reason).toBeUndefined();
    expect(decision.livemode).toBe(true);
    expect(decision.message).toMatch(/live/i);
  });

  it("allows test Stripe integration for high-risk write (provenance preserved)", () => {
    // Real-mode workflow run against a test Stripe key — V2 has no
    // workflow-environment concept yet, so this is allowed. The
    // decision's `message` carries the provenance for downstream
    // logging.
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: { livemode: false },
      runTestMode: false,
      actionRiskLevel: "high",
      actionKey: "stripe:create_payment_intent",
    });
    expect(decision.outcome).toBe("allow");
    expect(decision.livemode).toBe(false);
    expect(decision.message).toMatch(/test mode/i);
  });

  it("DENIES high-risk write when livemode is unknown", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: {},
      runTestMode: false,
      actionRiskLevel: "high",
      actionKey: "stripe:create_payment_intent",
    });
    expect(decision.outcome).toBe("deny");
    expect(decision.reason).toBe("STRIPE_LIVEMODE_UNKNOWN");
    expect(decision.livemode).toBeNull();
    expect(decision.message).toMatch(/unknown/i);
    expect(decision.message).toMatch(/reconnect/i);
    expect(decision.message).toMatch(/stripe:create_payment_intent/);
  });

  it("allows medium-risk action when livemode is unknown", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: {},
      runTestMode: false,
      actionRiskLevel: "medium",
      actionKey: "stripe:create_customer",
    });
    expect(decision.outcome).toBe("allow");
    expect(decision.livemode).toBeNull();
  });

  it("allows low-risk read when livemode is unknown", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: {},
      runTestMode: false,
      actionRiskLevel: "low",
      actionKey: "stripe:find_customer",
    });
    expect(decision.outcome).toBe("allow");
    expect(decision.livemode).toBeNull();
  });

  it("allows live Stripe integration for low-risk read", () => {
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: { livemode: true },
      runTestMode: false,
      actionRiskLevel: "low",
      actionKey: "stripe:get_payments",
    });
    expect(decision.outcome).toBe("allow");
    expect(decision.livemode).toBe(true);
  });

  it("allow decision never carries a reason code", () => {
    // The decision shape: `reason` is present only on deny. Type-level
    // discriminator for callers that switch on outcome.
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: { livemode: true },
      runTestMode: false,
      actionRiskLevel: "high",
      actionKey: "stripe:create_payment_intent",
    });
    expect(decision.outcome).toBe("allow");
    expect(decision.reason).toBeUndefined();
  });
});

// ─── stripeLivemodePreflight wiring ─────────────────────────────────────────

describe("stripeLivemodePreflight — resolves riskLevel via discovery registry", () => {
  it("no-op (returns undefined) when policy allows", () => {
    mockGetActionMeta.mockReturnValueOnce({
      key: "stripe:create_payment_intent",
      riskLevel: "high",
    });
    const preflight = stripeLivemodePreflight({
      actionType: "create_payment_intent",
      runTestMode: false,
    });
    const integration = makeIntegration({ livemode: true });
    expect(() => preflight(integration)).not.toThrow();
    expect(mockGetActionMeta).toHaveBeenCalledWith(
      "stripe:create_payment_intent",
    );
  });

  it("throws StripeLivemodePolicyError when policy denies (test-mode)", () => {
    mockGetActionMeta.mockReturnValueOnce({
      key: "stripe:create_payment_intent",
      riskLevel: "high",
    });
    const preflight = stripeLivemodePreflight({
      actionType: "create_payment_intent",
      runTestMode: true,
    });
    const integration = makeIntegration({ livemode: true });
    expect(() => preflight(integration)).toThrow(StripeLivemodePolicyError);
    try {
      preflight(integration);
    } catch (err) {
      expect(err).toBeInstanceOf(StripeLivemodePolicyError);
      const typed = err as StripeLivemodePolicyError;
      expect(typed.reason).toBe("STRIPE_LIVEMODE_TEST_MODE_BLOCKED");
      expect(typed.actionKey).toBe("stripe:create_payment_intent");
      expect(typed.livemode).toBe(true);
    }
  });

  it("throws STRIPE_LIVEMODE_UNKNOWN for high-risk write with unknown livemode", () => {
    mockGetActionMeta.mockReturnValue({
      key: "stripe:create_refund",
      riskLevel: "high",
    });
    const preflight = stripeLivemodePreflight({
      actionType: "create_refund",
      runTestMode: false,
    });
    const integration = makeIntegration({});
    try {
      preflight(integration);
      throw new Error("expected preflight to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(StripeLivemodePolicyError);
      const typed = err as StripeLivemodePolicyError;
      expect(typed.reason).toBe("STRIPE_LIVEMODE_UNKNOWN");
      expect(typed.livemode).toBeNull();
    }
  });

  it("fails closed when action meta is missing (assumed riskLevel: high)", () => {
    // The discovery-coverage CI catches missing metas in production,
    // but the preflight must still fail closed if a meta drift slips
    // through. Concretely: missing meta + real-mode + unknown
    // livemode should produce STRIPE_LIVEMODE_UNKNOWN (high-risk
    // assumption).
    mockGetActionMeta.mockReturnValueOnce(undefined);
    const preflight = stripeLivemodePreflight({
      actionType: "ghost_action",
      runTestMode: false,
    });
    const integration = makeIntegration({});
    expect(() => preflight(integration)).toThrow(StripeLivemodePolicyError);
    try {
      preflight(integration);
    } catch (err) {
      expect((err as StripeLivemodePolicyError).reason).toBe(
        "STRIPE_LIVEMODE_UNKNOWN",
      );
    }
  });

  it("allows medium-risk write with live integration (non-test mode)", () => {
    mockGetActionMeta.mockReturnValueOnce({
      key: "stripe:create_customer",
      riskLevel: "medium",
    });
    const preflight = stripeLivemodePreflight({
      actionType: "create_customer",
      runTestMode: false,
    });
    const integration = makeIntegration({ livemode: true });
    expect(() => preflight(integration)).not.toThrow();
  });
});

// ─── StripeLivemodePolicyError shape ────────────────────────────────────────

describe("StripeLivemodePolicyError", () => {
  it("carries structured reason / actionKey / livemode fields", () => {
    const err = new StripeLivemodePolicyError({
      reason: "STRIPE_LIVEMODE_UNKNOWN",
      actionKey: "stripe:create_payment_intent",
      livemode: null,
      message: "Stripe integration livemode is unknown — reconnect.",
    });
    expect(err.name).toBe("StripeLivemodePolicyError");
    expect(err.reason).toBe("STRIPE_LIVEMODE_UNKNOWN");
    expect(err.actionKey).toBe("stripe:create_payment_intent");
    expect(err.livemode).toBeNull();
    expect(err.message).toMatch(/unknown/i);
    expect(err).toBeInstanceOf(Error);
  });
});
