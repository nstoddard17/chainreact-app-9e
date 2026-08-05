import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { RpcArgs } from "@/types/rpc";
import { deductResultSchema, parseRpcResult } from "@/core/database/rpcResultSchemas";
import { asTypedDb } from "./supabase/typedDb";

/**
 * AI credit balance mutations (Slice 4.AI-CREDITS-3, deduct-only).
 *
 * Kept in a sibling file (not `accountBilling.ts`) so the AI-credit dimension is
 * cohesive and the canonical billing repo stays under the max-lines threshold —
 * AI credits are a separate billing dimension from tasks (see
 * docs/slices/phase-4/ai-credits-enforcement-plan.md). Same posture as the task
 * deduct: a thin pass-through over the atomic SECURITY DEFINER RPC (the single
 * authoritative balance mutator), via the service-role client.
 */

/** `deduct_ai_credits_if_available` result (same shape as the task deduct). */
export type DeductAiCreditsResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; used: number; limit: number };

interface DeductRpcResponse {
  ok: boolean;
  used: number;
  limit: number;
}

/**
 * Atomically deduct `amount` AI credits from an account. Flat gate + lazy
 * AI-period rollover happen inside the RPC. `amount = 0` is a valid no-op the RPC
 * accepts (a deterministic / 0-credit charge never blocks). Service-role only.
 * Throws on RPC error so the AI credit gate can FAIL CLOSED.
 */
export async function deductAiCredits(
  accountId: string,
  amount: number,
): Promise<DeductAiCreditsResult> {
  const supabase = getServiceRoleClient(
    `ai credit gate: deductAiCredits ${amount} for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { data, error } = await supabase.rpc("deduct_ai_credits_if_available", {
    p_account_id: accountId,
    p_amount: amount,
  } satisfies RpcArgs<"deduct_ai_credits_if_available">);
  if (error) {
    throw new Error(`deduct_ai_credits_if_available RPC failed: ${error.message}`);
  }
  const response = parseRpcResult("deduct_ai_credits_if_available", deductResultSchema, data);
  return response.ok
    ? { ok: true, used: response.used, limit: response.limit }
    : { ok: false, used: response.used, limit: response.limit };
}

/** Client-facing AI credit usage view (separate AI period anchor). */
export interface AiCreditUsage {
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  /** `max(0, limit − used)` — convenience for the usage UI. */
  aiCreditsRemaining: number;
  aiCreditsPeriodStartedAt: string;
}

/**
 * Read an account's AI credit usage via the SSR-cookie / RLS client (account
 * members only — never cross-account). Returns null when no billing row exists.
 * Kept beside `getUsage` semantically but in the AI sibling so the canonical
 * billing repo stays lean.
 */
export async function getAiCreditUsage(accountId: string): Promise<AiCreditUsage | null> {
  const supabase = await createClient();
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_billing")
    .select("ai_credits_used, ai_credits_limit, ai_credits_period_started_at")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    throw new Error(`account_billing.getAiCreditUsage failed: ${error.message}`);
  }
  if (!data) return null;
  return {
    aiCreditsUsed: data.ai_credits_used,
    aiCreditsLimit: data.ai_credits_limit,
    aiCreditsRemaining: Math.max(0, data.ai_credits_limit - data.ai_credits_used),
    aiCreditsPeriodStartedAt: data.ai_credits_period_started_at,
  };
}
