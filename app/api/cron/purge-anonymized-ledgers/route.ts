import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { isLedgerPurgeCronEnabled } from "@/services/accounts/accountDeletionFlags";
import { purgeExpiredAnonymizedLedgers } from "@/services/accounts/ledgerPurge";

/**
 * Cron entrypoint for the anonymized-ledger retention sweep (4.ACCOUNT-MODEL-10d).
 *
 * Hard-deletes ledger rows that were anonymized during account purge and whose
 * retention window has elapsed (`anonymized_at IS NOT NULL AND
 * ledger_purge_after <= now`). See services/accounts/ledgerPurge.ts +
 * repositories/ledgerAnonymization.ts for the contract.
 *
 * Flag-gated by `ENABLE_LEDGER_PURGE_CRON` (default OFF) — when unset the route
 * authenticates but performs no deletion (returns { ok, enabled:false }). The
 * delete SERVICE works regardless when called directly (admin/tests); only the
 * scheduled sweep is gated. service_role only (service → repo use the
 * service-role client); this route is the public surface and is cron-auth
 * protected. Response is counts only — no row/account/user ids.
 */

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (!isLedgerPurgeCronEnabled()) {
    console.info(
      JSON.stringify({ event: "cron.purge_anonymized_ledgers.disabled" }),
    );
    return NextResponse.json({ ok: true, enabled: false });
  }

  try {
    const result = await purgeExpiredAnonymizedLedgers();
    console.info(
      JSON.stringify({ event: "cron.purge_anonymized_ledgers.done", ...result }),
    );
    return NextResponse.json({ ok: true, enabled: true, ...result });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.purge_anonymized_ledgers.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Anonymized-ledger purge cron failed." },
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
