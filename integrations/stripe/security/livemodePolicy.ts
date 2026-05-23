import type { IntegrationRecord } from "@/repositories/integrations";
import type { RiskLevel } from "@/contracts/actionMeta";
import { getActionMeta } from "@/services/discovery/_registry";

/**
 * Slice 3.SEC-14 — Stripe livemode policy.
 *
 * Background: the SEC-1 audit
 * (docs/slices/security/workflow-builder-data-security-audit.md F-C1)
 * required a Stripe-specific layer on top of the engine's general
 * test-mode safety gate (SEC-2). SEC-2 prevents `requiresIntegration:
 * true` actions from being invoked when `testMode === true` — Stripe
 * action handlers are therefore never reached from a test-mode run.
 * This module is the additional safety layer the audit asked for:
 *
 *   1. **Defense-in-depth for test mode.** If SEC-2 is bypassed,
 *      disabled, or a future regression slips a Stripe handler past
 *      it, the preflight ALSO denies. The deny reason is
 *      `STRIPE_LIVEMODE_TEST_MODE_BLOCKED` so it's distinguishable
 *      from the SEC-2 surface in run history.
 *   2. **Unknown-livemode fail-closed for high-risk writes.** When
 *      `accountMetadata.livemode` is `null` (the row predates the
 *      OAuth callback that captures it, or a future schema change
 *      removed it), the policy DENIES high-risk Stripe writes
 *      (`riskLevel === "high"`). Lower-risk reads are allowed —
 *      `findCustomer`, `getPayments`, etc. — because forcing a
 *      reconnect on read paths is excessive UX for a recoverable
 *      provenance gap.
 *   3. **Provenance is preserved.** Allowed decisions carry the
 *      resolved livemode value (`true` / `false` / `null`) so the
 *      caller can log it. We do not mutate Stripe API behavior; the
 *      handler still receives the access token bound to whichever
 *      Stripe account the user connected. The policy only blocks
 *      execution; it does not pick which Stripe environment to call.
 *
 * Why not enforce a hard "real-mode workflow must use livemode=true
 * integration" rule? V2 has no notion of a workflow environment
 * (sandbox vs production). A merchant developing a workflow connects
 * a Stripe test account, builds and runs it end-to-end, then later
 * swaps in a live Stripe account. Forcing livemode=true for every
 * real-mode run breaks that workflow. The product-side environment
 * surface is a future slice; SEC-14 establishes the substrate
 * (persisted livemode + policy choke point) without overcommitting.
 *
 * Storage source: `integrations/stripe/oauth.ts:handleCallback` writes
 * `livemode` into `account.metadata.livemode` from Stripe Connect's
 * token-exchange response (Stripe API surfaces it directly — no
 * follow-up `/v1/account` call). The repository persists it
 * verbatim into the `account_metadata` jsonb column. Old rows that
 * predate the OAuth flow have `livemode` absent — the extractor
 * normalizes both "absent" and "non-boolean" to `null`.
 *
 * The policy is a pure function — no I/O, no provider calls. The
 * preflight wrapper (`stripeLivemodePreflight`) is the impure surface
 * that closes over `runTestMode` + `actionType`, looks up the action's
 * risk level via the discovery registry, and threads the integration
 * row through to the pure helper.
 */

// ─── Decision shape ─────────────────────────────────────────────────────────

export type StripeLivemodePolicyReason =
  /**
   * Test-mode run reached a Stripe handler. Defense-in-depth — SEC-2's
   * pre-call gate should have blocked first.
   */
  | "STRIPE_LIVEMODE_TEST_MODE_BLOCKED"
  /**
   * `accountMetadata.livemode` is unknown (null) and the action is
   * high-risk. The integration must be reconnected to refresh the
   * Stripe Connect token response and re-populate `livemode`.
   */
  | "STRIPE_LIVEMODE_UNKNOWN"
  /**
   * Reserved for future use — explicit run-environment vs integration
   * mismatch (e.g. once V2 has a workflow-environment concept and a
   * live workflow tries to fire against a test Stripe integration).
   * Not produced by the current implementation.
   */
  | "STRIPE_LIVEMODE_MISMATCH";

export type StripeLivemodePolicyOutcome = "allow" | "deny";

export interface StripeLivemodePolicyDecision {
  outcome: StripeLivemodePolicyOutcome;
  reason?: StripeLivemodePolicyReason;
  /**
   * Resolved livemode from the integration row's `account_metadata`.
   * `true` / `false` when Stripe surfaced it at OAuth exchange,
   * `null` when the row predates SEC-14's storage or the field was
   * non-boolean.
   */
  livemode: boolean | null;
  /**
   * Human-safe message — surfaced in run history / step error output.
   * Never contains tokens, secrets, or PII. The handler's caller
   * decides whether to forward it to the user.
   */
  message: string;
}

export interface EvaluateStripeLivemodePolicyInput {
  /**
   * `IntegrationRecord.accountMetadata` payload — the jsonb column
   * Stripe's OAuth callback populates with `{ livemode, stripeUserId,
   * stripePublishableKey, scope }`.
   */
  accountMetadata: Readonly<Record<string, unknown>>;
  /** Engine's test-mode flag for this run. */
  runTestMode: boolean;
  /** Risk level from the action's `ActionMeta`. */
  actionRiskLevel: RiskLevel;
  /** Action key (`stripe:<type>`) — surfaces in the deny message. */
  actionKey: string;
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Read `livemode` from the integration's `account_metadata` jsonb.
 * Normalizes "absent", `undefined`, `null`, and any non-boolean value
 * to `null`. Booleans pass through unchanged.
 *
 * The repository typing is `Record<string, unknown>` (the jsonb column
 * is opaque to the repository layer); this is the single place V2
 * decides what a non-boolean value means.
 */
export function extractStripeLivemode(
  metadata: Readonly<Record<string, unknown>>,
): boolean | null {
  const v = metadata.livemode;
  if (typeof v === "boolean") return v;
  return null;
}

/**
 * Pure decision function — no I/O. The wrapper
 * `stripeLivemodePreflight` is the impure surface that resolves
 * `actionRiskLevel` via the discovery registry and threads the
 * integration row into this helper.
 *
 * Decision matrix:
 *
 * | runTestMode | livemode  | actionRiskLevel | outcome | reason                              |
 * |-------------|-----------|-----------------|---------|-------------------------------------|
 * | true        | true      | any             | deny    | STRIPE_LIVEMODE_TEST_MODE_BLOCKED   |
 * | true        | false     | any             | deny    | STRIPE_LIVEMODE_TEST_MODE_BLOCKED   |
 * | true        | null      | any             | deny    | STRIPE_LIVEMODE_TEST_MODE_BLOCKED   |
 * | false       | true      | any             | allow   | —                                   |
 * | false       | false     | any             | allow   | —                                   |
 * | false       | null      | high            | deny    | STRIPE_LIVEMODE_UNKNOWN             |
 * | false       | null      | medium / low    | allow   | —                                   |
 */
export function evaluateStripeLivemodePolicy(
  input: EvaluateStripeLivemodePolicyInput,
): StripeLivemodePolicyDecision {
  const livemode = extractStripeLivemode(input.accountMetadata);

  if (input.runTestMode) {
    return {
      outcome: "deny",
      reason: "STRIPE_LIVEMODE_TEST_MODE_BLOCKED",
      livemode,
      message: `Test-mode workflow run cannot execute Stripe action ${input.actionKey}. SEC-2 should have blocked before reaching the handler; this is defense-in-depth.`,
    };
  }

  if (livemode === null && input.actionRiskLevel === "high") {
    return {
      outcome: "deny",
      reason: "STRIPE_LIVEMODE_UNKNOWN",
      livemode,
      message: `Stripe integration livemode is unknown — reconnect the Stripe account before running high-risk action ${input.actionKey}.`,
    };
  }

  const provenance =
    livemode === true
      ? "Stripe live mode"
      : livemode === false
        ? "Stripe test mode (real workflow run against test Stripe credentials)"
        : "Stripe livemode unknown (lower-risk action allowed)";
  return { outcome: "allow", livemode, message: provenance };
}

// ─── Error class ────────────────────────────────────────────────────────────

/**
 * Thrown from the preflight when the policy denies. Carries the
 * structured reason code so the engine's error classifier can route
 * it ("reconnect Stripe" UX), and the resolved livemode for
 * forensics. The `message` is the policy's human-safe text; no
 * tokens or secrets.
 */
export class StripeLivemodePolicyError extends Error {
  readonly reason: StripeLivemodePolicyReason;
  readonly actionKey: string;
  readonly livemode: boolean | null;

  constructor(input: {
    reason: StripeLivemodePolicyReason;
    actionKey: string;
    livemode: boolean | null;
    message: string;
  }) {
    super(input.message);
    this.name = "StripeLivemodePolicyError";
    this.reason = input.reason;
    this.actionKey = input.actionKey;
    this.livemode = input.livemode;
  }
}

// ─── Preflight factory ──────────────────────────────────────────────────────

export interface StripeLivemodePreflightInput {
  /** Stripe action type — e.g. `create_payment_intent`. */
  actionType: string;
  /** Engine's test-mode flag for this run. */
  runTestMode: boolean;
}

/**
 * Construct a `refreshAndRetry` preflight closure for a specific
 * Stripe action. The closure receives the integration row at runtime,
 * looks up the action's risk level via the discovery registry, calls
 * the pure policy helper, and throws `StripeLivemodePolicyError` on
 * deny.
 *
 * If the action meta is not registered (shouldn't happen in
 * production — the discovery-coverage CI test catches this), the
 * preflight assumes `riskLevel: "high"` so the policy fails closed.
 */
export function stripeLivemodePreflight(
  input: StripeLivemodePreflightInput,
): (integration: IntegrationRecord) => void {
  const actionKey = `stripe:${input.actionType}`;
  return (integration: IntegrationRecord) => {
    const meta = getActionMeta(actionKey);
    const riskLevel: RiskLevel = meta?.riskLevel ?? "high";
    const decision = evaluateStripeLivemodePolicy({
      accountMetadata: integration.accountMetadata,
      runTestMode: input.runTestMode,
      actionRiskLevel: riskLevel,
      actionKey,
    });
    if (decision.outcome === "deny") {
      throw new StripeLivemodePolicyError({
        reason: decision.reason!,
        actionKey,
        livemode: decision.livemode,
        message: decision.message,
      });
    }
  };
}

