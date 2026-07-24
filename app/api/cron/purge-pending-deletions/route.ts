import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { isAccountPurgeCronEnabled } from "@/services/accounts/accountDeletionFlags";
import {
  purgeDuePendingAccounts,
  reconcilePendingDeletionBilling,
} from "@/services/accounts/accountPurge";

/**
 * Cron entrypoint for the account-purge sweep (4.ACCOUNT-MODEL-10c).
 *
 * Permanently tears down accounts that are `pending_deletion` AND past
 * `purge_after` (grace elapsed): best-effort provider token revoke, then
 * RESTRICT-safe delete of integrations → workflow_runs → workflows →
 * account_billing → account → auth.users (last). See services/accounts/
 * accountPurge.ts for the ordering + idempotency contract.
 *
 * DESTRUCTIVE + flag-gated. `ENABLE_ACCOUNT_PURGE_CRON` defaults OFF — when
 * unset the route authenticates but performs no teardown (returns
 * { ok, enabled:false }). The purge SERVICE works regardless when called
 * directly (admin/tests); only the scheduled fan-out is gated. service_role
 * only (service → repos use the service-role client); this route is the public
 * surface and is cron-auth protected.
 *
 * BILLING RECONCILIATION (ACCOUNT-BILLING-LIFECYCLE-1) runs on this same tick and is
 * deliberately NOT behind `ENABLE_ACCOUNT_PURGE_CRON`. It is non-destructive to data — it
 * only re-attempts the (idempotent) subscription cancellation for accounts the user has
 * ALREADY asked to delete, which is the durable retry for "we froze the account but Stripe
 * was unreachable". Gating it behind the destructive-purge flag would leave departing
 * customers being charged for as long as the purge stays off. Its failures never fail the
 * request: a reconciliation error is logged and counted, and the purge sweep still runs.
 *
 * Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`; manual /
 * curl invocations use POST. Response is counts only — no account/user ids.
 */

interface BillingReconcileReport {
  scanned: number;
  canceled: number;
  alreadyClear: number;
  failed: number;
}

/** Never throws — reconciliation must not take down the purge sweep. */
async function runBillingReconciliation(): Promise<BillingReconcileReport | null> {
  try {
    const result = await reconcilePendingDeletionBilling();
    console.info(
      JSON.stringify({ event: "cron.deletion_billing_reconcile.done", ...result }),
    );
    return result;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.deletion_billing_reconcile.failed",
        message: (err as Error).message,
      }),
    );
    return null;
  }
}

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  // Always reconcile billing for frozen accounts — see the note above.
  const billingReconcile = await runBillingReconciliation();

  if (!isAccountPurgeCronEnabled()) {
    console.info(
      JSON.stringify({ event: "cron.purge_pending_deletions.disabled" }),
    );
    return NextResponse.json({ ok: true, enabled: false, billingReconcile });
  }

  try {
    const result = await purgeDuePendingAccounts();
    console.info(
      JSON.stringify({ event: "cron.purge_pending_deletions.done", ...result }),
    );
    return NextResponse.json({ ok: true, enabled: true, ...result, billingReconcile });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.purge_pending_deletions.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Account-purge sweep cron failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
