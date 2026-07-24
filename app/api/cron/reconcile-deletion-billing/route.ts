import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { reconcilePendingDeletionBilling } from "@/services/accounts/accountPurge";
import {
  recordCronRun,
  withCronHeartbeat,
} from "@/services/observability/signalRecorders";

/**
 * Cron entrypoint for the pending-deletion BILLING RECONCILIATION sweep
 * (Slice 4.ACCOUNT-BILLING-LIFECYCLE-2).
 *
 * ── Why this is a separate route from `purge-pending-deletions` ─────────────────────────
 * ACCOUNT-BILLING-LIFECYCLE-1 needed a durable retry for one specific partial failure: the
 * deletion request froze the account, but the Stripe cancellation failed, so the customer
 * can still be charged for an account they asked to delete. That retry must run on a
 * schedule or it never fires.
 *
 * The obvious home was the existing `purge-pending-deletions` cron — but that route can also
 * PERMANENTLY DESTROY accounts when `ENABLE_ACCOUNT_PURGE_CRON` is on, and V2-READY-38
 * deliberately keeps every destructive purge cron OUT of `vercel.json` so that "a schedule
 * exists" can never combine with "someone flipped the flag" (see
 * `docs/slices/phase-4/readiness/v2-ready-38-purge-cron-audit.md` and the tripwire test
 * `tests/unit/app/api/cron/purge-crons-unscheduled.guard.test.ts`).
 *
 * So the schedulable work lives here instead. This route is **structurally incapable of
 * destroying anything**: it imports exactly one service function, and that function only
 * re-attempts an idempotent Stripe cancellation. It does not import the purge service, the
 * purge flag, or any delete/anonymize repository. That is a stronger guarantee than a
 * feature flag — there is no configuration of this route that can purge an account.
 *
 * ── What it does ────────────────────────────────────────────────────────────────────────
 * For every account already in `pending_deletion` (the user asked to be deleted), re-attempt
 * the cancellation of that account's ChainReact subscription. Idempotent: an account whose
 * subscription is already gone costs one status read and reports `alreadyClear`.
 *
 * It deliberately ignores the grace window — billing must stop NOW, not in 30 days — and it
 * resolves the subscription by `account_id` only, so a user's OTHER accounts (a team they
 * own or belong to) are never inspected or touched.
 *
 * Per-account failures are isolated inside the service, so one account's Stripe outage never
 * stops the rest of the batch.
 *
 * ── Safety posture ──────────────────────────────────────────────────────────────────────
 *   - cron-auth protected (same mechanism as every other cron);
 *   - non-destructive: no data, auth user, workflow, file, integration, membership, or
 *     billing row is ever removed;
 *   - idempotent across repeated invocations;
 *   - counts-only response — no account id, user id, email, Stripe customer/subscription id,
 *     or team name ever appears in the body or the logs.
 *
 * Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`; manual / curl invocations
 * use POST.
 */

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const result = await reconcilePendingDeletionBilling();

    // OPERATIONAL SIGNAL (ACCOUNT-BILLING-LIFECYCLE-3). A partially-failed sweep still
    // returns HTTP 200 — one account's Stripe outage must not fail the tick — so the
    // heartbeat alone would record `ok` and an operator would never see it. Record an
    // explicit `failed` cron signal so a persistent inability to cancel subscriptions for
    // departing customers surfaces through the SAME ops path as every other cron problem
    // (ops_signal_events → evaluate-ops-alerts), instead of needing a bespoke alert channel.
    //
    // `detailCode` is a bounded category, never a count and never an identifier.
    if (result.failed > 0) {
      await recordCronRun(CRON_NAME, "failed", "billing_cancellation_failed");
      console.error(
        JSON.stringify({
          event: "cron.reconcile_deletion_billing.failures",
          // Safe aggregate shape only: counts + a category + when. No account id, user id,
          // email, Stripe customer/subscription id, team name, or raw Stripe error.
          scanned: result.scanned,
          attempted: result.canceled + result.failed,
          succeeded: result.canceled,
          failed: result.failed,
          alreadyClear: result.alreadyClear,
          errorCategory: "billing_cancellation_failed",
          at: new Date().toISOString(),
        }),
      );
    }

    console.info(
      JSON.stringify({ event: "cron.reconcile_deletion_billing.done", ...result }),
    );
    // Counts only — deliberately the whole body, so no identifier can ride along.
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.reconcile_deletion_billing.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Deletion-billing reconciliation cron failed." },
      { status: 500 },
    );
  }
}

/**
 * Registered cron name — matches `services/observability/cronExpectations.ts`, which is what
 * turns a MISSING tick (the cron silently not running) into an alert.
 */
const CRON_NAME = "reconcile-deletion-billing";

// Heartbeat wrapper: every authorized tick records ok/failed into ops_signal_events, so a
// dead or erroring cron is visible through the standard evaluator rather than only in logs.
const wrapped = withCronHeartbeat(CRON_NAME, handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
