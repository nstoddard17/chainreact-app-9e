import * as accountBillingAiCreditsRepo from "@/repositories/accountBillingAiCredits";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import {
  computeAiCreditCharge,
  type CreditModelTier,
} from "@/core/billing/aiCreditPolicy";
import { isAiCreditEnforcementEnabled } from "./billingFeatureFlags";

/**
 * Pre-call AI credit gate (Slice 4.AI-CREDITS-3, deduct-only, infra-only).
 *
 * The AI analogue of `executionBillingGate` — call it BEFORE a paid LLM call to
 * meter AI credits. Mirrors the task gate's ordering (frozen → skip → deduct) and
 * its account-owned, service-role, atomic-RPC posture.
 *
 * Behavior:
 *   - Flag OFF (`ENABLE_AI_CREDIT_ENFORCEMENT` ≠ "true") → pure no-op
 *     (`skipped: enforcement_disabled`); NO DB write, NO charge. AI credits stay
 *     recording-only (AI-CREDITS-2). This is the default.
 *   - Frozen account → refused (checked FIRST, like the task gate).
 *   - Test mode → skipped (never charged).
 *   - 0-credit / deterministic feature → skipped (`zero_credit`); never blocks.
 *   - Paid feature → `deduct_ai_credits_if_available(account, charge)`; over the
 *     limit → typed `insufficient_ai_credits` denial.
 *
 * FAIL-CLOSED: an unexpected error from the deduct RPC is CAUGHT and returned as
 * `{ ok: false, reason: "gate_error" }` — the caller must refuse the LLM call. The
 * gate never returns `ok: true` on an error path, so a paid call can never slip
 * through unmetered (stricter than relying on every caller to try/catch).
 *
 * RECORDING stays fail-open + unchanged (AI-CREDITS-2 records the ACTUAL charge +
 * cost AFTER the call, independent of this gate).
 *
 * INFRA-ONLY: nothing wires this gate to a live AI route in this slice. The cost
 * owner is the account passed in (resolved server-side by the caller — never
 * client-supplied), mirroring the task gate's `workflow.accountId`.
 */

export type AiCreditGateOutcome =
  | { ok: true; charged: number; used: number; limit: number }
  | {
      ok: true;
      skipped: true;
      reason: "enforcement_disabled" | "test_mode" | "zero_credit";
    }
  | { ok: false; reason: "insufficient_ai_credits"; used: number; limit: number }
  | { ok: false; reason: "account_frozen"; used: number; limit: number }
  | { ok: false; reason: "gate_error"; used: number; limit: number };

/** The refusal arm, shared by the pre-call gate and the deferred-charge precheck. */
export type AiCreditDenial = Extract<AiCreditGateOutcome, { ok: false }>;

export interface AiCreditGateInput {
  /** Cost-owner account (resolved server-side; never client-supplied). */
  readonly accountId: string;
  /** The `ai_cost_events.feature` value for the call being gated. */
  readonly feature: string;
  /** Tier the call intends to use (drives the credit charge). Defaults to `fast`. */
  readonly plannedTier?: CreditModelTier | null;
  /** True when this call is a model escalation/fallback (charges more). */
  readonly escalated?: boolean;
  /** Test/dry-run — never charged (mirrors the task gate). */
  readonly testMode?: boolean;
}

export async function aiCreditGate(
  input: AiCreditGateInput,
): Promise<AiCreditGateOutcome> {
  // 1. Flag OFF → no-op (today's behavior). No DB, no charge.
  if (!isAiCreditEnforcementEnabled()) {
    return { ok: true, skipped: true, reason: "enforcement_disabled" };
  }

  // 2. Account freeze — checked FIRST (mirrors executionBillingGate): a
  // pending-deletion account is non-operational, so even a test call is refused.
  if (await isAccountFrozen(input.accountId)) {
    return { ok: false, reason: "account_frozen", used: 0, limit: 0 };
  }

  // 3. Test/dry-run — never charged.
  if (input.testMode === true) {
    return { ok: true, skipped: true, reason: "test_mode" };
  }

  // 4. Compute the credit charge for this PAID call.
  const charge = computeAiCreditCharge({
    feature: input.feature,
    isLlmCall: true,
    modelTier: input.plannedTier ?? "fast",
    ...(input.escalated !== undefined ? { escalated: input.escalated } : {}),
  });

  // 5. 0-credit / deterministic feature → pass without touching the ledger.
  if (charge.credits <= 0) {
    return { ok: true, skipped: true, reason: "zero_credit" };
  }

  // 6. Deduct atomically. FAIL-CLOSED: an RPC throw becomes a typed denial so a
  // paid call can never proceed unmetered.
  let result: accountBillingAiCreditsRepo.DeductAiCreditsResult;
  try {
    result = await accountBillingAiCreditsRepo.deductAiCredits(input.accountId, charge.credits);
  } catch {
    return { ok: false, reason: "gate_error", used: 0, limit: 0 };
  }

  if (result.ok) {
    return { ok: true, charged: charge.credits, used: result.used, limit: result.limit };
  }
  return {
    ok: false,
    reason: "insufficient_ai_credits",
    used: result.used,
    limit: result.limit,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * DEFERRED CHARGE (REACT-AGENT-FIRST-TURN-1)
 *
 * `aiCreditGate` above deducts BEFORE the model call, and the AI-credit ledger has
 * no reservation or refund primitive — the AI-CREDITS-3 migration deliberately
 * shipped `deduct_ai_credits_if_available` alone ("NOT in this migration:
 * reserve/reconcile RPCs, an ai_credit_reservations ledger"). So a guidance turn
 * that deducted and then died with a typed terminal failure (PREVIEW_PLAN_MISSING,
 * GUIDANCE_TIMEOUT, GUIDANCE_UNAVAILABLE) charged the customer for nothing, and the
 * failure copy told them to send the same request again — charging them twice for
 * one answer.
 *
 * Rather than bolt a refund onto a deduct-only ledger (which cannot be made
 * idempotent without a new keyed ledger table + migration), the charge MOVES to the
 * end of the turn: check first, charge only once a usable result exists. Nothing is
 * ever refunded because nothing is prematurely taken.
 *
 *   aiCreditPrecheck()          → same refusals as the gate, but NO ledger write
 *   chargeAiCreditsForSuccess() → the single deduct, on the one success path
 *
 * Idempotency is structural: exactly one charge call sits on the route's single
 * success exit, so a terminal error handler running twice, a retried model attempt,
 * or a failed response serialization cannot produce a second deduction — none of
 * those paths reach the charge at all.
 *
 * The pre-call gate is UNCHANGED and still used by `executeAiAction` (a workflow AI
 * action bills differently: its model call IS the deliverable, so charge-before is
 * correct there).
 * ──────────────────────────────────────────────────────────────────────────── */

/** The exact amount a successful precheck authorizes, charged iff the turn succeeds. */
export interface AiCreditPendingCharge {
  readonly accountId: string;
  /** Credits to charge on success. 0 → nothing is owed (flag off / test / zero-credit). */
  readonly credits: number;
}

export type AiCreditPrecheckOutcome =
  | { ok: true; pending: AiCreditPendingCharge; used: number; limit: number }
  | {
      ok: true;
      skipped: true;
      reason: "enforcement_disabled" | "test_mode" | "zero_credit";
    }
  | AiCreditDenial;

/**
 * Authorize a paid AI call WITHOUT touching the balance. Same refusal set and same
 * ordering as `aiCreditGate` (frozen → test → zero-credit → affordability), so a
 * caller swapping to the deferred pattern keeps identical denial behavior.
 *
 * Affordability is read through a ZERO-amount deduct rather than a plain select:
 * `deduct_ai_credits_if_available(id, 0)` is documented as a valid no-op that still
 * takes the row lock and applies the lazy AI-period rollover. A plain read would see
 * the PREVIOUS period's counters on the first call of a new month and wrongly refuse
 * a user whose credits had in fact just reset. It writes no charge.
 *
 * FAIL-CLOSED, exactly like the gate: an RPC throw becomes `gate_error` and the
 * caller must refuse the model call.
 */
export async function aiCreditPrecheck(
  input: AiCreditGateInput,
): Promise<AiCreditPrecheckOutcome> {
  if (!isAiCreditEnforcementEnabled()) {
    return { ok: true, skipped: true, reason: "enforcement_disabled" };
  }
  if (await isAccountFrozen(input.accountId)) {
    return { ok: false, reason: "account_frozen", used: 0, limit: 0 };
  }
  if (input.testMode === true) {
    return { ok: true, skipped: true, reason: "test_mode" };
  }

  const charge = computeAiCreditCharge({
    feature: input.feature,
    isLlmCall: true,
    modelTier: input.plannedTier ?? "fast",
    ...(input.escalated !== undefined ? { escalated: input.escalated } : {}),
  });
  if (charge.credits <= 0) {
    return { ok: true, skipped: true, reason: "zero_credit" };
  }

  let balance: accountBillingAiCreditsRepo.DeductAiCreditsResult;
  try {
    balance = await accountBillingAiCreditsRepo.deductAiCredits(input.accountId, 0);
  } catch {
    return { ok: false, reason: "gate_error", used: 0, limit: 0 };
  }

  if (balance.used + charge.credits > balance.limit) {
    return {
      ok: false,
      reason: "insufficient_ai_credits",
      used: balance.used,
      limit: balance.limit,
    };
  }
  return {
    ok: true,
    pending: { accountId: input.accountId, credits: charge.credits },
    used: balance.used,
    limit: balance.limit,
  };
}

export type AiCreditChargeResult =
  /** The customer was billed for this turn. */
  | { charged: number; outcome: "charged" }
  /** Nothing was owed — flag off, test mode, or a 0-credit feature. */
  | { charged: 0; outcome: "not_owed" }
  /** Raced past the cap between precheck and charge, or the RPC failed. */
  | { charged: 0; outcome: "cap_reached" | "charge_error" };

/**
 * Charge the pre-authorized amount, once, after the turn produced a usable result.
 *
 * NEVER throws and never fails the turn. The user already has their guidance; a
 * ledger problem at this point is an operational issue, not something to convert a
 * delivered answer into an error (which would also mean charging nothing AND showing
 * a failure). Both non-charging outcomes are returned for the caller to log.
 */
export async function chargeAiCreditsForSuccess(
  pending: AiCreditPendingCharge | null,
): Promise<AiCreditChargeResult> {
  if (!pending || pending.credits <= 0) return { charged: 0, outcome: "not_owed" };
  try {
    const result = await accountBillingAiCreditsRepo.deductAiCredits(
      pending.accountId,
      pending.credits,
    );
    return result.ok
      ? { charged: pending.credits, outcome: "charged" }
      : { charged: 0, outcome: "cap_reached" };
  } catch {
    return { charged: 0, outcome: "charge_error" };
  }
}
