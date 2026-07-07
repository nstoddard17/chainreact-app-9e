/**
 * Trigger-smoke — REAL Microsoft Graph WEBHOOK deps (server-only test helper).
 *
 * One factory per spec (`makeRealGraphWebhookSmokeDeps(config, spec)`) wiring
 * the generic direct-seed orchestrator to the real V2 internals:
 *
 *   - seedRegistration → DIRECT `triggerResourcesRepo.upsert` of the row every
 *     Graph receive route looks up: `config.subscriptionId` + `clientState`
 *     (both SMOKE-MINTED — no Graph subscription is created) plus the
 *     per-trigger receive-time fields (Outlook subject-marker filters; Teams
 *     REAL env teamId/channelId the fetch needs). NO deactivation hook runs at
 *     cleanup (it would call Graph subscription-delete for a subscription
 *     that never existed).
 *   - deliverSyntheticEvent → on the FIRST call, seeds the REAL resource via
 *     the CERTIFIED action-smoke patterns (Outlook self-send via the proven
 *     stageOutlookSeedMessage helper; calendar create_event; OneDrive
 *     upload_file; Teams send_channel_message into the smoke channel), caches
 *     it per identity, then POSTs the synthetic Graph notification envelope to
 *     the REAL provider route (validation-handshake + clientState verify +
 *     REAL Graph hydration fetch + receive-time filters + normalize +
 *     dispatchTriggerEvent + dedup + enqueue all run UNCHANGED). The dedup
 *     re-send POSTs the IDENTICAL envelope — the unchanged resource re-fetch
 *     yields the same dedup key and must be dropped.
 *   - email_flagged additionally PATCHes the seed message's flag via the
 *     production patchMessage wrapper (its open patch shape explicitly
 *     anticipates flag use; no registered flag action exists yet).
 *   - email_sent resolves the Sent Items copy of the self-send by bounded
 *     marker-subject scan (listMessages on sentitems).
 *   - cleanupRegistration → resource removal (delete seed messages / event /
 *     file; the Teams channel message has NO registered delete action — a
 *     marked `crsmoke-` artifact stays, same disposition as the certified
 *     send_channel_message action-smoke) + direct trigger_resources delete +
 *     workflow soft-delete.
 *   - cleanupDedup → every dedup key this run can write is prefixed
 *     `${subscriptionId}:` (see normalize contracts), so a LIKE-delete on
 *     that smoke-minted prefix removes exactly this run's rows.
 *
 * `probeGraphValidationHandshake` exercises each route's validation branch
 * (?validationToken echo, text/plain 200) — asserted per provider in the live
 * test.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { POST as outlookRoute } from "@/app/api/webhooks/microsoft-outlook/route";
import { POST as calendarRoute } from "@/app/api/webhooks/microsoft-outlook-calendar/route";
import { POST as onedriveRoute } from "@/app/api/webhooks/microsoft-onedrive/route";
import { POST as teamsRoute } from "@/app/api/webhooks/microsoft-teams/route";
import { listMessages } from "@/integrations/microsoft-outlook/api/listMessages";
import { patchMessage } from "@/integrations/microsoft-outlook/api/patchMessage";
import { createEvent } from "@/integrations/microsoft-outlook-calendar/actions/createEvent";
import { deleteEvent } from "@/integrations/microsoft-outlook-calendar/actions/deleteEvent";
import { uploadFile } from "@/integrations/microsoft-onedrive/actions/uploadFile";
import { deleteItem } from "@/integrations/microsoft-onedrive/actions/deleteItem";
import { sendChannelMessage } from "@/integrations/microsoft-teams/actions/sendChannelMessage";
import { stageOutlookSeedMessage } from "@/tests/smoke-actions/writeHarnessDeps/outlook";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  buildGraphNotificationBody,
  type GraphSpec,
  type GraphWebhookSmokeIdentity,
} from "./microsoftGraphWebhookSmoke";

const ROUTES: Readonly<
  Record<string, (request: Request) => Promise<Response>>
> = {
  "microsoft-outlook": outlookRoute,
  "microsoft-outlook-calendar": calendarRoute,
  "microsoft-onedrive": onedriveRoute,
  "microsoft-teams": teamsRoute,
};

interface SeededResource {
  readonly resourceId: string;
  readonly resource: string;
  readonly changeType: string;
  readonly odataType?: string;
  readonly remove: () => Promise<void>;
}

const SENT_SCAN_ATTEMPTS = 8;
const SENT_SCAN_SLEEP_MS = 1500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function requireTeamsEnv(): { teamId: string; channelId: string } {
  const teamId = process.env.SMOKE_TEAMS_TEAM_ID;
  const channelId = process.env.SMOKE_TEAMS_CHANNEL_ID;
  if (!teamId || !channelId) {
    throw new Error(
      "microsoft-graph-smoke: SMOKE_TEAMS_TEAM_ID / SMOKE_TEAMS_CHANNEL_ID not set.",
    );
  }
  return { teamId, channelId };
}

/** Exercise a route's validation-handshake branch (real route, no DB I/O). */
export async function probeGraphValidationHandshake(
  provider: string,
): Promise<{ status: number; body: string; contentType: string | null }> {
  const route = ROUTES[provider];
  if (!route) throw new Error(`no route for provider ${provider}`);
  const token = `crsmoke-vt-${randomUUID().slice(0, 8)}`;
  const res = await route(
    new Request(
      `http://localhost/api/webhooks/${provider}?validationToken=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "content-type": "text/plain" }, body: "" },
    ),
  );
  return {
    status: res.status,
    body: await res.text(),
    contentType: res.headers.get("content-type"),
  };
}

export function makeRealGraphWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
  spec: GraphSpec,
): DirectSeedWebhookSmokeDeps<GraphWebhookSmokeIdentity> {
  const common = makeCommonDirectSeedDeps(config, spec.provider);
  const { supabase, accountId, userId } = config;
  // Seeded REAL resources, cached per identity so the dedup re-send POSTs the
  // identical envelope (same resource id → same dedup key).
  const seededBySubscription = new Map<string, SeededResource>();

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

  async function outlookCall<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
    const integration = await getActiveForExecution(accountId, "microsoft-outlook", null);
    if (!integration) {
      throw new Error("microsoft-graph-smoke: Outlook integration not active.");
    }
    return refreshAndRetry({
      accountId,
      provider: "microsoft-outlook",
      providerAccountId: integration.providerAccountId,
      apiCall: fn,
    });
  }

  /** Bounded Sent Items scan for the seeded marker subject. */
  async function findSentCopyId(marker: string): Promise<string> {
    for (let i = 0; i < SENT_SCAN_ATTEMPTS; i += 1) {
      const result = await outlookCall((accessToken) =>
        listMessages({ accessToken, folderId: "sentitems", maxResults: 50 }),
      );
      const hit = result.value.find((m) =>
        String(m.subject ?? "").includes(marker),
      );
      if (hit) return hit.id;
      await sleep(SENT_SCAN_SLEEP_MS);
    }
    throw new Error("microsoft-graph-smoke: Sent Items copy never appeared.");
  }

  /** Seed the REAL resource for this spec via the certified patterns. */
  async function seedResource(
    identity: GraphWebhookSmokeIdentity,
  ): Promise<SeededResource> {
    switch (spec.label) {
      case "microsoft-outlook:new_email": {
        const staged = await stageOutlookSeedMessage(
          accountId,
          userId,
          `${identity.marker}-`,
          "trignewemail",
        );
        if (!staged) throw new Error("outlook seed failed (new_email)");
        return {
          resourceId: staged.messageId,
          resource: `/me/mailFolders/inbox/messages/${staged.messageId}`,
          changeType: "created",
          remove: staged.remove,
        };
      }
      case "microsoft-outlook:email_sent": {
        const staged = await stageOutlookSeedMessage(
          accountId,
          userId,
          `${identity.marker}-`,
          "trigemailsent",
        );
        if (!staged) throw new Error("outlook seed failed (email_sent)");
        const sentId = await findSentCopyId(identity.marker);
        return {
          resourceId: sentId,
          resource: `/me/mailFolders/sentitems/messages/${sentId}`,
          changeType: "created",
          remove: staged.remove,
        };
      }
      case "microsoft-outlook:email_flagged": {
        const staged = await stageOutlookSeedMessage(
          accountId,
          userId,
          `${identity.marker}-`,
          "trigflagged",
        );
        if (!staged) throw new Error("outlook seed failed (email_flagged)");
        // Flag the REAL seed message so the receive-time
        // flagStatus === "flagged" gate passes on the hydration fetch.
        await outlookCall((accessToken) =>
          patchMessage({
            accessToken,
            messageId: staged.messageId,
            patch: { flag: { flagStatus: "flagged" } },
          }),
        );
        return {
          resourceId: staged.messageId,
          resource: `/me/messages/${staged.messageId}`,
          changeType: "updated",
          remove: staged.remove,
        };
      }
      case "microsoft-outlook-calendar:event_changed": {
        const res = await createEvent(
          actionInput({
            subject: `${identity.marker} trigger-smoke event - safe to ignore`,
            startDateTime: "2030-01-01T10:00:00",
            startTimeZone: "UTC",
            endDateTime: "2030-01-01T11:00:00",
            endTimeZone: "UTC",
            isAllDay: false,
            responseRequested: false,
          }),
        );
        const eventId = (res.output as { id?: string }).id;
        if (!eventId) throw new Error("calendar seed failed (no event id)");
        return {
          resourceId: eventId,
          resource: `/me/events/${eventId}`,
          changeType: "updated",
          remove: async () => {
            await deleteEvent(actionInput({ eventId })).catch(() => {});
          },
        };
      }
      case "microsoft-onedrive:file_changed": {
        const res = await uploadFile(
          actionInput({
            filename: `${identity.marker}.txt`,
            mimeType: "text/plain",
            content: Buffer.from(
              `${identity.marker} trigger-smoke file - safe to ignore`,
              "utf8",
            ).toString("base64"),
            contentEncoding: "base64",
          }),
        );
        const itemId = (res.output as { itemId?: string }).itemId;
        if (!itemId) throw new Error("onedrive seed failed (no itemId)");
        return {
          resourceId: itemId,
          resource: "/me/drive/root",
          changeType: "updated",
          remove: async () => {
            await deleteItem(actionInput({ itemId })).catch(() => {});
          },
        };
      }
      case "microsoft-teams:new_channel_message": {
        const { teamId, channelId } = requireTeamsEnv();
        const res = await sendChannelMessage(
          actionInput({
            teamId,
            channelId,
            content: `${identity.marker} trigger-smoke channel message - safe to ignore`,
            contentType: "text",
          }),
        );
        const messageId = (res.output as { messageId?: string }).messageId;
        if (!messageId) throw new Error("teams seed failed (no messageId)");
        return {
          resourceId: messageId,
          resource: `/teams/${teamId}/channels/${channelId}/messages`,
          changeType: "created",
          odataType: "#Microsoft.Graph.chatMessage",
          // Teams exposes NO registered message-delete action (same
          // disposition as the certified send_channel_message action-smoke):
          // the crsmoke-marked message stays as a harmless artifact.
          remove: async () => {},
        };
      }
      default:
        throw new Error(`no seeding for spec ${spec.label}`);
    }
  }

  function rowConfigExtras(identity: GraphWebhookSmokeIdentity): Record<string, unknown> {
    switch (spec.label) {
      case "microsoft-outlook:new_email":
      case "microsoft-outlook:email_sent":
        // Receive-time subject SUBSTRING filter pinned to the run marker —
        // concurrent real mail cannot fire the smoke workflow.
        return { subject: identity.marker, subjectExactMatch: false };
      case "microsoft-teams:new_channel_message": {
        const { teamId, channelId } = requireTeamsEnv();
        return { teamId, channelId };
      }
      default:
        return {};
    }
  }

  return {
    mintIdentity(): GraphWebhookSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 10);
      const subscriptionId = `crsmoke-sub-${Date.now()}-${rand}`;
      return {
        eventId: subscriptionId,
        subscriptionId,
        clientState: `crsmoke-cs-${rand}`,
        marker: `crsmoke-${spec.expectedEventType.replace(/_/g, "")}-${rand}`,
      };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId, identity }) {
      // DIRECT-SEED only — no activation hook, no Graph subscription created.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: spec.provider,
        eventType: spec.expectedEventType,
        nodeId: triggerNodeId,
        config: {
          webhookEnabled: true,
          subscriptionId: identity.subscriptionId,
          clientState: identity.clientState,
          ...rowConfigExtras(identity),
        },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(
        workflowId,
        triggerNodeId,
      );
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity }) {
      let seeded = seededBySubscription.get(identity.subscriptionId);
      if (!seeded) {
        seeded = await seedResource(identity);
        seededBySubscription.set(identity.subscriptionId, seeded);
      }
      const rawBody = buildGraphNotificationBody(identity, {
        changeType: seeded.changeType,
        resourceId: seeded.resourceId,
        resource: seeded.resource,
        odataType: seeded.odataType,
      });
      const route = ROUTES[spec.provider]!;
      const res = await route(
        new Request(`http://localhost/api/webhooks/${spec.provider}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: rawBody,
        }),
      );
      return { httpStatus: res.status };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId, identity) {
      const seeded = seededBySubscription.get(identity.subscriptionId);
      if (seeded) {
        seededBySubscription.delete(identity.subscriptionId);
        await seeded.remove().catch(() => {});
      }
      // Direct delete — NO deactivation hook (it would call Graph
      // subscription-delete for a subscription that never existed).
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      await common.softDeleteWorkflow(workflowId);
    },

    async cleanupDedup(subscriptionId) {
      // Every dedup key this run wrote is `${subscriptionId}:<resource>:<disc>`
      // and the subscriptionId is smoke-minted unique — LIKE-prefix delete.
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", spec.provider)
        .like("event_id", `${subscriptionId}:%`);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.microsoft-graph.dedup_cleanup_failed",
            error: error.message,
          }),
        );
      }
    },

    sleep: common.sleep,
  };
}
