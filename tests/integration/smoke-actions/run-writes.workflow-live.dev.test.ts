/**
 * @jest-environment node
 *
 * WRITE smoke harness — LIVE-connected, real dev DB + real provider mutation.
 *
 * Runs ONE provider's write pilot through the full phase model
 * (setup -> execute -> verify -> cleanup) in engine REAL mode. This is the one
 * path that creates + deletes a real provider resource, so it is QUADRUPLE-gated
 * AND requires an explicit single-provider scope (SMOKE_PROVIDER) so the other
 * pilots can never run live by accident.
 *
 * SAFETY (all enforced before any mutation):
 *   - ALLOW_DB_INTEGRATION_TESTS=true        (dev-DB master gate)
 *   - ALLOW_LIVE_PROVIDER_SMOKE=true         (live gate)
 *   - ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true   (write gate)
 *   - ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true  (destructive gate — pilots clean up)
 *   - SMOKE_PROVIDER=<id>                     (exactly one provider runs)
 *   - the provider must be CONNECTED on SMOKE_ACCOUNT_ID, else SKIP (never FAIL)
 *   - the pilot's selector env (e.g. SMOKE_TRELLO_LIST_ID) must point at a
 *     DEDICATED smoke board/list/base, else the fixture SKIPs on missing env
 *   - cleanup may only touch the smoke-owned resource the run created; a cleanup
 *     failure is surfaced (CLEANUP_FAILED) and flips the gate to FAILED.
 *   - reports are status-only: phase outcomes + ledger COUNTS — never ids/output.
 *
 * Run (Trello pilot, against a dedicated smoke board/list):
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
 *     ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
 *     SMOKE_ACCOUNT_ID=... SMOKE_USER_ID=... \
 *     SMOKE_PROVIDER=trello SMOKE_TRELLO_CONNECTED=1 SMOKE_TRELLO_LIST_ID=<list id> \
 *     npm run smoke:writes:live
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmokeWriteMode } from "@/tests/smoke-actions/writeRunner";
import {
  makeRealWriteHarnessDeps,
  isProviderConnectedForWrite,
} from "@/tests/smoke-actions/writeHarnessDeps";
import { renderWriteSmokeHuman } from "@/tests/smoke-actions/writeHarness";
import { renderExecutionJson } from "@/scripts/chainreact/smoke/core";

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
const ALLOW_LIVE = process.env.ALLOW_LIVE_PROVIDER_SMOKE === "true";
const ALLOW_WRITE = process.env.ALLOW_LIVE_PROVIDER_WRITE_SMOKE === "true";
const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_PROVIDER_SMOKE === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCOUNT_ID = process.env.SMOKE_ACCOUNT_ID;
const USER_ID = process.env.SMOKE_USER_ID;
const PROVIDER = process.env.SMOKE_PROVIDER || null;

// QUADRUPLE-gated + a single explicit provider scope (no all-pilots live run).
const RUN =
  ALLOW_DB &&
  ALLOW_LIVE &&
  ALLOW_WRITE &&
  ALLOW_DESTRUCTIVE &&
  !!URL &&
  !!SERVICE_KEY &&
  !!ACCOUNT_ID &&
  !!USER_ID &&
  !!PROVIDER;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP write smoke LIVE — needs ALLOW_DB_INTEGRATION_TESTS + ALLOW_LIVE_PROVIDER_SMOKE + " +
      "ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE, plus " +
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SMOKE_ACCOUNT_ID + SMOKE_USER_ID + " +
      "SMOKE_PROVIDER=<one pilot provider>. Creates + cleans up ONE real smoke-owned resource.",
  );
}

describeLive("write smoke: LIVE pilot (real dev DB + real provider mutation)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealWriteHarnessDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
    newUuid: randomUUID,
  });

  it("creates, verifies the marker, and cleans up exactly one smoke-owned resource", async () => {
    const provider = PROVIDER as string;

    // Connection precheck: SKIP cleanly (never FAIL) if the pilot provider is not
    // connected on the smoke account.
    const connected = await isProviderConnectedForWrite(ACCOUNT_ID as string, provider);
    if (!connected) {
      console.log(`SKIP — provider "${provider}" is not connected on the smoke account.`);
      return;
    }

    const { report, writeResults } = await runActionSmokeWriteMode(
      WRITE_SMOKE_FIXTURES,
      {
        providerFilter: provider,
        allowWrite: true,
        allowDestructive: true,
        runToken: randomUUID().slice(0, 8),
      },
      deps,
    );

    console.log(renderWriteSmokeHuman(writeResults));

    expect(report.mode).toBe("workflow-live");

    // No data leak: the serialized report carries no obvious id/token shapes.
    const serialized = renderExecutionJson(report);
    expect(serialized).not.toMatch(/xox[abprs]-/);
    expect(serialized).not.toMatch(/\bBearer\s+\S+/i);

    // Gate: no FAIL / VERIFY_FAILED / CLEANUP_FAILED. A SKIP (missing selector env)
    // is acceptable and does not fail the suite — it just means the operator has
    // not pointed the pilot at a dedicated smoke target yet.
    expect(report.ok).toBe(true);

    // If the pilot actually ran (not a SKIP), assert it left nothing behind.
    for (const r of writeResults) {
      if (r.status === "PASS") {
        expect(r.ledger.leaked).toBe(0);
        expect(r.ledger.cleaned).toBe(r.ledger.created);
      }
    }
  }, 600_000);
});
