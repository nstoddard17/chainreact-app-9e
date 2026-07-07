/**
 * Trigger-smoke — REAL Dropbox WEBHOOK deps (server-only test helper).
 *
 * Wires the generic direct-seed orchestrator to the real V2 internals:
 *
 *   - seedRegistration → creates a run-unique smoke folder via the certified
 *     `create_folder` action, captures the REAL `list_folder` cursor for it
 *     via the production `get_latest_cursor` wrapper (exactly what the
 *     activation hook does), and DIRECT-seeds the trigger_resources row the
 *     reconcile fan-out matches (`snapshot.accountId` = the REAL connected
 *     account's dbid). No App Console call, no provider webhook created.
 *   - deliverSyntheticEvent → on the FIRST call, uploads the REAL marker file
 *     into the smoke folder via the production `filesUpload` wrapper (the
 *     registered upload_file action consumes a FileRef — no suitable direct
 *     seeding shape; same smoke-only-inline disposition as the Mailchimp
 *     smokes), then POSTs the DROPBOX_CLIENT_SECRET-signed notification to
 *     the REAL /api/webhooks/dropbox route (verify → account fan-out → REAL
 *     list_folder/continue → path scope → state gate → row-scoped dedup →
 *     enqueue, all UNCHANGED). The redeliver call proves WATERMARK (advanced
 *     cursor → nothing) then restores the pre-change cursor and re-POSTs to
 *     prove the DEDUP layer drops the re-detected entry.
 *   - cleanupRegistration → certified `delete_file` on the smoke folder
 *     (recursive trash), direct trigger_resources delete, workflow
 *     soft-delete, and a LIKE-prefix dedup sweep on the row id.
 *
 * `probeDropboxChallengeHandshake` exercises the route's GET ?challenge echo
 * (text/plain 200, nosniff) — asserted in the live test.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { GET as dropboxGet, POST as dropboxRoute } from "@/app/api/webhooks/dropbox/route";
import { createFolder } from "@/integrations/dropbox/actions/createFolder";
import { deleteFile } from "@/integrations/dropbox/actions/deleteFile";
import { filesListFolderGetLatestCursor } from "@/integrations/_shared/dropbox/api/filesListFolderGetLatestCursor";
import { filesUpload } from "@/integrations/_shared/dropbox/api/filesUpload";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  buildDropboxNotificationBody,
  type DropboxSpec,
  type DropboxSmokeIdentity,
} from "./dropboxWebhookSmoke";

const PROVIDER = "dropbox";

/** Exercise the route's GET ?challenge verification handshake branch. */
export async function probeDropboxChallengeHandshake(): Promise<{
  status: number;
  body: string;
  contentType: string | null;
}> {
  const token = `crsmoke-challenge-${randomUUID().slice(0, 8)}`;
  const res = await dropboxGet(
    new Request(
      `http://localhost/api/webhooks/dropbox?challenge=${encodeURIComponent(token)}`,
      { method: "GET" },
    ),
  );
  return {
    status: res.status,
    body: await res.text(),
    contentType: res.headers.get("content-type"),
  };
}

interface DropboxSeedState {
  rowId: string;
  folderPath: string;
  dropboxAccountId: string;
  /** Pre-change row config — restored to prove the dedup layer. */
  seededConfig: Record<string, unknown>;
  deliverCount: number;
}

export function makeRealDropboxWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
  spec: DropboxSpec,
): DirectSeedWebhookSmokeDeps<DropboxSmokeIdentity> {
  const common = makeCommonDirectSeedDeps(config, PROVIDER);
  const { supabase, accountId, userId } = config;
  const stateByMarker = new Map<string, DropboxSeedState>();

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

  async function dropboxCall<T>(
    fn: (accessToken: string) => Promise<T>,
  ): Promise<{ result: T; dropboxAccountId: string }> {
    const integration = await getActiveForExecution(accountId, PROVIDER, null);
    if (!integration) {
      throw new Error("dropbox-webhook-smoke: Dropbox integration not active.");
    }
    const result = await refreshAndRetry({
      accountId,
      provider: PROVIDER,
      providerAccountId: integration.providerAccountId,
      apiCall: fn,
    });
    return { result, dropboxAccountId: integration.providerAccountId };
  }

  function state(identity: DropboxSmokeIdentity): DropboxSeedState {
    const s = stateByMarker.get(identity.marker);
    if (!s) throw new Error("dropbox-webhook-smoke: seedRegistration did not run.");
    return s;
  }

  function requireSecret(): string {
    const secret = process.env.DROPBOX_CLIENT_SECRET;
    if (!secret) {
      throw new Error("dropbox-webhook-smoke: DROPBOX_CLIENT_SECRET not set.");
    }
    return secret;
  }

  async function postNotification(s: DropboxSeedState): Promise<number> {
    const rawBody = buildDropboxNotificationBody(s.dropboxAccountId);
    const signature = createHmac("sha256", requireSecret())
      .update(rawBody)
      .digest("hex");
    const res = await dropboxRoute(
      new Request("http://localhost/api/webhooks/dropbox", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dropbox-signature": signature,
        },
        body: rawBody,
      }),
    );
    return res.status;
  }

  return {
    mintIdentity(): DropboxSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 10);
      const marker = `crsmoke-newfile-${rand}`;
      return { eventId: marker, marker };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId, identity }) {
      const folderPath = `/crsmoke-trigger-${identity.marker}`;
      await createFolder(actionInput({ path: folderPath }));
      const { result: seeded, dropboxAccountId } = await dropboxCall(
        (accessToken) =>
          filesListFolderGetLatestCursor({
            accessToken,
            path: folderPath,
            recursive: false,
          }),
      );
      const seededConfig: Record<string, unknown> = {
        webhookEnabled: true,
        path: folderPath,
        recursive: false,
        snapshot: {
          cursor: seeded.cursor,
          accountId: dropboxAccountId,
          capturedAt: new Date().toISOString(),
        },
      };
      // DIRECT-SEED only — Dropbox webhooks are app-level; the real
      // activation hook would seed exactly this shape.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: PROVIDER,
        eventType: spec.expectedEventType,
        nodeId: triggerNodeId,
        config: seededConfig,
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(
        workflowId,
        triggerNodeId,
      );
      stateByMarker.set(identity.marker, {
        rowId: row?.id ?? "",
        folderPath,
        dropboxAccountId,
        seededConfig,
        deliverCount: 0,
      });
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity }) {
      const s = state(identity);
      s.deliverCount += 1;
      if (s.deliverCount === 1) {
        // Seed the REAL marker file into the watched smoke folder.
        await dropboxCall((accessToken) =>
          filesUpload({
            accessToken,
            path: `${s.folderPath}/${identity.marker}.txt`,
            bytes: new TextEncoder().encode(
              `${identity.marker} trigger-smoke file - safe to ignore`,
            ),
          }),
        );
        return { httpStatus: await postNotification(s) };
      }
      // Redeliver — prove BOTH freshness layers:
      // 1. WATERMARK: identical notification against the ADVANCED cursor.
      const watermarkStatus = await postNotification(s);
      if (watermarkStatus !== 200) return { httpStatus: watermarkStatus };
      // 2. DEDUP: restore the pre-change cursor; the reconcile re-surfaces the
      //    same file entry and the row-scoped dedup key must drop it.
      await triggerResourcesRepo.updateConfig(s.rowId, s.seededConfig);
      return { httpStatus: await postNotification(s) };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId, identity) {
      const s = stateByMarker.get(identity.marker);
      if (s) {
        stateByMarker.delete(identity.marker);
        // Recursive trash of the smoke folder (file included) via the
        // certified delete_file action.
        await deleteFile(actionInput({ path: s.folderPath })).catch(() => {});
      }
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      await common.softDeleteWorkflow(workflowId);
      if (s?.rowId) {
        // Row-scoped dedup keys are `${rowId}:${fileId}:${rev}` — LIKE-prefix.
        const { error } = await supabase
          .from("webhook_event_dedup")
          .delete()
          .eq("provider", PROVIDER)
          .like("event_id", `${s.rowId}:%`);
        if (error) {
          console.warn(
            JSON.stringify({
              event: "trigger-smoke.dropbox-webhook.dedup_cleanup_failed",
              error: error.message,
            }),
          );
        }
      }
    },

    async cleanupDedup() {
      // Dedup rows are LIKE-cleaned on the row-id prefix inside
      // cleanupRegistration (the row id is only known there) — nothing to do.
    },

    sleep: common.sleep,
  };
}
