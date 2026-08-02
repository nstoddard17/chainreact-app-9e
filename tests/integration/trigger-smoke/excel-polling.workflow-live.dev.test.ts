/**
 * @jest-environment node
 *
 * Trigger-smoke — Microsoft Excel CREATE-polling family LIVE dispatch proof.
 *
 * Real dev DB + real Microsoft Graph (OneDrive + Excel). One `it` per trigger,
 * each driving the spec-driven `runExcelPollingSmoke`:
 *   - new_worksheet  : create workbook → activate → poll(0) → create_worksheet → poll(1)
 *   - new_row        : create workbook → seed baseline row → activate → poll(0) → add_row → poll(1)
 *   - new_table_row  : create table workbook (seed row = baseline) → activate → poll(0) → add_table_row → poll(1)
 * then drain → terminal 'succeeded' → delete whole workbook (OneDrive recycle bin) → 0 leaked.
 *
 * Drives the per-trigger Excel poll handler (the fn the cron orchestrator's runOne
 * calls), NOT the global runPollingTriggers() — that global shell would poll + fire
 * every due polling workflow across all accounts on the shared dev DB. Dispatch is
 * 100% real; only the global selection shell is scoped.
 *
 * Gates (mutates OneDrive → real provider write):
 *   ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + ALLOW_LIVE_PROVIDER_SMOKE +
 *   ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE +
 *   Supabase env + SMOKE_LIVE_ACCOUNT_ID + SMOKE_LIVE_USER_ID +
 *   SMOKE_MICROSOFT_EXCEL_CONNECTED + SMOKE_MICROSOFT_ONEDRIVE_CONNECTED
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true \
 *     ALLOW_LIVE_PROVIDER_SMOKE=true ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true \
 *     ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true SMOKE_MICROSOFT_EXCEL_CONNECTED=1 \
 *     SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1 npm run smoke:triggers:excel
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  runExcelPollingSmoke,
  NEW_WORKSHEET_SPEC,
  NEW_ROW_SPEC,
  NEW_TABLE_ROW_SPEC,
  UPDATED_ROW_SPEC,
  UPDATED_TABLE_ROW_SPEC,
  type ExcelPollingTriggerSpec,
} from "@/tests/trigger-smoke/excelPollingSmoke";
import { makeRealExcelPollingSmokeDeps } from "@/tests/trigger-smoke/excelPollingSmokeDeps";
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
const ALLOW_LIVE = process.env.ALLOW_LIVE_PROVIDER_SMOKE === "true";
const ALLOW_WRITE = process.env.ALLOW_LIVE_PROVIDER_WRITE_SMOKE === "true";
const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_PROVIDER_SMOKE === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Live smoke must name its target account EXPLICITLY (SMOKE_LIVE_*). It must
// never inherit the general-purpose SMOKE_ACCOUNT_ID, which pointed at a real
// production account and caused smoke workflows to be written into real data.
const LIVE_ACCOUNT = resolveLiveSmokeAccount();
const ACCOUNT_ID = LIVE_ACCOUNT?.accountId;
const USER_ID = LIVE_ACCOUNT?.userId;
const EXCEL_CONNECTED = process.env.SMOKE_MICROSOFT_EXCEL_CONNECTED === "1";
const ONEDRIVE_CONNECTED = process.env.SMOKE_MICROSOFT_ONEDRIVE_CONNECTED === "1";

const RUN =
  ALLOW_DB && ALLOW_TRIGGER && ALLOW_LIVE && ALLOW_WRITE && ALLOW_DESTRUCTIVE &&
  !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID && EXCEL_CONNECTED && ONEDRIVE_CONNECTED;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (excel polling) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "ALLOW_LIVE_PROVIDER_SMOKE + ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE + " +
      "Supabase env + SMOKE_LIVE_ACCOUNT_ID + SMOKE_LIVE_USER_ID + SMOKE_MICROSOFT_EXCEL_CONNECTED + SMOKE_MICROSOFT_ONEDRIVE_CONNECTED.",
  );
}

describeLive("trigger smoke: microsoft-excel create-polling family (real dev DB + Graph)", () => {
  let supabase: SupabaseClient;
  let deps: ReturnType<typeof makeRealExcelPollingSmokeDeps>;

  beforeAll(() => {
    supabase = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    deps = makeRealExcelPollingSmokeDeps({
      supabase,
      accountId: ACCOUNT_ID as string,
      userId: USER_ID as string,
    });
  });

  const specs: ExcelPollingTriggerSpec[] = [
    NEW_WORKSHEET_SPEC,
    NEW_ROW_SPEC,
    NEW_TABLE_ROW_SPEC,
    UPDATED_ROW_SPEC,
    UPDATED_TABLE_ROW_SPEC,
  ];

  for (const spec of specs) {
    it(`${spec.label}: baseline poll 0, post-baseline add fires 1, terminal succeeded, 0 leaked`, async () => {
      // Bounded re-poll absorbs Graph's create→read propagation lag (~up to 9s).
      const r = await runExcelPollingSmoke(deps, spec, { afterPollAttempts: 6, afterPollSleepMs: 1500 });
      console.log(JSON.stringify({ event: "trigger-smoke.excel-polling.result", ...r }));

      expect(r.outcome).toBe("pass");
      expect(r.baselineRunCount).toBe(0);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.cleaned).toBe(true);
    }, 180_000);
  }
});
