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
  discoverGmailSelfAddress,
  stageGmailAttachmentMessage,
  discoverHubSpotDealStage,
  discoverHubSpotTicketStage,
  stageHubSpotLineItemDeal,
  stageHubSpotListMembershipTarget,
  discoverMailchimpSmokeAudience,
  discoverOutlookSelfAddress,
  stageOutlookSeedMessage,
  discoverTeamsSmokeChat,
  discoverShopifyLocation,
  stageShopifyOrderProduct,
  stageShopifyInventoryTarget,
  stageGithubSmokeRepo,
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
    // Per-run marker token, hoisted so a provider staging branch (e.g. the Gmail
    // attachment seed) can name its throwaway resource with the SAME marker the write
    // harness builds (`crsmoke-<runToken>-`). Passed verbatim to the runner below.
    const runToken = randomUUID().slice(0, 8);
    // Removes the throwaway file staged for airtable:add_attachment (if any). Run
    // in a finally so a staged file is never left behind even on assertion failure.
    let cleanupStagedFile: (() => Promise<void>) | null = null;
    // Trashes the Gmail attachment seed message (get_attachment). Run in the finally.
    let cleanupGmailAttachment: (() => Promise<void>) | null = null;
    // Permanently deletes the Outlook mail seeds (reply/forward/attachment). Finally.
    const cleanupOutlookSeeds: Array<() => Promise<void>> = [];
    // Deletes the staged Shopify products (order target + tracked inventory). Finally.
    const cleanupShopifyStaged: Array<() => Promise<void>> = [];
    // Archives the staged HubSpot line-item parent deal. Run in the finally.
    let cleanupHubSpotDeal: (() => Promise<void>) | null = null;
    // Deletes the staged HubSpot smoke list + archives its contact. Run in the finally.
    let cleanupHubSpotList: (() => Promise<void>) | null = null;
    // GitHub staged shared repo teardown (no-op: no delete_repo scope). Run in the finally.
    let cleanupGithubStaged: (() => Promise<void>) | null = null;
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
    } else if (provider === "gmail" && execUsable) {
      // create_draft / add_label / remove_label address a smoke draft to the connected
      // account's OWN inbox (never sent). Discover the self address via users.getProfile;
      // a pinned SMOKE_GMAIL_SELF wins. Absent -> no overlay -> those fixtures BLOCKED_ENV.
      const self = process.env.SMOKE_GMAIL_SELF
        ? { email: process.env.SMOKE_GMAIL_SELF }
        : await discoverGmailSelfAddress(account, user);
      if (self) {
        overlay.SMOKE_GMAIL_SELF = self.email; // own address -> env overlay only
        targetLabel = "draft to self (own inbox)";
      }
      // get_attachment needs a real message carrying an attachment. send_email has no
      // attachments field, so self-send a smoke seed with one tiny text attachment
      // (marker filename) and resolve the Gmail-assigned attachmentId. The seed message
      // is trashed in the finally. Absent -> those envs unset -> get_attachment BLOCKED_ENV.
      const attach = await stageGmailAttachmentMessage(account, user, `crsmoke-${runToken}-`);
      if (attach) {
        overlay.SMOKE_GMAIL_ATTACHMENT_MESSAGE_ID = attach.messageId; // id -> env overlay only
        overlay.SMOKE_GMAIL_ATTACHMENT_ID = attach.attachmentId; // id -> env overlay only
        cleanupGmailAttachment = attach.remove;
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}attachment seed message`;
      }
    } else if (provider === "hubspot" && execUsable) {
      // create_deal / update_deal need a REAL deal pipeline + stage id (HubSpot
      // rejects invented stage ids). A pinned SMOKE_HUBSPOT_DEAL_PIPELINE_ID wins;
      // else the portal's first non-archived deal pipeline + its first stage is
      // discovered. Both ids -> env overlay only (never printed). Absent -> the
      // deal fixtures report BLOCKED_ENV; contact/company fixtures need no target.
      const chosen = await discoverHubSpotDealStage(
        account,
        user,
        process.env.SMOKE_HUBSPOT_DEAL_PIPELINE_ID || null,
      );
      if (chosen) {
        overlay.SMOKE_HUBSPOT_DEAL_PIPELINE_ID = chosen.pipelineId; // id -> env overlay only
        overlay.SMOKE_HUBSPOT_DEAL_STAGE_ID = chosen.stageId; // id -> env overlay only
        targetLabel = `deal pipeline "${chosen.pipelineLabel}" / stage "${chosen.stageLabel}"`;
        // Line-item fixtures need a PARENT deal. A fixture-created deal would enter
        // the run ledger with no cleanup action and break the cleaned==created PASS
        // gate, so stage ONE smoke deal here (Gmail attachment-seed precedent), pass
        // its id via env overlay, and archive it in the finally.
        const stagedDeal = await stageHubSpotLineItemDeal(
          account,
          user,
          `crsmoke-${runToken}-`,
          chosen.pipelineId,
          chosen.stageId,
        );
        if (stagedDeal) {
          overlay.SMOKE_HUBSPOT_LINEITEM_DEAL_ID = stagedDeal.dealId; // id -> env overlay only
          cleanupHubSpotDeal = stagedDeal.remove;
          targetLabel += " / staged line-item parent deal";
        }
      }
      // add_contact_to_list / remove_from_list need a MANUAL contacts list + a
      // marker contact. Staged outside the harness (pinned/smoke-named list
      // reused, else a crsmoke list is created); ids ride the env overlay and the
      // staged objects are torn down in the finally (list deleted when staged,
      // contact archived).
      const stagedList = await stageHubSpotListMembershipTarget(
        account,
        user,
        `crsmoke-${runToken}-`,
        process.env.SMOKE_HUBSPOT_LIST_ID || null,
      );
      if (stagedList) {
        overlay.SMOKE_HUBSPOT_LIST_ID = stagedList.listId; // id -> env overlay only
        overlay.SMOKE_HUBSPOT_LIST_CONTACT_ID = stagedList.contactId; // id -> env overlay only
        overlay.SMOKE_HUBSPOT_LIST_CONTACT_EMAIL = stagedList.email;
        cleanupHubSpotList = stagedList.remove;
        targetLabel =
          `${targetLabel ? `${targetLabel} / ` : ""}list "${stagedList.listLabel}" + staged contact`;
      }
      // create_ticket / update_ticket need a REAL ticket pipeline + stage id (same
      // never-invent rule). A pinned SMOKE_HUBSPOT_TICKET_PIPELINE_ID wins; else the
      // portal's first non-archived ticket pipeline + its first stage is discovered.
      const ticketChosen = await discoverHubSpotTicketStage(
        account,
        user,
        process.env.SMOKE_HUBSPOT_TICKET_PIPELINE_ID || null,
      );
      if (ticketChosen) {
        overlay.SMOKE_HUBSPOT_TICKET_PIPELINE_ID = ticketChosen.pipelineId; // id -> env overlay only
        overlay.SMOKE_HUBSPOT_TICKET_STAGE_ID = ticketChosen.stageId; // id -> env overlay only
        targetLabel =
          `${targetLabel ? `${targetLabel} / ` : ""}` +
          `ticket pipeline "${ticketChosen.pipelineLabel}" / stage "${ticketChosen.stageLabel}"`;
      }
    } else if (provider === "mailchimp" && execUsable) {
      // Subscriber-lifecycle fixtures need an audience + per-fixture smoke
      // subscriber emails. The audience is discovered (pinned env wins ->
      // smoke/test-named -> first audience on the throwaway account). Emails
      // PLUS-ADDRESS the connected account's own mailbox (Mailchimp rejects
      // fake domains like example.com) with the run marker + a role suffix —
      // real operator-owned destinations; adding a member sends NO mail. Each
      // fixture gets a DISTINCT address so parallel lifecycles never collide,
      // and every member is torn down by its own remove_subscriber cleanup.
      const chosen = await discoverMailchimpSmokeAudience(
        account,
        user,
        process.env.SMOKE_MAILCHIMP_AUDIENCE_ID || null,
      );
      if (chosen) {
        overlay.SMOKE_MAILCHIMP_AUDIENCE_ID = chosen.audienceId; // id -> env overlay only
        const addr = (role: string): string =>
          `${chosen.ownerLocal}+crsmoke-${runToken}-${role}@${chosen.ownerDomain}`;
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_ADD = addr("add");
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_UPDATE = addr("upd");
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_UNSUB = addr("uns");
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_TAGADD = addr("tga");
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_TAGREMOVE = addr("tgr");
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_REMOVE = addr("rem");
        // Finisher batch: add_note / create_custom_event seed their own members;
        // create_audience needs the owner email for CAN-SPAM campaign_defaults;
        // the custom event NAME must satisfy Mailchimp's ^[a-z][a-z0-9_]{0,29}$
        // (the dashed crsmoke- marker is invalid there, so build an underscore
        // variant from the same run token).
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_NOTE = addr("note");
        overlay.SMOKE_MAILCHIMP_SUB_EMAIL_EVENT = addr("evt");
        overlay.SMOKE_MAILCHIMP_OWNER_EMAIL = `${chosen.ownerLocal}@${chosen.ownerDomain}`;
        overlay.SMOKE_MAILCHIMP_EVENT_NAME = `crsmoke_${runToken.replace(/[^a-z0-9]/gi, "").toLowerCase()}_ev`;
        targetLabel = `audience "${chosen.audienceLabel}" / plus-addressed owner mailbox`;
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
      // add_file / download_file consume a FileRef, so stage a throwaway PNG in OUR
      // workflow-files bucket and pass it as a v2_storage FileRef source (Slack files
      // precedent — self-contained bytes, never an invented external URL).
      // download_file's setup re-uploads from the same staged source. Absent it ->
      // those two fixtures report BLOCKED_ENV. Monday's image processor 422-rejects
      // the 1x1 PNG ("Could not identify image size"), so stage the 5x5 variant.
      const mondayUploadPath = `smoke/monday-upload/${randomUUID()}.png`;
      const mondayStaged = await stageSmokeFile(supabase, mondayUploadPath, "png5x5");
      if (mondayStaged) {
        overlay.SMOKE_MONDAY_UPLOAD_STORAGE_PATH = mondayStaged.storagePath;
        cleanupStagedFile = mondayStaged.remove;
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}staged upload file in workflow-files bucket`;
      }
    } else if (provider === "microsoft-outlook" && execUsable) {
      // send_email / forward_email self-address the connected throwaway mailbox —
      // mail never leaves the smoke account. A pinned SMOKE_OUTLOOK_SELF wins; else
      // discover via Graph /me. Absent -> those fixtures report BLOCKED_ENV.
      const self = process.env.SMOKE_OUTLOOK_SELF
        ? { email: process.env.SMOKE_OUTLOOK_SELF }
        : await discoverOutlookSelfAddress(account, user);
      if (self) {
        overlay.SMOKE_OUTLOOK_SELF = self.email; // own address -> env overlay only
        targetLabel = "self mailbox";
      }
      // reply_to_email / forward_email need a REAL received message (Graph cannot
      // reply to a draft), and get_attachment needs a message carrying a real
      // fileAttachment. Self-send marker-subjected seeds (Gmail attachment-seed
      // precedent); each remove() permanently deletes both the inbox and Sent
      // Items copies in the finally. Absent -> those fixtures report BLOCKED_ENV.
      const seedReply = await stageOutlookSeedMessage(account, user, `crsmoke-${runToken}-`, "seedreply");
      if (seedReply) {
        overlay.SMOKE_OUTLOOK_SEED_REPLY_ID = seedReply.messageId; // id -> env overlay only
        cleanupOutlookSeeds.push(seedReply.remove);
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}reply seed`;
      }
      const seedFwd = await stageOutlookSeedMessage(account, user, `crsmoke-${runToken}-`, "seedfwd");
      if (seedFwd) {
        overlay.SMOKE_OUTLOOK_SEED_FWD_ID = seedFwd.messageId; // id -> env overlay only
        cleanupOutlookSeeds.push(seedFwd.remove);
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}forward seed`;
      }
      const seedAttach = await stageOutlookSeedMessage(
        account,
        user,
        `crsmoke-${runToken}-`,
        "attachseed",
        { withAttachment: true },
      );
      if (seedAttach) {
        overlay.SMOKE_OUTLOOK_ATTACHMENT_MESSAGE_ID = seedAttach.messageId; // id -> env overlay only
        cleanupOutlookSeeds.push(seedAttach.remove);
        targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}attachment seed`;
      }
    } else if (provider === "microsoft-teams" && execUsable) {
      // Channel sends target the PINNED smoke team/channel (SMOKE_TEAMS_TEAM_ID /
      // SMOKE_TEAMS_CHANNEL_ID — same envs the certified reads use; already in
      // .env.local, no overlay needed). send_chat_message needs an EXISTING chat
      // (Batch 1 has no Chat.Create): pinned SMOKE_TEAMS_CHAT_ID wins, else
      // discover a smoke/test-topic chat, else the first chat on the throwaway
      // tenant. Absent any chat -> that one fixture reports BLOCKED_ENV.
      const chat = await discoverTeamsSmokeChat(
        account,
        user,
        process.env.SMOKE_TEAMS_CHAT_ID || null,
      );
      if (chat) {
        overlay.SMOKE_TEAMS_CHAT_ID = chat.chatId; // id -> env overlay only
        targetLabel = `chat "${chat.label}"`;
      }
    } else if (provider === "shopify" && execUsable) {
      // Order fixtures need a REAL numeric variant id (create_order's line_items
      // variant_id is z.number) — stage a marker 0.00-price product outside the
      // harness and pass its default variant via env overlay (fixtures use the
      // {{env.*:number}} token). remove() deletes the product in the finally.
      const orderProduct = await stageShopifyOrderProduct(account, user, `crsmoke-${runToken}-`);
      if (orderProduct) {
        overlay.SMOKE_SHOPIFY_ORDER_VARIANT_ID = orderProduct.variantId; // id -> env overlay only
        cleanupShopifyStaged.push(orderProduct.remove);
        targetLabel = "staged order product";
      }
      // update_inventory needs a TRACKED inventory item connected at a location.
      // V2 registers no tracking-enable action, so staging owns the switch; the
      // staged product is deleted in the finally.
      const location = await discoverShopifyLocation(account, user);
      if (location) {
        overlay.SMOKE_SHOPIFY_LOCATION_ID = location.locationId; // id -> env overlay only
        const invTarget = await stageShopifyInventoryTarget(
          account,
          user,
          `crsmoke-${runToken}-`,
          location.locationId,
        );
        if (invTarget) {
          overlay.SMOKE_SHOPIFY_INVENTORY_ITEM_ID = invTarget.inventoryItemId; // id -> env overlay only
          cleanupShopifyStaged.push(invTarget.remove);
          targetLabel = `${targetLabel ? `${targetLabel} / ` : ""}staged tracked inventory item`;
        }
      }
    } else if (provider === "github" && execUsable) {
      // Every repo-scoped fixture (issue / comment / branch / PR) targets ONE fresh
      // dev-test-staged crsmoke repo (containment: never a discovered repo). Staging
      // creates it with auto_init (a default branch to cut from) + a marker head
      // branch carrying a REAL diff commit (create_pull_request 422s without a diff;
      // no registered action commits file contents). create_repository + create_gist
      // stand alone (no repo target). remove() is a no-op — no delete_repo scope, so
      // the repo is an honest left artifact. Absent staging -> repo-scoped fixtures
      // report BLOCKED_ENV; create_repository/create_gist still run.
      const staged = await stageGithubSmokeRepo(account, user, `crsmoke-${runToken}-`);
      if (staged) {
        overlay.SMOKE_GITHUB_REPO = staged.repository; // owner/repo -> env overlay only
        overlay.SMOKE_GITHUB_PR_HEAD = staged.prHeadBranch; // marker head branch
        cleanupGithubStaged = staged.remove;
        targetLabel = `staged shared repo + PR head branch`;
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
          runToken,
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
            // "none" -> the action mutated STATE on a dev-test-STAGED resource and
            // created nothing of its own (e.g. shopify:update_inventory sets a
            // level on the staged tracked item; staging's finally owns teardown).
            expect(["left", "none"]).toContain(r.artifact);
          }
        }
        // BLOCKED_ENV must read as a target problem, never "not connected".
        if (r.status === "BLOCKED_ENV") expect(r.reason).toMatch(/smoke target/i);
      }
    } finally {
      // Always remove the throwaway staged attachment file (the smoke record it was
      // attached to is deleted by the fixture's own cleanup).
      if (cleanupStagedFile) await cleanupStagedFile();
      // Always trash the Gmail attachment seed message (get_attachment reads it; the
      // staged v2_storage object it produced is a harmless artifact left in our bucket).
      if (cleanupGmailAttachment) await cleanupGmailAttachment();
      // Always permanently delete the Outlook mail seeds (inbox + Sent Items copies).
      for (const removeSeed of cleanupOutlookSeeds) await removeSeed();
      // Always delete the staged Shopify products (order target + inventory item).
      for (const removeStaged of cleanupShopifyStaged) await removeStaged();
      // Always archive the staged HubSpot line-item parent deal (recycle bin).
      if (cleanupHubSpotDeal) await cleanupHubSpotDeal();
      // Always tear down the staged HubSpot smoke list + contact.
      if (cleanupHubSpotList) await cleanupHubSpotList();
      // GitHub staged shared repo: remove() is a no-op (no delete_repo scope); the
      // repo is an honest left artifact. Called for staging-pattern symmetry.
      if (cleanupGithubStaged) await cleanupGithubStaged();
    }
  }, 600_000);
});
