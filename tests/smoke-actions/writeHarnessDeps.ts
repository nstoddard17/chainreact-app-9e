/**
 * Write smoke harness — REAL runActionStep dep (server-only test helper).
 *
 * Wires `WriteHarnessDeps.runActionStep` to the real V2 engine: each phase step
 * (setup / execute / verify / cleanup) runs as its OWN minimal
 * `{native:manual.run -> action}` workflow through the SAME enqueueRun path the
 * run-now route uses, in engine REAL mode, then the per-node output is read back
 * so the orchestrator can capture the created resource id.
 *
 * Why one workflow PER step (not one multi-node workflow): the write orchestrator
 * needs cleanup to run even when execute/verify failed (a finally-style teardown).
 * A single multi-node workflow would stop at the failed node and never reach
 * cleanup. Running each step independently preserves that guarantee and keeps the
 * ledger the single source of truth for what to clean up.
 *
 * SAFETY:
 *   - REAL mode (testMode=false) — this DOES call the provider. The caller gates
 *     it behind the write + destructive opt-ins (runWriteSmoke + the dev test).
 *   - Each step consumes one task from the smoke account's balance.
 *   - Node output stays in memory (returned to the pure orchestrator, which reads
 *     ONLY the captured id path into the ledger). It is never logged or surfaced
 *     in a report. Failure reasons are humanized titles / engine codes, sanitized.
 *   - Temp workflows are soft-deleted (state='deleted', named `smoke:write:`).
 *
 * STRUCTURE: the provider-specific discovery + smoke read-back seams live in focused
 * modules under `writeHarnessDeps/` (airtable / trello / notion / fileProviders /
 * calendars / staging / connection). This file is the thin composition layer — the
 * engine wiring (`runActionStep`), the read-back composer (`smokeReadBack`), and a
 * barrel that re-exports the seam helpers the dev test imports. The seam safety
 * invariants are documented in `writeHarnessDeps/context.ts` and locked by
 * `seam-refresh-guard.test.ts`.
 *
 * Imported ONLY by the gated dev integration test; never by app/server/CLI.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";
import { enqueueRun } from "@/services/execution/enqueue";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import { sanitizeFailureReason } from "@/scripts/chainreact/smoke/core";
import { SMOKE_ACTION_NODE_ID, SMOKE_TRIGGER_NODE_ID } from "./workflowRun";
import type { StepRunOutcome, WriteHarnessDeps } from "./writeHarness";
import type { SmokeReader, SmokeReaderContext } from "./writeHarnessDeps/context";
import { airtableSmokeReadBack } from "./writeHarnessDeps/airtable";
import { trelloSmokeReadBack } from "./writeHarnessDeps/trello";
import { fileProvidersSmokeReadBack } from "./writeHarnessDeps/fileProviders";
import { calendarsSmokeReadBack } from "./writeHarnessDeps/calendars";
import { sheetsSmokeReadBack } from "./writeHarnessDeps/sheets";
import { onenoteSmokeReadBack } from "./writeHarnessDeps/onenote";
import { copyMonitorSmokeReadBack } from "./writeHarnessDeps/copyMonitor";
import { onenoteCopyMonitorSmokeReadBack } from "./writeHarnessDeps/onenoteCopyMonitor";
import { slackSmokeReadBack } from "./writeHarnessDeps/slack";
import { gmailSmokeReadBack } from "./writeHarnessDeps/gmail";
import { hubspotSmokeReadBack } from "./writeHarnessDeps/hubspot";
import { mailchimpSmokeReadBack } from "./writeHarnessDeps/mailchimp";
import { outlookSmokeReadBack } from "./writeHarnessDeps/outlook";
import { teamsSmokeReadBack } from "./writeHarnessDeps/teams";
import { gdriveSmokeReadBack } from "./writeHarnessDeps/gdrive";
import { shopifySmokeReadBack } from "./writeHarnessDeps/shopify";
import { githubSmokeReadBack } from "./writeHarnessDeps/github";
import { facebookSmokeReadBack } from "./writeHarnessDeps/facebook";
import { quickbooksSmokeReadBack } from "./writeHarnessDeps/quickbooks";
import { stagedFileSmokeReadBack } from "./writeHarnessDeps/stagedFile";

// ─── Barrel: seam helpers the gated dev test imports from this module ──────────
export { probeWriteConnection, isProviderConnectedForWrite } from "./writeHarnessDeps/connection";
export { stageSmokeFile } from "./writeHarnessDeps/staging";
export {
  discoverAirtableSmokeTextField,
  discoverAirtableSmokeAttachmentField,
} from "./writeHarnessDeps/airtable";
export {
  discoverTrelloSmokeTarget,
  discoverTrelloSecondSmokeList,
  discoverTrelloSmokeLabel,
} from "./writeHarnessDeps/trello";
export {
  discoverNotionSmokeParentPage,
  discoverNotionSmokeDatabase,
} from "./writeHarnessDeps/notion";
export { discoverMondaySmokeBoardGroup } from "./writeHarnessDeps/monday";
export { discoverOneNoteSmokeSection } from "./writeHarnessDeps/onenote";
export { discoverSlackSmokeChannel, discoverSlackSmokeUser } from "./writeHarnessDeps/slack";
export { discoverGmailSelfAddress, stageGmailAttachmentMessage } from "./writeHarnessDeps/gmail";
export {
  discoverHubSpotDealStage,
  discoverHubSpotTicketStage,
  stageHubSpotLineItemDeal,
  stageHubSpotListMembershipTarget,
} from "./writeHarnessDeps/hubspot";
export { discoverMailchimpSmokeAudience } from "./writeHarnessDeps/mailchimp";
export {
  discoverOutlookSelfAddress,
  stageOutlookSeedMessage,
} from "./writeHarnessDeps/outlook";
export { discoverTeamsSmokeChat } from "./writeHarnessDeps/teams";
export {
  discoverShopifyLocation,
  stageShopifyOrderProduct,
  stageShopifyInventoryTarget,
} from "./writeHarnessDeps/shopify";
export { stageGithubSmokeRepo } from "./writeHarnessDeps/github";
export { discoverFacebookSmokePage } from "./writeHarnessDeps/facebook";

export interface RealWriteHarnessDepsConfig {
  /** A service-role Supabase client (the dev test constructs it). */
  readonly supabase: SupabaseClient;
  /** Account that owns the temp smoke workflows + runs (and the provider creds). */
  readonly accountId: string;
  /** Provenance user (created_by_user_id + triggered_by_user_id). */
  readonly userId: string;
  /** Crypto-random uuid generator (node:crypto.randomUUID in the test). */
  readonly newUuid: () => string;
}

function buildSingleActionDefinition(
  provider: string,
  action: string,
  config: Readonly<Record<string, unknown>>,
): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: MANUAL_TRIGGER_PROVIDER,
        type: MANUAL_TRIGGER_EVENT_TYPE,
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider,
        type: action,
        config,
        position: { x: 0, y: 160 },
      },
    ],
    edges: [{ id: "smoke-edge", from: SMOKE_TRIGGER_NODE_ID, to: SMOKE_ACTION_NODE_ID }],
  });
}

/**
 * Ordered smoke read-back seams. Each returns a StepRunOutcome when it owns the
 * (provider, action), else null so the next reader is tried (see context.ts). Order
 * is irrelevant to correctness — the (provider, action) namespaces are disjoint —
 * but kept stable for readable composition.
 */
const SMOKE_READERS: readonly SmokeReader[] = [
  trelloSmokeReadBack,
  airtableSmokeReadBack,
  fileProvidersSmokeReadBack,
  calendarsSmokeReadBack,
  sheetsSmokeReadBack,
  onenoteSmokeReadBack,
  // OneDrive async /copy monitor poller — completes copy_item's pending operation.
  copyMonitorSmokeReadBack,
  // OneNote async copyToSection operation poller — completes copy_page's pending
  // operation (authenticated Graph operations endpoint; shares the "copy_monitor"
  // action name but is provider-scoped to microsoft-onenote, so no collision).
  onenoteCopyMonitorSmokeReadBack,
  // Slack per-message state (text + reactions) read-back for update/reaction verifies.
  slackSmokeReadBack,
  // Gmail per-message label state read-back for draft / add_label / remove_label verifies.
  gmailSmokeReadBack,
  // HubSpot CRM per-object state read-back (GET by id — never the eventually-
  // consistent /search) for contact/company/deal create+update verifies.
  hubspotSmokeReadBack,
  // Mailchimp member existence probe (GET by subscriber hash; typed 404 ->
  // exists:false) for remove_subscriber's deletion proof.
  mailchimpSmokeReadBack,
  // Outlook marker-subject folder poll (find_messages — send/reply/forward/move/
  // delete proofs; Graph mail mutations return no id) + per-message state read
  // (message_state — add_categories proof).
  outlookSmokeReadBack,
  // Teams per-message body read-backs (channel_message_state / chat_message_state)
  // — the registered list read is header-only by design, so it can't prove markers.
  teamsSmokeReadBack,
  // Drive permission-shape read (file_permissions — share_document's anyone-link
  // proof; types/roles only, never principals).
  gdriveSmokeReadBack,
  // Shopify per-resource state reads (product/variant/customer/order/inventory)
  // — Shopify registers no read actions, so every write verifies through these.
  shopifySmokeReadBack,
  // GitHub per-resource state reads (repo/issue/comments/branch/PR/gist) — GitHub
  // registers no read actions, so every write verifies through these bounded GETs.
  githubSmokeReadBack,
  // Facebook per-object state reads (post/comments/photo/video) — the only
  // registered read is aggregate page insights, so every post/media write verifies
  // through these bounded Graph GETs (code=100 -> found:false for the delete proof).
  facebookSmokeReadBack,
  // QuickBooks per-record read-back (get_customer / get_invoice by id) — the write
  // fixtures verify create_customer / create_invoice / send_invoice through these
  // bounded GETs (typed 404 -> found:false), matching the actions' output shape.
  quickbooksSmokeReadBack,
  // Provider-agnostic v2_storage staged-file existence read-back (slack:download_file).
  stagedFileSmokeReadBack,
];

export function makeRealWriteHarnessDeps(
  config: RealWriteHarnessDepsConfig,
): WriteHarnessDeps {
  const { supabase, accountId, userId, newUuid } = config;

  return {
    async runActionStep(input): Promise<StepRunOutcome> {
      let definition: WorkflowDefinition;
      try {
        definition = buildSingleActionDefinition(input.provider, input.action, input.config);
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      }

      // 1. Persist a throwaway draft workflow (manual.run registers no resources).
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: `smoke:write:${input.provider}:${input.action}`,
          state: "draft",
          draft_definition: definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        return {
          ok: false,
          output: null,
          reason: sanitizeFailureReason(`createSmokeWorkflow failed: ${error?.message ?? "no row"}`),
        };
      }
      const workflowId = data.id;

      try {
        // 2. Run it LIVE (real provider call) via the run-now service path.
        const event: TriggerEvent = {
          provider: MANUAL_TRIGGER_PROVIDER,
          eventType: MANUAL_TRIGGER_EVENT_TYPE,
          eventId: newUuid(),
          occurredAt: new Date().toISOString(),
          providerAccountId: "system",
          payload: { inputs: {} },
        };
        // Slice 6 durable queue — enqueue persists a 'queued' row, then drain it
        // synchronously so the run is terminal before we read it. SAME durable path
        // production uses (enqueueRun + processQueuedRun); the engine derives the
        // live definition mode from testMode:false.
        const { runId } = await enqueueRun({
          workflowId,
          triggerNodeId: SMOKE_TRIGGER_NODE_ID,
          event,
          testMode: false,
          triggeredBy: "manual",
          triggeredByUserId: userId,
        });
        await processQueuedRun(runId);

        // 3. Read the persisted run + the action node's output.
        const rec = await workflowRunsRepo.getById(runId);
        if (!rec) return { ok: false, output: null, reason: "run did not reach a terminal state" };

        const step = rec.steps.find((s) => s.nodeId === SMOKE_ACTION_NODE_ID);
        const ok = rec.status === "succeeded" && step?.status === "succeeded";
        if (ok) {
          return { ok: true, output: step?.output ?? null, reason: null };
        }
        return {
          ok: false,
          output: null,
          // SAFE: humanized title or engine fatal-error CODE only, sanitized.
          reason: sanitizeFailureReason(
            rec.errorClassification?.title ?? rec.fatalError?.code ?? "step run failed",
          ),
        };
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      } finally {
        // 4. Best-effort soft-delete of the temp workflow (never flips a verdict).
        const { error: delErr } = await supabase
          .from("workflows")
          .update({ state: "deleted", deleted_at: new Date().toISOString() })
          .eq("id", workflowId);
        if (delErr) {
          console.warn(
            JSON.stringify({ event: "smoke.write.cleanup_failed", workflowId, error: delErr.message }),
          );
        }
      }
    },

    // SMOKE-ONLY read-back: bounded, READ-ONLY provider calls used to verify a
    // marker / prove deletion where no user-facing read action fits. Never mutates;
    // never goes through the engine. Composed from the focused per-provider reader
    // modules; the outer try/catch sanitizes any rethrown (non-typed-not-found)
    // provider error into a safe VERIFY_FAILED reason (see context.ts).
    async smokeReadBack(input): Promise<StepRunOutcome> {
      const ctx: SmokeReaderContext = { accountId, userId };
      try {
        for (const reader of SMOKE_READERS) {
          const outcome = await reader(ctx, input);
          if (outcome !== null) return outcome;
        }
        return { ok: false, output: null, reason: `no smoke reader for ${input.provider}:${input.action}` };
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      }
    },
  };
}
