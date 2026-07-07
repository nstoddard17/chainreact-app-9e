/**
 * Trigger-smoke harness — REAL Mailchimp polling deps (server-only test helper).
 *
 * Wires the injected `MailchimpPollingSmokeDeps` to the real V2 internals:
 *   - discoverAudience → the PROVEN action-smoke helper
 *     (discoverMailchimpSmokeAudience: pinned env → smoke-named → first
 *     audience + owner mailbox for plus-addressing).
 *   - createSmokeMember / addTag / deleteMemberPermanent → the CERTIFIED
 *     add_subscriber / add_tag / remove_subscriber(mode delete_permanent)
 *     action handlers (same actionInput reuse pattern as the Excel / Gmail
 *     polling deps). Tags ARE static segments, so add_tag both mints the
 *     smoke segment and performs the post-baseline member addition.
 *   - findSegmentIdByName / awaitSegmentSettled → the production segmentsList
 *     / segmentGet / segmentMembersList read wrappers (bounded retries for
 *     Mailchimp read-side lag).
 *   - createSmokeCampaign / deleteCampaign / deleteSegment → smoke-only
 *     inline calls through the SHARED production mailchimpRequest helper (no
 *     wrapper or registered action exists for campaign create/delete or
 *     segment delete — mirrors the Gmail smoke's labels.delete precedent).
 *     The campaign is a DRAFT and is NEVER sent.
 *   - armPollingTrigger → the REAL registerWorkflowTriggers (runs the
 *     trigger's activation hook → captures the baseline snapshot).
 *   - poll → the REAL per-trigger Mailchimp polling handler scoped to this
 *     trigger (the exact function the cron's runOne invokes; the global
 *     runPollingTriggers() would fire other accounts on the shared dev DB).
 *   - readSnapshot / restoreSnapshot → trigger_resources config read/update
 *     (powers the dedup-vs-snapshot isolation proof).
 *   - listRuns/readRun → service-role diagnostics readers; drainRun → the
 *     REAL durable-queue processQueuedRun.
 *   - cleanupDedupLike → service-role LIKE-delete of the (mailchimp, key)
 *     dedup rows this run may have written.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getActiveForExecution } from "@/repositories/integrations";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
  type DiagnosticsRunRecord,
} from "@/repositories/workflowRunsDiagnostics";
import {
  registerWorkflowTriggers,
  unregisterWorkflowTriggers,
} from "@/services/triggers/lifecycle";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { addSubscriber } from "@/integrations/mailchimp/actions/addSubscriber";
import { addTag as addTagAction } from "@/integrations/mailchimp/actions/addTag";
import { removeSubscriber } from "@/integrations/mailchimp/actions/removeSubscriber";
import { mailchimpRequest } from "@/integrations/_shared/mailchimp/api/_request";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import {
  segmentGet,
  segmentMembersList,
  segmentsList,
} from "@/integrations/_shared/mailchimp/api/segments";
import { mailchimpSubscriberAddedToSegmentPollingHandler } from "@/integrations/mailchimp/triggers/subscriberAddedToSegment/poll";
import { mailchimpSegmentUpdatedPollingHandler } from "@/integrations/mailchimp/triggers/segmentUpdated/poll";
import { mailchimpCampaignCreatedPollingHandler } from "@/integrations/mailchimp/triggers/campaignCreated/poll";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import { discoverMailchimpSmokeAudience } from "@/tests/smoke-actions/writeHarnessDeps/mailchimp";
import type {
  MailchimpPollingRun,
  MailchimpPollingSmokeDeps,
} from "./mailchimpPollingSmoke";

export interface RealMailchimpPollingSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
  /** Optional pinned audience (SMOKE_MAILCHIMP_AUDIENCE_ID). */
  readonly pinnedAudienceId?: string | null;
}

const POLLING_HANDLERS: Readonly<Record<string, PollingHandler>> = {
  subscriber_added_to_segment: mailchimpSubscriberAddedToSegmentPollingHandler,
  segment_updated: mailchimpSegmentUpdatedPollingHandler,
  campaign_created: mailchimpCampaignCreatedPollingHandler,
};

const SETTLE_ATTEMPTS = 8;
const SETTLE_SLEEP_MS = 1500;

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

function minimalWorkflowRecord(
  workflowId: string,
  accountId: string,
  userId: string,
  definition: WorkflowDefinition,
): WorkflowRecord {
  return {
    id: workflowId,
    accountId,
    createdByUserId: userId,
    draftDefinition: definition,
  } as unknown as WorkflowRecord;
}

function mapStatus(s: string | null | undefined): MailchimpPollingRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): MailchimpPollingRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function makeRealMailchimpPollingSmokeDeps(
  config: RealMailchimpPollingSmokeDepsConfig,
): MailchimpPollingSmokeDeps {
  const { supabase, accountId, userId } = config;

  // Setup event with provider "native" (NOT mailchimp) → each reused certified
  // handler falls back to null providerAccountId → resolves the ACTIVE
  // Mailchimp integration. Same pattern as the Excel / Gmail polling deps.
  const setupEvent = (): TriggerEvent => ({
    provider: "native",
    eventType: "trigger-smoke.setup",
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    providerAccountId: "system",
    payload: {},
  });

  const actionInput = (cfg: Record<string, unknown>): ActionHandlerInput => ({
    workflowId: "trigger-smoke-setup",
    userId,
    accountId,
    runId: "trigger-smoke-setup",
    nodeId: "trigger-smoke-setup",
    config: cfg,
    triggerEvent: setupEvent(),
  });

  async function mcCall<T>(
    fn: (accessToken: string, dc: string) => Promise<T>,
  ): Promise<T> {
    const integration = await getActiveForExecution(accountId, "mailchimp", null);
    if (!integration) {
      throw new Error("mailchimp-polling-smoke: Mailchimp integration not active.");
    }
    const dc = integration.accountMetadata.dc;
    if (typeof dc !== "string" || dc.length === 0) {
      throw new Error("mailchimp-polling-smoke: integration is missing the dc.");
    }
    return refreshAndRetry({
      accountId,
      provider: "mailchimp",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => fn(accessToken, dc),
    });
  }

  async function loadDefinition(workflowId: string): Promise<WorkflowDefinition> {
    const { data, error } = await supabase
      .from("workflows")
      .select("draft_definition")
      .eq("id", workflowId)
      .single<{ draft_definition: WorkflowDefinition }>();
    if (error || !data) {
      throw new Error(
        `mailchimp-polling-smoke loadDefinition failed: ${error?.message ?? "no row"}`,
      );
    }
    return data.draft_definition;
  }

  async function loadTriggerRow(workflowId: string, triggerNodeId: string) {
    const row = await triggerResourcesRepo.findByWorkflowAndNode(
      workflowId,
      triggerNodeId,
    );
    if (!row) {
      throw new Error("mailchimp-polling-smoke: trigger_resources row not found");
    }
    return row;
  }

  return {
    mintMarker(kind) {
      return `crsmoke-${kind.replace(/_/g, "")}-${Date.now()}-${shortId()}`;
    },

    async discoverAudience() {
      const aud = await discoverMailchimpSmokeAudience(
        accountId,
        userId,
        config.pinnedAudienceId ?? process.env.SMOKE_MAILCHIMP_AUDIENCE_ID ?? null,
      );
      if (!aud) {
        throw new Error(
          "mailchimp-polling-smoke: Mailchimp not connected / no audience / no owner email.",
        );
      }
      return {
        audienceId: aud.audienceId,
        ownerLocal: aud.ownerLocal,
        ownerDomain: aud.ownerDomain,
      };
    },

    async createSmokeMember({ audienceId, email }) {
      // status "subscribed" is the Q11 explicit choice the action-smoke uses;
      // adding a member via the API sends NO mail.
      await addSubscriber(
        actionInput({ audience_id: audienceId, email, status: "subscribed" }),
      );
    },

    async addTag({ audienceId, email, tag }) {
      await addTagAction(actionInput({ audience_id: audienceId, email, tags: [tag] }));
    },

    async findSegmentIdByName({ audienceId, name }) {
      for (let i = 0; i < SETTLE_ATTEMPTS; i += 1) {
        const { segments } = await mcCall((accessToken, dc) =>
          segmentsList({ accessToken, dc, audienceId, type: "static", count: 100 }),
        );
        const match = segments.find((s) => s.name === name);
        if (match?.id !== undefined && match.id !== null) return String(match.id);
        await sleep(SETTLE_SLEEP_MS);
      }
      throw new Error(
        `mailchimp-polling-smoke: tag segment '${name}' never appeared in segmentsList`,
      );
    },

    async awaitSegmentSettled({ audienceId, segmentId, minMembers }) {
      for (let i = 0; i < SETTLE_ATTEMPTS; i += 1) {
        const [seg, members] = await Promise.all([
          mcCall((accessToken, dc) =>
            segmentGet({ accessToken, dc, audienceId, segmentId }),
          ),
          mcCall((accessToken, dc) =>
            segmentMembersList({ accessToken, dc, audienceId, segmentId, count: 100 }),
          ),
        ]);
        const count = typeof seg.member_count === "number" ? seg.member_count : 0;
        if (count >= minMembers && members.members.length >= minMembers) return;
        await sleep(SETTLE_SLEEP_MS);
      }
      throw new Error(
        `mailchimp-polling-smoke: segment ${segmentId} never settled at >=${minMembers} member(s)`,
      );
    },

    async renameSegment({ audienceId, segmentId, newName }) {
      // Smoke-only inline rename (no wrapper / registered action). The name
      // is the segment record's primary field — echoed immediately, unlike
      // the member_count aggregate (live-probed to lag minutes). PATCH on a
      // static (tag) segment renames the tag.
      await mcCall((accessToken, dc) =>
        mailchimpRequest<{ id?: number }>({
          accessToken,
          dc,
          method: "PATCH",
          path: `/lists/${encodeURIComponent(audienceId)}/segments/${encodeURIComponent(segmentId)}`,
          resourceForNotFound: `segment ${segmentId}`,
          body: { name: newName },
        }),
      );
    },

    async createSmokeCampaign({ audienceId, marker }) {
      // Smoke-only inline create — a DRAFT regular campaign that is NEVER
      // sent (creation sends no mail; only /actions/send would). No wrapper
      // or registered action exists; reuses the shared production request
      // helper so auth/error semantics match every other Mailchimp call.
      const created = await mcCall((accessToken, dc) =>
        mailchimpRequest<{ id?: string }>({
          accessToken,
          dc,
          method: "POST",
          path: "/campaigns",
          resourceForNotFound: "campaigns (create)",
          body: {
            type: "regular",
            recipients: { list_id: audienceId },
            settings: {
              title: marker,
              subject_line: `${marker} - ChainReact trigger-smoke draft (never sent)`,
              from_name: "ChainReact Smoke",
            },
          },
        }),
      );
      if (!created.id) {
        throw new Error("mailchimp-polling-smoke: campaign create returned no id");
      }
      return { campaignId: created.id };
    },

    async createActiveSmokeWorkflow(workflow) {
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: workflow.name,
          state: "active",
          draft_definition: workflow.definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        throw new Error(
          `mailchimp-polling-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async armPollingTrigger({ workflowId, triggerNodeId }) {
      const definition = await loadDefinition(workflowId);
      const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
      await registerWorkflowTriggers(record, definition);

      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const snapshot = (row.config as { snapshot?: unknown }).snapshot;
      return {
        snapshotPresent: snapshot !== null && typeof snapshot === "object",
      };
    },

    async poll({ workflowId, triggerNodeId }) {
      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const handler = POLLING_HANDLERS[row.eventType];
      if (!handler || !handler.canHandle(row)) {
        throw new Error(
          `mailchimp-polling-smoke: no polling handler for event_type '${row.eventType}'`,
        );
      }
      await handler.poll({
        trigger: row,
        accountId: row.workflowAccountId ?? accountId,
        userRole: "default",
        now: Date.now(),
      });
    },

    async readSnapshot({ workflowId, triggerNodeId }) {
      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const snapshot = (row.config as { snapshot?: unknown }).snapshot;
      return snapshot && typeof snapshot === "object"
        ? (snapshot as Record<string, unknown>)
        : null;
    },

    async restoreSnapshot({ workflowId, triggerNodeId, snapshot }) {
      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const cfg = row.config as Record<string, unknown>;
      await triggerResourcesRepo.updateConfig(row.id, { ...cfg, snapshot });
    },

    async listRuns(workflowId) {
      const runs = await listByWorkflowServiceRole(workflowId, {
        includeRunning: true,
        limit: 50,
      });
      return runs.map(toSmokeRun);
    },

    async drainRun(runId) {
      await processQueuedRun(runId);
    },

    async readRun(runId) {
      const rec = await getByIdServiceRole(runId);
      return rec ? toSmokeRun(rec) : null;
    },

    async cleanupWorkflow(workflowId) {
      const definition = await loadDefinition(workflowId).catch(() => null);
      if (definition) {
        const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
        await unregisterWorkflowTriggers(record).catch(() => {});
      }
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.mailchimp-polling.cleanup_failed",
            workflowId,
            error: error.message,
          }),
        );
      }
    },

    async deleteMemberPermanent({ audienceId, email }) {
      // Certified remove_subscriber, GDPR-style permanent erase — the proven
      // action-smoke cleanup disposition for plus-addressed smoke members.
      await removeSubscriber(
        actionInput({ audience_id: audienceId, email, mode: "delete_permanent" }),
      );
    },

    async deleteSegment({ audienceId, segmentId }) {
      // Smoke-only inline delete (no wrapper / registered action). Removes
      // the tag's static segment so no crsmoke tag accumulates. 404 = gone.
      await mcCall((accessToken, dc) =>
        mailchimpRequest<void>({
          accessToken,
          dc,
          method: "DELETE",
          path: `/lists/${encodeURIComponent(audienceId)}/segments/${encodeURIComponent(segmentId)}`,
          resourceForNotFound: `segment ${segmentId}`,
        }).catch((err: unknown) => {
          if (err instanceof NotFoundError) return; // already gone
          throw err;
        }),
      );
    },

    async deleteCampaign(campaignId) {
      // Smoke-only inline delete of the never-sent draft. 404 = gone.
      await mcCall((accessToken, dc) =>
        mailchimpRequest<void>({
          accessToken,
          dc,
          method: "DELETE",
          path: `/campaigns/${encodeURIComponent(campaignId)}`,
          resourceForNotFound: `campaign ${campaignId}`,
        }).catch((err: unknown) => {
          if (err instanceof NotFoundError) return; // already gone
          throw err;
        }),
      );
    },

    async cleanupDedupLike(pattern) {
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", "mailchimp")
        .like("event_id", pattern);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.mailchimp-polling.dedup_cleanup_failed",
            error: error.message,
          }),
        );
      }
    },

    async sleep(ms) {
      await sleep(ms);
    },
  };
}
