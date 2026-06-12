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
