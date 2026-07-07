/**
 * @jest-environment node
 *
 * Trigger-smoke — Dropbox webhook LIVE proof (real dev DB + REAL Dropbox
 * cursor reconcile) for the single registered Dropbox trigger:
 *
 *   dropbox:new_file
 *
 * HYBRID HONESTY SCOPE (see dropboxWebhookSmoke.ts): the notification is
 * SYNTHETIC (DROPBOX_CLIENT_SECRET-signed; Dropbox did NOT deliver) but the
 * changed-account id is the REAL connected account's dbid, the seeded cursor
 * comes from the live get_latest_cursor, the smoke file is a REAL upload,
 * and the route's reconcile walks the REAL list_folder/continue delta.
 * Provider-side webhook registration (App Console) is NOT certified; the
 * route's GET ?challenge echo branch is live-probed.
 *
 * The redeliver proves BOTH freshness layers: watermark (advanced cursor →
 * 0 new) then dedup (pre-change cursor RESTORED → same entry re-detected →
 * the row-scoped dedup key drops it).
 *
 * LIVE-PROVIDER surface: one smoke folder + one text file (trashed after).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:dropbox
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  runDirectSeedWebhookSmoke,
  type DirectSeedWebhookSmokeResult,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import { DROPBOX_NEW_FILE_SPEC } from "@/tests/trigger-smoke/dropboxWebhookSmoke";
import {
  makeRealDropboxWebhookSmokeDeps,
  probeDropboxChallengeHandshake,
} from "@/tests/trigger-smoke/dropboxWebhookSmokeDeps";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnvLocal();

const ALLOW_DB = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const ALLOW_TRIGGER = process.env.ALLOW_TRIGGER_SMOKE === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCOUNT_ID = process.env.SMOKE_ACCOUNT_ID;
const USER_ID = process.env.SMOKE_USER_ID;

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (dropbox webhook) — needs ALLOW_DB_INTEGRATION_TESTS + " +
      "ALLOW_TRIGGER_SMOKE + Supabase env + SMOKE_ACCOUNT_ID + SMOKE_USER_ID (+ a connected " +
      "Dropbox integration + DROPBOX_CLIENT_SECRET).",
  );
}

describeLive("trigger smoke: Dropbox webhook (real dev DB + real cursor reconcile)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const config = {
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
  };

  it("GET ?challenge echoes the token as text/plain 200 through the real route", async () => {
    const probe = await probeDropboxChallengeHandshake();
    expect(probe.status).toBe(200);
    expect(probe.body).toMatch(/^crsmoke-challenge-/);
    expect(probe.contentType ?? "").toContain("text/plain");
  }, 30_000);

  it(
    "dropbox:new_file: seed row + real cursor → real upload + synthetic notification fires 1, terminal succeeded, watermark + dedup hold, 0 leaked",
    async () => {
      const r: DirectSeedWebhookSmokeResult = await runDirectSeedWebhookSmoke(
        makeRealDropboxWebhookSmokeDeps(config, DROPBOX_NEW_FILE_SPEC),
        DROPBOX_NEW_FILE_SPEC,
        { afterDeliverAttempts: 8, afterDeliverSleepMs: 1000, dedupSettleMs: 1500 },
      );
      console.log(JSON.stringify({ event: "trigger-smoke.dropbox-webhook.result", ...r }));
      expect(r.outcome).toBe("pass");
      expect(r.cleaned).toBe(true);
      expect(r.seededEventType).toBe("new_file");
      expect(r.baselineRunCount).toBe(0);
      expect(r.deliverHttpStatus).toBe(200);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterRedeliverRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
    },
    300_000,
  );
});
