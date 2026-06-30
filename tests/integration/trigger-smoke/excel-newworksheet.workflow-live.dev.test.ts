/**
 * @jest-environment node
 *
 * Trigger-smoke — microsoft-excel:new_worksheet LIVE polling-dispatch proof.
 *
 * Real dev DB + real Microsoft Graph (OneDrive + Excel). Creates a SMOKE-OWNED
 * workbook, arms the polling trigger via the real lifecycle (activation seeds the
 * worksheet snapshot), polls once (baseline-first: 0 fired), adds ONE worksheet
 * (certified create_worksheet), polls again through the REAL per-trigger Excel
 * poll handler (read → diff → enqueueRun) → exactly one run with the new worksheet
 * on its payload → drains it to terminal 'succeeded' → deletes the whole workbook
 * (OneDrive recycle bin) → 0 leaked.
 *
 * The smoke drives the per-trigger poll handler (the exact fn the cron
 * orchestrator's runOne calls), NOT the global runPollingTriggers() — that global
 * shell would poll + fire EVERY due polling workflow across all accounts on the
 * shared dev DB. Dispatch is 100% real; only the global selection shell is scoped.
 *
 * Gates (this DOES mutate OneDrive → real provider write):
 *   ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + ALLOW_LIVE_PROVIDER_SMOKE +
 *   ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE +
 *   Supabase env + SMOKE_ACCOUNT_ID + SMOKE_USER_ID +
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
import { createClient } from "@supabase/supabase-js";

import { runExcelNewWorksheetSmoke } from "@/tests/trigger-smoke/excelPollingSmoke";
import { makeRealExcelPollingSmokeDeps } from "@/tests/trigger-smoke/excelPollingSmokeDeps";

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
const ACCOUNT_ID = process.env.SMOKE_ACCOUNT_ID;
const USER_ID = process.env.SMOKE_USER_ID;
const EXCEL_CONNECTED = process.env.SMOKE_MICROSOFT_EXCEL_CONNECTED === "1";
const ONEDRIVE_CONNECTED = process.env.SMOKE_MICROSOFT_ONEDRIVE_CONNECTED === "1";

const RUN =
  ALLOW_DB && ALLOW_TRIGGER && ALLOW_LIVE && ALLOW_WRITE && ALLOW_DESTRUCTIVE &&
  !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID && EXCEL_CONNECTED && ONEDRIVE_CONNECTED;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP trigger smoke (excel new_worksheet) — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_TRIGGER_SMOKE + " +
      "ALLOW_LIVE_PROVIDER_SMOKE + ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE + " +
      "Supabase env + SMOKE_ACCOUNT_ID + SMOKE_USER_ID + SMOKE_MICROSOFT_EXCEL_CONNECTED + SMOKE_MICROSOFT_ONEDRIVE_CONNECTED.",
  );
}

describeLive("trigger smoke: microsoft-excel:new_worksheet (real dev DB + Graph, polling dispatch)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealExcelPollingSmokeDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
  });

  it("baseline-first poll fires 0, post-baseline worksheet fires exactly 1, terminal succeeded, 0 leaked", async () => {
    // Bounded re-poll to absorb Graph's create→read propagation lag (~up to 9s).
    const r = await runExcelNewWorksheetSmoke(deps, { afterPollAttempts: 6, afterPollSleepMs: 1500 });
    console.log(JSON.stringify({ event: "trigger-smoke.excel-new-worksheet.result", ...r }));

    expect(r.outcome).toBe("pass");
    expect(r.baselineRunCount).toBe(0);
    expect(r.afterRunCount).toBe(1);
    expect(r.firedWorksheetName).toBe(r.addedWorksheetName);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.cleaned).toBe(true);
  }, 120_000);
});
