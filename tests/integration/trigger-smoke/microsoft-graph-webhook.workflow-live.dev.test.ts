/**
 * @jest-environment node
 *
 * Trigger-smoke — Microsoft Graph webhook LIVE proof (real dev DB + REAL
 * Graph resource fetches), one `it` per registered Microsoft webhook trigger
 * plus one validation-handshake probe per provider route:
 *
 *   microsoft-outlook:new_email / email_sent / email_flagged
 *   microsoft-outlook-calendar:event_changed
 *   microsoft-onedrive:file_changed
 *   microsoft-teams:new_channel_message
 *
 * HYBRID HONESTY SCOPE (see microsoftGraphWebhookSmoke.ts): the notification
 * is SYNTHETIC (direct-seeded subscription row; Microsoft did NOT deliver and
 * no Graph subscription is created), but the resource is REAL — seeded via
 * the certified action patterns and re-fetched from LIVE Graph by the
 * production receive path (clientState verify + hydration fetch +
 * receive-time filters + normalize + dispatch + dedup all UNCHANGED).
 * Graph subscription activation/renewal is NOT certified.
 *
 * LIVE-PROVIDER surface: Outlook self-sends (deleted after; flag PATCH for
 * email_flagged), one calendar event (deleted), one OneDrive file (deleted),
 * one Teams channel message into the smoke channel (NO delete action exists —
 * a crsmoke-marked artifact stays, same disposition as the certified
 * send_channel_message action-smoke).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     npm run smoke:triggers:microsoft
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  runDirectSeedWebhookSmoke,
  type DirectSeedWebhookSmokeResult,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import { ALL_GRAPH_WEBHOOK_SPECS } from "@/tests/trigger-smoke/microsoftGraphWebhookSmoke";
import {
  makeRealGraphWebhookSmokeDeps,
  probeGraphValidationHandshake,
} from "@/tests/trigger-smoke/microsoftGraphWebhookSmokeDeps";
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
    "SKIP trigger smoke (microsoft graph webhook) — needs ALLOW_DB_INTEGRATION_TESTS + " +
      "ALLOW_TRIGGER_SMOKE + Supabase env + SMOKE_LIVE_ACCOUNT_ID + SMOKE_LIVE_USER_ID (+ connected " +
      "Microsoft integrations; Teams also needs SMOKE_TEAMS_TEAM_ID/SMOKE_TEAMS_CHANNEL_ID).",
  );
}

const PROVIDERS = [
  "microsoft-outlook",
  "microsoft-outlook-calendar",
  "microsoft-onedrive",
  "microsoft-teams",
] as const;

function assertPass(r: DirectSeedWebhookSmokeResult, expectedEventType: string): void {
  console.log(JSON.stringify({ event: "trigger-smoke.microsoft-graph.result", ...r }));
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

describeLive("trigger smoke: Microsoft Graph webhook family (real dev DB + real Graph fetches)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const config = {
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
  };

  for (const provider of PROVIDERS) {
    it(`${provider}: validation handshake echoes the token as text/plain 200 through the real route`, async () => {
      const probe = await probeGraphValidationHandshake(provider);
      expect(probe.status).toBe(200);
      expect(probe.body).toMatch(/^crsmoke-vt-/);
      expect(probe.contentType ?? "").toContain("text/plain");
    }, 30_000);
  }

  for (const spec of ALL_GRAPH_WEBHOOK_SPECS) {
    const itMaybe =
      spec.provider === "microsoft-teams" &&
      (!process.env.SMOKE_TEAMS_TEAM_ID || !process.env.SMOKE_TEAMS_CHANNEL_ID)
        ? it.skip
        : it;
    itMaybe(
      `${spec.label}: seed row → real resource + synthetic notification fires 1, terminal succeeded, dedup holds, 0 leaked`,
      async () => {
        const r = await runDirectSeedWebhookSmoke(
          makeRealGraphWebhookSmokeDeps(config, spec),
          spec,
          // Graph transport/hydration lag between seed and fetch is
          // absorbed inside the deps (bounded scans); the run-list settle
          // uses the standard bounded re-list.
          { afterDeliverAttempts: 8, afterDeliverSleepMs: 1000, dedupSettleMs: 1500 },
        );
        assertPass(r, spec.expectedEventType);
      },
      300_000,
    );
  }
});
