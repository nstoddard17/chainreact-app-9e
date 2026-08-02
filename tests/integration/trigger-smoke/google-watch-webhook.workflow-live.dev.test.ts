/**
 * @jest-environment node
 *
 * Trigger-smoke — Google watch-channel webhook LIVE proof (real dev DB + REAL
 * Google fetches), one `it` per registered Google watch trigger:
 *
 *   google-sheets:new_worksheet / row_changed
 *   google-docs:new_document / document_updated
 *   google-drive:file_changed
 *   google-calendar:event_changed
 *
 * HYBRID HONESTY SCOPE (see googleWatchWebhookSmoke.ts): the notification is
 * SYNTHETIC (direct-seeded row with a smoke-minted channelId; Google did NOT
 * deliver and no files.watch / events.watch channel is created), but the
 * cursor baseline and the changed resource are REAL — seeded via the
 * certified action patterns (create_spreadsheet / append_row /
 * create_document / update_document / upload_file / create_event; Sheets
 * addSheet via the production batchUpdate wrapper) and re-fetched from LIVE
 * Google by the production receive pulls. Watch registration/renewal is NOT
 * certified. WATCH_CHANNEL_SECRET is minted in-process when absent (deploy
 * secret) — the HMAC verify path runs unweakened.
 *
 * Each redeliver proves BOTH freshness layers: watermark (advanced cursor →
 * 0 new) then dedup (pre-change cursor RESTORED → same change re-detected →
 * dedup row drops it).
 *
 * LIVE-PROVIDER surface: two smoke spreadsheets (Drive-trashed after), two
 * smoke docs (Drive-trashed), one Drive text file (trashed), one 2031-dated
 * calendar event with no attendees (deleted).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:google
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  runDirectSeedWebhookSmoke,
  type DirectSeedWebhookSmokeResult,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import { ALL_GOOGLE_WATCH_SPECS } from "@/tests/trigger-smoke/googleWatchWebhookSmoke";
import { makeRealGoogleWatchWebhookSmokeDeps } from "@/tests/trigger-smoke/googleWatchWebhookSmokeDeps";
import { resolveLiveSmokeAccount } from "@/tests/helpers/smokeAccount";

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
// Live smoke must name its target account EXPLICITLY (SMOKE_LIVE_*). It must
// never inherit the general-purpose SMOKE_ACCOUNT_ID, which pointed at a real
// production account and caused smoke workflows to be written into real data.
const LIVE_ACCOUNT = resolveLiveSmokeAccount();
const ACCOUNT_ID = LIVE_ACCOUNT?.accountId;
const USER_ID = LIVE_ACCOUNT?.userId;

const RUN = ALLOW_DB && ALLOW_TRIGGER && !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (google watch webhook) — needs ALLOW_DB_INTEGRATION_TESTS + " +
      "ALLOW_TRIGGER_SMOKE + Supabase env + SMOKE_LIVE_ACCOUNT_ID + SMOKE_LIVE_USER_ID (+ connected " +
      "google-sheets/google-docs/google-drive/google-calendar integrations).",
  );
}

function assertPass(r: DirectSeedWebhookSmokeResult, expectedEventType: string): void {
  console.log(JSON.stringify({ event: "trigger-smoke.google-watch.result", ...r }));
  expect(r.outcome).toBe("pass");
  expect(r.cleaned).toBe(true);
  expect(r.seededEventType).toBe(expectedEventType);
  expect(r.baselineRunCount).toBe(0);
  expect(r.deliverHttpStatus).toBe(200);
  expect(r.afterRunCount).toBe(1);
  expect(r.identityMatched).toBe(true);
  expect(r.terminalStatus).toBe("succeeded");
  expect(r.afterRedeliverRunCount).toBe(1);
  expect(r.dedupProven).toBe(true);
}

describeLive("trigger smoke: Google watch webhook family (real dev DB + real Google fetches)", () => {
  let supabase: SupabaseClient;
  let config: { supabase: SupabaseClient; accountId: string; userId: string };

  beforeAll(() => {
    supabase = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    config = {
      supabase,
      accountId: ACCOUNT_ID as string,
      userId: USER_ID as string,
    };
  });

  for (const spec of ALL_GOOGLE_WATCH_SPECS) {
    it(
      `${spec.label}: seed row + real baseline → real change + synthetic notification fires 1, terminal succeeded, watermark + dedup hold, 0 leaked`,
      async () => {
        const r = await runDirectSeedWebhookSmoke(
          makeRealGoogleWatchWebhookSmokeDeps(config, spec),
          spec,
          // Google-side propagation (changes.list / values.get visibility)
          // is absorbed by bounded re-lists.
          { afterDeliverAttempts: 8, afterDeliverSleepMs: 1000, dedupSettleMs: 1500 },
        );
        assertPass(r, spec.expectedEventType);
      },
      300_000,
    );
  }
});
