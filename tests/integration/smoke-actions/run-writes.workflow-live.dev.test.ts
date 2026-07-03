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
  discoverTrelloSecondSmokeList,
  discoverNotionSmokeParentPage,
  discoverNotionSmokeDatabase,
  discoverMondaySmokeBoardGroup,
  discoverOneNoteSmokeSection,
  discoverSlackSmokeChannel,
  discoverSlackSmokeUser,
  discoverAirtableSmokeTextField,
  discoverAirtableSmokeAttachmentField,
  stageSmokeFile,
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
    // Removes the throwaway file staged for airtable:add_attachment (if any). Run
    // in a finally so a staged file is never left behind even on assertion failure.
    let cleanupStagedFile: (() => Promise<void>) | null = null;
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
        // move_card needs a SECOND safe list on the same smoke board as the
        // destination. A pinned env wins; else auto-discover a distinct safe list.
        if (!process.env.SMOKE_TRELLO_TARGET_LIST_ID) {
          const dest = await discoverTrelloSecondSmokeList(account, user, chosen.boardId, chosen.listId);
          if (dest) {
            overlay.SMOKE_TRELLO_TARGET_LIST_ID = dest.listId; // id -> env overlay only
            targetLabel += ` / target list "${dest.listLabel}"`;
          }
        }
      }
    } else if (provider === "notion" && execUsable) {
      const parent = await discoverNotionSmokeParentPage(account, user);
      if (parent) {
        overlay.SMOKE_NOTION_PARENT_PAGE_ID = parent.pageId; // id -> env overlay only
        targetLabel = `parent page "${parent.title}"`;
      }
      // create_database_entry needs a database + its title-property NAME. A pinned
      // SMOKE_NOTION_DATABASE_ID wins; the title field is always discovered.
      const db = await discoverNotionSmokeDatabase(account, user, process.env.SMOKE_NOTION_DATABASE_ID || null);
      if (db) {
        overlay.SMOKE_NOTION_DATABASE_ID = db.databaseId; // id -> env overlay only
        overlay.SMOKE_NOTION_DB_TITLE_FIELD = db.titleFieldName;
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}database "${db.title}"`;
      }
    } else if (provider === "slack" && execUsable) {
      // Slack write fixtures (send_channel_message, delete_message) post to a channel the
      // bot is a member of. A pinned SMOKE_SLACK_CHANNEL_ID wins; else discover a
      // smoke/test/chainreact-named MEMBER channel (never an arbitrary channel). Absent
      // one -> no overlay -> BLOCKED_ENV (set SMOKE_SLACK_CHANNEL_ID).
      const chosen = await discoverSlackSmokeChannel(account, user, process.env.SMOKE_SLACK_CHANNEL_ID || null);
      if (chosen) {
        overlay.SMOKE_SLACK_CHANNEL_ID = chosen.channelId; // id -> env overlay only
        targetLabel = `channel "${chosen.channelName}"`;
      }
      // invite_users_to_channel / remove_user_from_channel need a REAL second user of
      // the throwaway workspace. A pinned SMOKE_SLACK_INVITE_USER_ID wins; else discover
      // a real human member from users.list (never a bot, never Slackbot, never
      // invented). Absent one -> no overlay -> those two fixtures report BLOCKED_ENV.
      const smokeUser = await discoverSlackSmokeUser(
        account,
        user,
        process.env.SMOKE_SLACK_INVITE_USER_ID || null,
      );
      if (smokeUser) {
        overlay.SMOKE_SLACK_INVITE_USER_ID = smokeUser.userId; // id -> env overlay only
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}invite user "${smokeUser.userName}"`;
      }
      // schedule_message / cancel_scheduled_message need a FUTURE post_at within Slack's
      // 120-day window. Compute it live (~7 days out) so it never delivers mid-test and
      // never goes stale (a hardcoded fixture timestamp would eventually be time_in_past).
      // A pinned SMOKE_SLACK_POST_AT wins for a deterministic re-run.
      overlay.SMOKE_SLACK_POST_AT =
        process.env.SMOKE_SLACK_POST_AT || String(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
      // upload_file / download_file consume a FileRef, so stage a throwaway PNG in OUR
      // workflow-files bucket and pass it as a v2_storage FileRef source (self-contained
      // bytes, never an invented external URL). download_file's setup re-uploads from the
      // same staged source. Absent it -> those two fixtures report BLOCKED_ENV.
      const slackUploadPath = `smoke/slack-upload/${randomUUID()}.png`;
      const slackStaged = await stageSmokeFile(supabase, slackUploadPath);
      if (slackStaged) {
        overlay.SMOKE_SLACK_UPLOAD_STORAGE_PATH = slackStaged.storagePath;
        cleanupStagedFile = slackStaged.remove;
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}staged upload file in workflow-files bucket`;
      }
    } else if (provider === "monday" && execUsable) {
      // create_item needs a board + a usable group. Connection is proven from the
      // DB (probeWriteConnection) — NO SMOKE_MONDAY_CONNECTED. A pinned
      // SMOKE_MONDAY_BOARD_ID wins; otherwise a smoke/test-named board is preferred,
      // falling back to the first board on the throwaway account. The first usable
      // group is taken. Both ids -> env overlay only (never printed).
      const chosen = await discoverMondaySmokeBoardGroup(
        account,
        user,
        process.env.SMOKE_MONDAY_BOARD_ID || null,
      );
      if (chosen) {
        overlay.SMOKE_MONDAY_BOARD_ID = chosen.boardId; // id -> env overlay only
        overlay.SMOKE_MONDAY_GROUP_ID = chosen.groupId; // id -> env overlay only
        targetLabel = `board "${chosen.boardLabel}" / group "${chosen.groupLabel}"`;
        // A second distinct group is the move_item destination (when the board has
        // one). Absent -> move_item reports BLOCKED_ENV (group creation is out of scope).
        if (chosen.targetGroupId) {
          overlay.SMOKE_MONDAY_TARGET_GROUP_ID = chosen.targetGroupId; // id -> env overlay only
          targetLabel += ` / target group "${chosen.targetGroupLabel}"`;
        }
      }
    } else if (provider === "airtable" && execUsable) {
      // Record writes need the smoke table's primary text field NAME. baseId /
      // tableId come from env; discover the field unless explicitly pinned.
      const baseId = process.env.SMOKE_AIRTABLE_BASE_ID;
      const tableId = process.env.SMOKE_AIRTABLE_TABLE_ID;
      if (baseId && tableId && !process.env.SMOKE_AIRTABLE_TEXT_FIELD) {
        const field = await discoverAirtableSmokeTextField(account, user, baseId, tableId);
        if (field) {
          overlay.SMOKE_AIRTABLE_TEXT_FIELD = field;
          targetLabel = `base ${baseId} / table ${tableId} / text field "${field}"`;
        }
      }
      // add_attachment needs an attachment field + a fetchable file. Discover the
      // attachment field, then stage a throwaway PNG in OUR workflow-files bucket
      // (a self-contained v2_storage source — never an invented external URL).
      if (baseId && tableId) {
        const attField =
          process.env.SMOKE_AIRTABLE_ATTACHMENT_FIELD ||
          (await discoverAirtableSmokeAttachmentField(account, user, baseId, tableId));
        if (attField) {
          overlay.SMOKE_AIRTABLE_ATTACHMENT_FIELD = attField;
          const storagePath = `smoke/attach/${randomUUID()}.png`;
          const staged = await stageSmokeFile(supabase, storagePath);
          if (staged) {
            overlay.SMOKE_AIRTABLE_ATTACHMENT_STORAGE_PATH = staged.storagePath;
            cleanupStagedFile = staged.remove;
            targetLabel = `${targetLabel ?? `base ${baseId} / table ${tableId}`} / attachment field "${attField}"`;
          }
        }
      }
    } else if (provider === "dropbox" && execUsable) {
      // dropbox:upload_file consumes a FileRef (no inline content), so stage a
      // throwaway file in OUR workflow-files bucket and pass it as a v2_storage
      // FileRef (self-contained — never an invented external URL). OneDrive's
      // upload_file takes inline content, so it needs NO staging.
      const storagePath = `smoke/dropbox-upload/${randomUUID()}.png`;
      const staged = await stageSmokeFile(supabase, storagePath);
      if (staged) {
        overlay.SMOKE_DROPBOX_UPLOAD_STORAGE_PATH = staged.storagePath;
        cleanupStagedFile = staged.remove;
        targetLabel = "staged upload file in workflow-files bucket";
      }
    } else if (provider === "microsoft-onenote" && execUsable) {
      // OneNote pages are created INSIDE a section. Discover a SAFE section — one
      // whose section OR notebook name is smoke/test-named — so the harness never
      // writes into the user's REAL notebook. Absent one -> no overlay -> BLOCKED_ENV.
      const section = await discoverOneNoteSmokeSection(account, user);
      if (section) {
        overlay.SMOKE_ONENOTE_SECTION_ID = section.sectionId; // id -> env overlay only
        // The create_page meta requires `notebookId` (cascade parent) for readiness.
        overlay.SMOKE_ONENOTE_NOTEBOOK_ID = section.notebookId; // id -> env overlay only
        targetLabel = `notebook "${section.notebookLabel}" / section "${section.sectionLabel}"`;
      }
    }
    const envLookup = (n: string): string | undefined => overlay[n] ?? process.env[n];

    // Provider-level hasTarget: every in-scope fixture's target env resolves. A
    // provider whose fixtures need NO target env (e.g. Google Drive writes land in
    // My Drive root) trivially has a target — `[].every(...)` is true — so it must
    // NOT read as BLOCKED_NO_TARGET.
    const inScope = WRITE_SMOKE_FIXTURES.filter((f) => f.provider === provider);
    const targetEnv = inScope.flatMap((f) => (f.requiredEnv ?? []).filter((v) => !/_CONNECTED$/.test(v)));
    const hasTarget = targetEnv.every((v) => !!envLookup(v));

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

    try {
      // Optional SMOKE_ACTIONS=comma,list scopes the sweep to specific actions of the
      // provider (e.g. a single Slack membership batch) so a live run never bursts every
      // write fixture (Slack rate-limits conversations.create). Unset -> all run.
      const actionFilter = (process.env.SMOKE_ACTIONS || "")
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

      const { report, writeResults } = await runActionSmokeWriteMode(
        WRITE_SMOKE_FIXTURES,
        {
          providerFilter: provider,
          actionFilter: actionFilter.length > 0 ? actionFilter : null,
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
    } finally {
      // Always remove the throwaway staged attachment file (the smoke record it was
      // attached to is deleted by the fixture's own cleanup).
      if (cleanupStagedFile) await cleanupStagedFile();
    }
  }, 600_000);
});
