import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { isAccountPurgeCronEnabled } from "@/services/accounts/accountDeletionFlags";
import { purgeDuePendingAccounts } from "@/services/accounts/accountPurge";

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
 * Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`; manual /
 * curl invocations use POST. Response is counts only — no account/user ids.
 */

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (!isAccountPurgeCronEnabled()) {
    console.info(
      JSON.stringify({ event: "cron.purge_pending_deletions.disabled" }),
    );
    return NextResponse.json({ ok: true, enabled: false });
  }

  try {
    const result = await purgeDuePendingAccounts();
    console.info(
      JSON.stringify({ event: "cron.purge_pending_deletions.done", ...result }),
    );
    return NextResponse.json({ ok: true, enabled: true, ...result });
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
