/**
 * RPC-RETURN-CONTRACT-GUARD-1 — runtime contracts for RPC results that the type
 * system cannot describe.
 *
 * WHY RUNTIME, NOT COMPILE TIME
 * -----------------------------
 * A `jsonb`-returning Postgres function generates `Returns: Json` in
 * `types/database.types.ts`. `Json` is a union with no field information, so
 * `RpcReturns<"apply_business_upgrade">` cannot be dotted into and a changed
 * payload shape is invisible to `tsc`. Until now these callers papered over
 * that with `data as { ok: boolean; applied: boolean; reason: string }` — an
 * assertion that is never checked, on the results that decide billing balances,
 * entitlement transitions and account ownership.
 *
 * These schemas are the honest replacement: the shapes are read from the actual
 * function bodies in the migrated database (each `jsonb_build_object(...)`
 * branch), and every high-risk caller parses through them and FAILS CLOSED on a
 * malformed result rather than reading `undefined` out of a changed payload.
 *
 * RULES
 *   - `.strict()` everywhere: an unexpected key means the function's contract
 *     changed and nobody updated the caller. That is exactly the drift class
 *     this arc exists to stop, so it is an error, not something to ignore.
 *   - Fields that only SOME branches return are `.optional()` — modelled from
 *     the real branches, never widened just to make a parse succeed.
 *   - NEVER default a missing security- or billing-relevant field. A missing
 *     `ok` throws; it does not become `false`.
 *   - No second validation framework: this is zod, like the rest of the repo.
 */
import { z } from "zod";

/**
 * Parse an RPC result, failing closed with a message naming the function.
 *
 * The raw value is `Json` (or `unknown`) by construction — that is the point:
 * the parse is what turns an unverified payload into a typed one.
 */
export function parseRpcResult<T>(fn: string, schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Only the shape problem is reported — never the payload, which can carry
    // account identifiers and balances.
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`)
      .join("; ");
    throw new Error(`${fn} returned a result that does not match its contract — ${issues}`);
  }
  return parsed.data;
}

/**
 * `apply_business_upgrade` / `apply_business_downgrade`.
 * Success additionally reports the new `type` + `plan`; refusal branches carry
 * only the verdict triple.
 */
export const businessTransitionResultSchema = z
  .object({
    ok: z.boolean(),
    applied: z.boolean(),
    reason: z.string(),
    type: z.string().optional(),
    plan: z.string().optional(),
  })
  .strict();
export type BusinessTransitionResult = z.infer<typeof businessTransitionResultSchema>;

/** `deduct_tasks_if_available` and `deduct_ai_credits_if_available`. */
export const deductResultSchema = z
  .object({
    ok: z.boolean(),
    used: z.number(),
    limit: z.number(),
  })
  .strict();
export type DeductResult = z.infer<typeof deductResultSchema>;

/** `reserve_tasks_if_available`. Every branch reports the full counter set. */
export const reserveTasksResultSchema = z
  .object({
    ok: z.boolean(),
    reason: z.string(),
    used: z.number(),
    reserved: z.number(),
    limit: z.number(),
    amount: z.number(),
  })
  .strict();
export type ReserveTasksResult = z.infer<typeof reserveTasksResultSchema>;

/**
 * `reconcile_task_reservation`. The refusal branches (`run_not_found`,
 * `not_reserved_*`) return ONLY `ok` + `reason`, so the counters are optional.
 */
export const reconcileReservationResultSchema = z
  .object({
    ok: z.boolean(),
    reason: z.string(),
    used: z.number().optional(),
    reserved: z.number().optional(),
    limit: z.number().optional(),
    charged: z.number().optional(),
    refunded: z.number().optional(),
  })
  .strict();
export type ReconcileReservationResult = z.infer<typeof reconcileReservationResultSchema>;

/** `release_task_reservation`. `run_not_found` returns only ok + reason. */
export const releaseReservationResultSchema = z
  .object({
    ok: z.boolean(),
    reason: z.string(),
    reserved: z.number().optional(),
    limit: z.number().optional(),
    released: z.number().optional(),
  })
  .strict();
export type ReleaseReservationResult = z.infer<typeof releaseReservationResultSchema>;

/** `release_expired_reservations` — the sweep summary. */
export const releaseExpiredResultSchema = z
  .object({
    ok: z.boolean(),
    released_count: z.number(),
    released_tasks: z.number(),
  })
  .strict();
export type ReleaseExpiredResult = z.infer<typeof releaseExpiredResultSchema>;

/**
 * `schedule_account_deletion` — a TABLE-returning function, so the generated
 * type IS precise about columns. It is still validated here because the outcome
 * drives an authorization decision: the caller narrows it to a 5-value union
 * that downstream code exhaustively switches on, and previously did so with an
 * unchecked cast. A sixth outcome added in SQL would have flowed through as an
 * unhandled value; now it fails closed.
 */
export const scheduleAccountDeletionRowSchema = z
  .object({
    out_outcome: z.enum([
      "scheduled",
      "already_pending",
      "no_authorization",
      "owned_accounts_block",
      "account_not_found",
    ]),
    out_account_id: z.string().nullable(),
    out_deletion_status: z.string().nullable(),
    out_deletion_requested_at: z.string().nullable(),
    out_purge_after: z.string().nullable(),
  })
  .strict();
export type ScheduleAccountDeletionRow = z.infer<typeof scheduleAccountDeletionRowSchema>;

/**
 * `authorize_live_test_run` — a TABLE-returning function whose `outcome` also
 * drives an authorization decision (whether a live run may proceed).
 */
export const authorizeLiveTestRunRowSchema = z
  .object({
    outcome: z.string(),
    run_id: z.string().nullable(),
  })
  .strict();
export type AuthorizeLiveTestRunRow = z.infer<typeof authorizeLiveTestRunRowSchema>;

/**
 * The three `increment_*_rate_limits` functions.
 *
 * Validated rather than defaulted ON PURPOSE: a missing count must NOT become
 * `0`. These counts are compared against a ceiling, so silently substituting
 * zero for an absent value would turn a rate limiter into a no-op — the precise
 * "do not supply defaults for security-relevant fields" case. A malformed row
 * throws and the caller refuses the request.
 */
export const apiKeyRateLimitRowSchema = z
  .object({
    key_count: z.number(),
    workflow_count: z.number(),
    account_count: z.number(),
  })
  .strict();
export type ApiKeyRateLimitRow = z.infer<typeof apiKeyRateLimitRowSchema>;

export const mcpRateLimitRowSchema = z
  .object({
    token_count: z.number(),
    account_count: z.number(),
  })
  .strict();
export type McpRateLimitRow = z.infer<typeof mcpRateLimitRowSchema>;

export const analyticsProviderRateLimitRowSchema = z
  .object({
    account_count: z.number(),
    source_count: z.number(),
  })
  .strict();
export type AnalyticsProviderRateLimitRow = z.infer<typeof analyticsProviderRateLimitRowSchema>;

/**
 * `replace_account_invitation` returns the whole `account_invitations` row. The
 * generated composite type widens `role` / `status` to `string`, but the
 * repository's record models them as closed unions — so this narrows them at
 * runtime instead of asserting through a cast.
 */
export const accountInvitationRowSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    email: z.string(),
    role: z.enum(["admin", "member"]),
    status: z.enum(["pending", "accepted", "revoked", "expired"]),
    invited_by_user_id: z.string().nullable(),
    expires_at: z.string().nullable(),
    accepted_by_user_id: z.string().nullable(),
    accepted_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    created_at: z.string(),
    token_hash: z.string(),
  })
  .strict();
export type AccountInvitationRow = z.infer<typeof accountInvitationRowSchema>;

/**
 * `claim_account_trial`. `trial_consumed_at` is returned by both branches even
 * though the caller does not use it — modelling it keeps `.strict()` honest.
 * `trial_origin_plan` is left as a string here and narrowed by the repository:
 * inventing an enum would make a future plan tier fail a parse in production.
 */
export const claimAccountTrialResultSchema = z
  .object({
    claimed: z.boolean(),
    trial_consumed_at: z.string().nullable(),
    trial_ends_at: z.string().nullable(),
    trial_origin_plan: z.string().nullable(),
  })
  .strict();
export type ClaimAccountTrialResult = z.infer<typeof claimAccountTrialResultSchema>;
