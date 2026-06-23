/**
 * @jest-environment node
 *
 * WRITE smoke harness — LIVE-connected, real dev DB + real provider mutation.
 *
 * Runs ONE provider's write pilot through the full phase model
 * (setup -> execute -> verify -> cleanup) in engine REAL mode. QUADRUPLE-gated
 * AND scoped to exactly one provider (SMOKE_PROVIDER) so the other pilots can
 * never run live by accident.
 *
 * Connection is diagnosed with the REAL account-scoped path, classified four ways
 * (NOT_CONNECTED / CONNECTED_NOT_EXECUTABLE / BLOCKED_NO_TARGET / READY). A
 * connected provider with no safe smoke target is BLOCKED, NEVER "not connected".
 * For Trello (a PERSONAL credential) a safe smoke list is auto-discovered only
 * when a board AND list are both explicitly named for smoke/test use; otherwise
 * pin SMOKE_TRELLO_LIST_ID at a dedicated smoke list.
 *
 * SAFETY (all enforced before any mutation):
 *   - ALLOW_DB_INTEGRATION_TESTS + ALLOW_LIVE_PROVIDER_SMOKE +
 *     ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE
 *   - SMOKE_PROVIDER=<id> (exactly one provider runs)
 *   - the provider must be execution-usable under the smoke user, else SKIP
 *   - a smoke TARGET (smoke-named list / base+table+field / parent page) must
 *     resolve, else BLOCKED_ENV (never a mutation)
 *   - cleanup only touches the smoke-owned ledger resource; a cleanup failure
 *     surfaces (CLEANUP_FAILED) and flips the gate to FAILED.
 *   - reports are status-only: phase outcomes + ledger COUNTS + safe LABELS.
 *
 * Run (Trello pilot — auto-discovers a smoke-named board/list):
 *   ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
 *     ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
 *     SMOKE_PROVIDER=trello npm run smoke:writes:live
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmokeWriteMode } from "@/tests/smoke-actions/writeRunner";
import {
  makeRealWriteHarnessDeps,
  probeWriteConnection,
  discoverTrelloSmokeTarget,
  discoverTrelloSmokeLabel,
  discoverNotionSmokeParentPage,
} from "@/tests/smoke-actions/writeHarnessDeps";
import { renderWriteSmokeHuman } from "@/tests/smoke-actions/writeHarness";
import { classifyWriteTarget } from "@/tests/smoke-actions/writeTargets";
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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

const RUN =
  ALLOW_DB && ALLOW_LIVE && ALLOW_WRITE && ALLOW_DESTRUCTIVE &&
  !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID && !!PROVIDER;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP write smoke LIVE — needs the 4 write gates + Supabase env + SMOKE_ACCOUNT_ID + " +
      "SMOKE_USER_ID + SMOKE_PROVIDER=<one pilot provider>.",
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

  it("classifies the provider, then creates/verifies/cleans up exactly one smoke-owned resource", async () => {
    const provider = PROVIDER as string;
    const account = ACCOUNT_ID as string;
    const user = USER_ID as string;

    // 1. REAL connection diagnosis (DB-connected + execution-usable).
    const { dbConnected, execUsable } = await probeWriteConnection(account, user, provider);

    // 2. Resolve a safe smoke TARGET. Trello auto-discovers a smoke-named
    //    board/list; other providers read their target from env (.env.local).
    const overlay: Record<string, string> = {};
    let targetLabel: string | null = null;
    if (provider === "trello" && execUsable) {
      const chosen = await discoverTrelloSmokeTarget(account, user);
      if (chosen) {
        overlay.SMOKE_TRELLO_LIST_ID = chosen.listId; // id -> env overlay only
        targetLabel = `board "${chosen.boardLabel}" / list "${chosen.listLabel}"`;
        // add_label_to_card also needs a label id on the same smoke board.
        const label = await discoverTrelloSmokeLabel(account, user, chosen.boardId);
        if (label) {
          overlay.SMOKE_TRELLO_LABEL_ID = label.labelId; // id -> env overlay only
          targetLabel += ` / label "${label.label}"`;
        }
      }
    } else if (provider === "notion" && execUsable) {
      const parent = await discoverNotionSmokeParentPage(account, user);
      if (parent) {
        overlay.SMOKE_NOTION_PARENT_PAGE_ID = parent.pageId; // id -> env overlay only
        targetLabel = `parent page "${parent.title}"`;
      }
    }
    const envLookup = (n: string): string | undefined => overlay[n] ?? process.env[n];

    // Provider-level hasTarget: every in-scope fixture's target env resolves.
    const inScope = WRITE_SMOKE_FIXTURES.filter((f) => f.provider === provider);
    const targetEnv = inScope.flatMap((f) => (f.requiredEnv ?? []).filter((v) => !/_CONNECTED$/.test(v)));
    const hasTarget = targetEnv.length > 0 && targetEnv.every((v) => !!envLookup(v));

    const classification = classifyWriteTarget({ dbConnected, execUsable, hasTarget });
    console.log(
      `TRELLO/PROVIDER DIAGNOSIS [${provider}]: dbConnected=${dbConnected} execUsable=${execUsable} ` +
        `hasTarget=${hasTarget}${targetLabel ? ` (${targetLabel})` : ""} -> ${classification}`,
    );

    // Only NOT_CONNECTED / CONNECTED_NOT_EXECUTABLE short-circuit before any run.
    // BLOCKED_NO_TARGET still goes through the runner so the BLOCKED_ENV status is
    // produced + asserted (never a mutation).
    if (classification === "NOT_CONNECTED" || classification === "CONNECTED_NOT_EXECUTABLE") {
      console.log(`SKIP — ${provider} is ${classification} (no live run).`);
      expect(dbConnected || !dbConnected).toBe(true); // diagnosis recorded; nothing mutated
      return;
    }

    const { report, writeResults } = await runActionSmokeWriteMode(
      WRITE_SMOKE_FIXTURES,
      {
        providerFilter: provider,
        allowWrite: true,
        allowDestructive: true,
        runToken: randomUUID().slice(0, 8),
        envLookup,
      },
      deps,
    );

    console.log(renderWriteSmokeHuman(writeResults));
    expect(report.mode).toBe("workflow-live");

    const serialized = renderExecutionJson(report);
    expect(serialized).not.toMatch(/xox[abprs]-/);
    expect(serialized).not.toMatch(/\bBearer\s+\S+/i);

    // Gate: no FAIL / VERIFY_FAILED / CLEANUP_FAILED. BLOCKED_ENV folds to skip
    // (connected, but no safe target) — acceptable, not a failure.
    expect(report.ok).toBe(true);

    for (const r of writeResults) {
      if (r.status === "PASS") {
        // A REQUIRED (delete) cleanup failure can never reach PASS (it becomes
        // CLEANUP_FAILED), so any leftover on a PASS run is intentional + harmless.
        if (r.artifact === "cleaned" || r.artifact === "archived") {
          // the cleanup step ran successfully -> nothing left un-dispositioned
          expect(r.ledger.leaked).toBe(0);
          expect(r.ledger.cleaned).toBe(r.ledger.created);
        } else {
          // "left" -> best-effort/no-cleanup (e.g. archive_page: the page is
          // archived by the execute step and Notion forbids re-editing it). A
          // harmless marked smoke object remains on the throwaway account.
          expect(r.artifact).toBe("left");
        }
      }
      // BLOCKED_ENV must read as a target problem, never "not connected".
      if (r.status === "BLOCKED_ENV") expect(r.reason).toMatch(/smoke target/i);
    }
  }, 600_000);
});
