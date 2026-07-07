/**
 * Trigger-smoke — REAL Google watch-channel WEBHOOK deps (server-only test
 * helper).
 *
 * One factory per spec (`makeRealGoogleWatchWebhookSmokeDeps(config, spec)`)
 * wiring the generic direct-seed orchestrator to the real V2 internals:
 *
 *   - seedRegistration → creates the REAL provider resource baseline first
 *     (certified create_spreadsheet / create_document; live baseline cursor
 *     captured exactly the way each activate hook does — spreadsheets.get
 *     worksheet snapshot, values.get row count, Drive changes.getStartPageToken,
 *     Calendar events.list full walk to nextSyncToken), then DIRECT
 *     `triggerResourcesRepo.upsert` of the row every Google receive route
 *     looks up by `config.channelId`. NO Google watch is created
 *     (files.watch / events.watch never called) and NO deactivation hook runs
 *     at cleanup (it would call channels.stop for a channel that never
 *     existed).
 *   - deliverSyntheticEvent → on the FIRST call, seeds the REAL change via
 *     the certified actions (append_row / create_document / update_document /
 *     upload_file / create_event) or the production API wrapper where no
 *     registered action exists (Sheets `spreadsheets.batchUpdate` addSheet —
 *     same smoke-only-inline-via-production-wrapper disposition as the
 *     Mailchimp polling smokes), then POSTs the synthetic X-Goog notification
 *     (channelId + REAL buildChannelToken HMAC — production verification
 *     UNWEAKENED) to the REAL provider route. The route's pull re-fetches the
 *     delta from LIVE Google.
 *   - The redeliver call proves BOTH freshness layers: it first re-POSTs the
 *     identical notification against the ADVANCED cursor (watermark — pull
 *     finds nothing), then RESTORES the pre-change cursor/snapshot JSON onto
 *     the row and POSTs again — the pull re-detects the same change and the
 *     `(provider, eventId)` dedup row must drop it.
 *   - cleanupRegistration → resource removal (Drive-trash the smoke
 *     spreadsheet / doc / file via the certified google-drive delete_file;
 *     delete the calendar event via certified delete_event) + direct
 *     trigger_resources delete + workflow soft-delete.
 *   - cleanupDedup → every Google dedup key is prefixed by the smoke-owned
 *     resource id (spreadsheetId / fileId / calendar eventId), tracked
 *     internally per identity — LIKE-prefix delete.
 *
 * WATCH_CHANNEL_SECRET: the channel-token HMAC key. When absent from the
 * local env (it is a deploy-time secret), the factory mints a smoke-local
 * one so buildChannelToken/verifyChannelToken run the REAL HMAC contract
 * in-process. The verification code path is exercised unweakened; the smoke
 * does not claim the deployed secret was used.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { POST as sheetsRoute } from "@/app/api/webhooks/google-sheets/route";
import { POST as docsRoute } from "@/app/api/webhooks/google-docs/route";
import { POST as driveRoute } from "@/app/api/webhooks/google-drive/route";
import { POST as calendarRoute } from "@/app/api/webhooks/google-calendar/route";
import { createSpreadsheet } from "@/integrations/google-sheets/actions/createSpreadsheet";
import { appendRow } from "@/integrations/google-sheets/actions/appendRow";
import { spreadsheetsGet } from "@/integrations/google-sheets/api/spreadsheetsGet";
import { spreadsheetsBatchUpdate } from "@/integrations/google-sheets/api/spreadsheetsBatchUpdate";
import { valuesGet } from "@/integrations/google-sheets/api/valuesGet";
import { buildWorksheetListSnapshot } from "@/integrations/google-sheets/triggers/_shared/snapshot";
import { createDocument } from "@/integrations/google-docs/actions/createDocument";
import { updateDocument } from "@/integrations/google-docs/actions/updateDocument";
import { uploadFile } from "@/integrations/google-drive/actions/uploadFile";
import { createFolder } from "@/integrations/google-drive/actions/createFolder";
import { moveFile } from "@/integrations/google-drive/actions/moveFile";
import { deleteFile } from "@/integrations/google-drive/actions/deleteFile";
import { changesGetStartPageToken } from "@/integrations/google-drive/api/changesGetStartPageToken";
import { changesList } from "@/integrations/google-drive/api/changesList";
import { createEvent } from "@/integrations/google-calendar/actions/createEvent";
import { deleteEvent } from "@/integrations/google-calendar/actions/deleteEvent";
import { eventsList } from "@/integrations/google-calendar/api/eventsList";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  buildGoogleWatchNotificationHeaders,
  type GoogleWatchSpec,
  type GoogleWatchSmokeIdentity,
} from "./googleWatchWebhookSmoke";

const ROUTES: Readonly<
  Record<string, (request: Request) => Promise<Response>>
> = {
  "google-sheets": sheetsRoute,
  "google-docs": docsRoute,
  "google-drive": driveRoute,
  "google-calendar": calendarRoute,
};

const SMOKE_SHEET_NAME = "Smoke";

/**
 * Ensure the channel-token HMAC key exists in-process. Local .env.local does
 * not carry the deploy-time WATCH_CHANNEL_SECRET; minting a smoke-local one
 * keeps the REAL sign/verify code path running unweakened.
 */
export function ensureWatchChannelSecret(): void {
  if (!process.env.WATCH_CHANNEL_SECRET) {
    process.env.WATCH_CHANNEL_SECRET = `crsmoke-watch-secret-${randomUUID()}`;
  }
}

interface GoogleSeedState {
  /** The seeded trigger_resources row id (restore + dedup cleanup handle). */
  rowId: string;
  /** The exact pre-change row config — restored to prove the dedup layer. */
  seededConfig: Record<string, unknown>;
  /** Run-unique dedup-key prefix (resource id) — set once known. */
  dedupPrefix: string | null;
  /**
   * Drive fileId whose change must be VISIBLE in changes.list before the
   * notification POSTs — the changes feed is eventually consistent (the
   * first live run pulled before the fresh change surfaced and found 0).
   * Null for specs whose pull reads the resource directly (Sheets) or whose
   * delta showed up immediately (Calendar events.list).
   */
  probeFileId: string | null;
  /** Resource removals to run at cleanup. */
  removes: Array<() => Promise<void>>;
  deliverCount: number;
}

const CHANGES_PROBE_ATTEMPTS = 12;
const CHANGES_PROBE_SLEEP_MS = 2500;

export function makeRealGoogleWatchWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
  spec: GoogleWatchSpec,
): DirectSeedWebhookSmokeDeps<GoogleWatchSmokeIdentity> {
  ensureWatchChannelSecret();
  const common = makeCommonDirectSeedDeps(config, spec.provider);
  const { supabase, accountId, userId } = config;
  const stateByChannel = new Map<string, GoogleSeedState>();

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

  async function googleCall<T>(
    provider: string,
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const integration = await getActiveForExecution(accountId, provider, null);
    if (!integration) {
      throw new Error(`google-watch-smoke: ${provider} integration not active.`);
    }
    return refreshAndRetry({
      accountId,
      provider,
      providerAccountId: integration.providerAccountId,
      apiCall: fn,
    });
  }

  function state(identity: GoogleWatchSmokeIdentity): GoogleSeedState {
    const s = stateByChannel.get(identity.channelId);
    if (!s) throw new Error("google-watch-smoke: seedRegistration did not run.");
    return s;
  }

  /** Read the probe file's current change.time from a baseline-token walk. */
  async function readChangeTime(s: GoogleSeedState): Promise<string | null> {
    let pageToken = s.seededConfig.pageToken as string;
    for (let page = 0; page < 20; page += 1) {
      const res = await googleCall(spec.provider, (accessToken) =>
        changesList({ accessToken, pageToken }),
      );
      const hit = (res.changes ?? []).find((c) => c.fileId === s.probeFileId);
      if (hit) return hit.time ?? null;
      if (!res.nextPageToken) return null;
      pageToken = res.nextPageToken;
    }
    return null;
  }

  /**
   * Wait until the probe file's feed entry is STABLE (same change.time on two
   * consecutive reads). Drive re-emits a fresh change for a file shortly
   * after upload (post-processing); a moving change.time between the deliver
   * and redeliver walks would legitimately mint a NEW dedup key and defeat
   * the dedup proof. No-op for specs without a probe file.
   */
  async function waitForChangeStable(s: GoogleSeedState): Promise<void> {
    if (!s.probeFileId) return;
    let previous: string | null = null;
    for (let attempt = 0; attempt < CHANGES_PROBE_ATTEMPTS; attempt += 1) {
      const current = await readChangeTime(s);
      if (current !== null && previous !== null && current === previous) return;
      previous = current;
      await common.sleep(CHANGES_PROBE_SLEEP_MS);
    }
    throw new Error(
      "google-watch-smoke: probe file's change.time never stabilized.",
    );
  }

  /** Baseline syncToken the way the calendar activate hook captures it. */
  async function captureCalendarSyncToken(): Promise<string> {
    let pageToken: string | undefined;
    let pages = 0;
    while (true) {
      if (++pages > 100) {
        throw new Error("google-watch-smoke: calendar baseline walk too long.");
      }
      const page = await googleCall("google-calendar", (accessToken) =>
        eventsList({
          accessToken,
          calendarId: "primary",
          singleEvents: true,
          maxResults: 250,
          pageToken,
        }),
      );
      if (page.nextSyncToken) return page.nextSyncToken;
      if (!page.nextPageToken) {
        throw new Error(
          "google-watch-smoke: events.list returned neither nextPageToken nor nextSyncToken.",
        );
      }
      pageToken = page.nextPageToken;
    }
  }

  /** Seed the REAL resource baseline + the row config for this spec. */
  async function buildSeedConfig(
    identity: GoogleWatchSmokeIdentity,
    s: GoogleSeedState,
  ): Promise<Record<string, unknown>> {
    const base = { webhookEnabled: true, channelId: identity.channelId };
    switch (spec.label) {
      case "google-sheets:new_worksheet": {
        const res = await createSpreadsheet(
          actionInput({
            title: `${identity.marker} trigger-smoke - safe to delete`,
            initialSheetName: SMOKE_SHEET_NAME,
          }),
        );
        const spreadsheetId = (res.output as { spreadsheetId?: string }).spreadsheetId;
        if (!spreadsheetId) throw new Error("sheets seed failed (no spreadsheetId)");
        s.dedupPrefix = `${spreadsheetId}:`;
        s.removes.push(async () => {
          await deleteFile(actionInput({ fileId: spreadsheetId })).catch(() => {});
        });
        const meta = await googleCall("google-sheets", (accessToken) =>
          spreadsheetsGet({
            accessToken,
            spreadsheetId,
            fields: "sheets(properties(title))",
          }),
        );
        const names = (meta.sheets ?? [])
          .map((sh) => sh.properties?.title)
          .filter((t): t is string => typeof t === "string" && t.length > 0);
        return {
          ...base,
          spreadsheetId,
          worksheetSnapshot: buildWorksheetListSnapshot({ names }),
        };
      }
      case "google-sheets:row_changed": {
        const res = await createSpreadsheet(
          actionInput({
            title: `${identity.marker} trigger-smoke - safe to delete`,
            initialSheetName: SMOKE_SHEET_NAME,
          }),
        );
        const spreadsheetId = (res.output as { spreadsheetId?: string }).spreadsheetId;
        if (!spreadsheetId) throw new Error("sheets seed failed (no spreadsheetId)");
        s.dedupPrefix = `${spreadsheetId}:`;
        s.removes.push(async () => {
          await deleteFile(actionInput({ fileId: spreadsheetId })).catch(() => {});
        });
        // Baseline row so the count-delta path has a non-zero baseline.
        await appendRow(
          actionInput({
            spreadsheetId,
            range: `${SMOKE_SHEET_NAME}!A:Z`,
            values: ["baseline", "trigger-smoke", "safe to ignore"],
            valueInputOption: "RAW",
          }),
        );
        const baseline = await googleCall("google-sheets", (accessToken) =>
          valuesGet({
            accessToken,
            spreadsheetId,
            range: `${SMOKE_SHEET_NAME}!A:Z`,
          }),
        );
        const lastRowCount = (baseline.values ?? []).length;
        return {
          ...base,
          spreadsheetId,
          sheetName: SMOKE_SHEET_NAME,
          changeKinds: ["added"],
          lastRowCount,
        };
      }
      case "google-docs:new_document": {
        const baseline = await googleCall("google-docs", (accessToken) =>
          changesGetStartPageToken({ accessToken }),
        );
        if (!baseline.startPageToken) {
          throw new Error("docs seed failed (no startPageToken)");
        }
        return { ...base, pageToken: baseline.startPageToken };
      }
      case "google-docs:document_updated": {
        const res = await createDocument(
          actionInput({
            title: `${identity.marker} trigger-smoke doc - safe to delete`,
          }),
        );
        const documentId = (res.output as { documentId?: string }).documentId;
        if (!documentId) throw new Error("docs seed failed (no documentId)");
        s.dedupPrefix = `${documentId}:`;
        s.removes.push(async () => {
          await deleteFile(actionInput({ fileId: documentId })).catch(() => {});
        });
        // Baseline AFTER creation — startPageToken is "current state", so the
        // create change sits before it and only the update lands in the delta.
        const baseline = await googleCall("google-docs", (accessToken) =>
          changesGetStartPageToken({ accessToken }),
        );
        if (!baseline.startPageToken) {
          throw new Error("docs seed failed (no startPageToken)");
        }
        return { ...base, pageToken: baseline.startPageToken, documentId };
      }
      case "google-drive:file_changed": {
        // Scope the trigger to a run-unique smoke folder: changes.list is
        // WHOLE-drive, so without config.folderId the suite's own Drive
        // activity (sheets/docs smoke resources + their cleanup trash
        // events) legitimately fires this trigger — live-observed: the
        // sheets spec's trashed spreadsheet surfaced during the drive
        // redeliver window and defeated the dedup proof. The folderId
        // parents filter is production normalize behavior.
        const folderRes = await createFolder(
          actionInput({ name: `${identity.marker}-folder` }),
        );
        const folderId = (folderRes.output as { folderId?: string }).folderId;
        if (!folderId) throw new Error("drive seed failed (no folderId)");
        s.removes.push(async () => {
          await deleteFile(actionInput({ fileId: folderId })).catch(() => {});
        });
        const baseline = await googleCall("google-drive", (accessToken) =>
          changesGetStartPageToken({ accessToken }),
        );
        if (!baseline.startPageToken) {
          throw new Error("drive seed failed (no startPageToken)");
        }
        return { ...base, pageToken: baseline.startPageToken, folderId };
      }
      case "google-calendar:event_changed": {
        const syncToken = await captureCalendarSyncToken();
        return { ...base, calendarId: "primary", syncToken };
      }
      default:
        throw new Error(`no seeding for spec ${spec.label}`);
    }
  }

  /** Make the REAL change the pull should surface (first deliver only). */
  async function seedChange(identity: GoogleWatchSmokeIdentity, s: GoogleSeedState): Promise<void> {
    switch (spec.label) {
      case "google-sheets:new_worksheet": {
        const spreadsheetId = s.seededConfig.spreadsheetId as string;
        // No registered add-worksheet action exists — smoke-only inline call
        // via the production batchUpdate wrapper (Mailchimp-smoke disposition).
        await googleCall("google-sheets", (accessToken) =>
          spreadsheetsBatchUpdate({
            accessToken,
            spreadsheetId,
            requests: [{ addSheet: { properties: { title: identity.marker } } }],
          }),
        );
        return;
      }
      case "google-sheets:row_changed": {
        const spreadsheetId = s.seededConfig.spreadsheetId as string;
        await appendRow(
          actionInput({
            spreadsheetId,
            range: `${SMOKE_SHEET_NAME}!A:Z`,
            values: [identity.marker, "trigger-smoke", "safe to ignore"],
            valueInputOption: "RAW",
          }),
        );
        return;
      }
      case "google-docs:new_document": {
        const res = await createDocument(
          actionInput({
            title: `${identity.marker} trigger-smoke doc - safe to delete`,
          }),
        );
        const documentId = (res.output as { documentId?: string }).documentId;
        if (!documentId) throw new Error("docs change failed (no documentId)");
        s.dedupPrefix = `${documentId}:`;
        s.probeFileId = documentId;
        s.removes.push(async () => {
          await deleteFile(actionInput({ fileId: documentId })).catch(() => {});
        });
        return;
      }
      case "google-docs:document_updated": {
        const documentId = s.seededConfig.documentId as string;
        s.probeFileId = documentId;
        await updateDocument(
          actionInput({
            documentId,
            insertLocation: "end",
            content: `${identity.marker} trigger-smoke update - safe to ignore`,
          }),
        );
        return;
      }
      case "google-drive:file_changed": {
        const res = await uploadFile(
          actionInput({
            filename: `${identity.marker}.txt`,
            mimeType: "text/plain",
            content: `${identity.marker} trigger-smoke file - safe to ignore`,
          }),
        );
        const fileId = (res.output as { fileId?: string }).fileId;
        if (!fileId) throw new Error("drive change failed (no fileId)");
        s.dedupPrefix = `${fileId}:`;
        s.probeFileId = fileId;
        s.removes.push(async () => {
          await deleteFile(actionInput({ fileId })).catch(() => {});
        });
        // upload_file has no folder input — the certified move_file places
        // the file under the WATCHED smoke folder so the pull's parents
        // filter passes for our file and drops everything else. A move
        // changes parents only (modifiedTime untouched), so the change still
        // classifies "created" (createdTime === modifiedTime).
        const folderId = s.seededConfig.folderId as string;
        await moveFile(
          actionInput({ fileId, newParentFolderId: folderId }),
        );
        return;
      }
      case "google-calendar:event_changed": {
        const res = await createEvent(
          actionInput({
            calendarId: "primary",
            summary: `${identity.marker} trigger-smoke event - safe to ignore`,
            startDateTime: "2031-01-01T10:00:00Z",
            endDateTime: "2031-01-01T11:00:00Z",
            sendNotifications: "none",
            guestsCanInviteOthers: false,
            guestsCanSeeOtherGuests: true,
          }),
        );
        const eventId = (res.output as { eventId?: string }).eventId;
        if (!eventId) throw new Error("calendar change failed (no eventId)");
        s.dedupPrefix = `${eventId}:`;
        s.removes.push(async () => {
          await deleteEvent(
            actionInput({ calendarId: "primary", eventId }),
          ).catch(() => {});
        });
        return;
      }
      default:
        throw new Error(`no change seeding for spec ${spec.label}`);
    }
  }

  async function postNotification(
    identity: GoogleWatchSmokeIdentity,
  ): Promise<number> {
    const route = ROUTES[spec.provider];
    if (!route) throw new Error(`no route for provider ${spec.provider}`);
    const headers = buildGoogleWatchNotificationHeaders(identity, {
      channelToken: buildChannelToken({ channelId: identity.channelId }),
    });
    const res = await route(
      new Request(`http://localhost/api/webhooks/${spec.provider}`, {
        method: "POST",
        headers,
        body: "",
      }),
    );
    return res.status;
  }

  return {
    mintIdentity(): GoogleWatchSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 10);
      const channelId = `crsmoke-chan-${Date.now()}-${rand}`;
      return {
        eventId: channelId,
        channelId,
        marker: `crsmoke-${spec.expectedEventType.replace(/_/g, "")}-${rand}`,
      };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId, identity }) {
      const s: GoogleSeedState = {
        rowId: "",
        seededConfig: {},
        dedupPrefix: null,
        probeFileId: null,
        removes: [],
        deliverCount: 0,
      };
      stateByChannel.set(identity.channelId, s);
      s.seededConfig = await buildSeedConfig(identity, s);
      // DIRECT-SEED only — no activation hook, no Google watch created.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: spec.provider,
        eventType: spec.expectedEventType,
        nodeId: triggerNodeId,
        config: s.seededConfig,
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(
        workflowId,
        triggerNodeId,
      );
      if (row) s.rowId = row.id;
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity }) {
      const s = state(identity);
      s.deliverCount += 1;
      if (s.deliverCount === 1) {
        await seedChange(identity, s);
        // Drive's changes feed is eventually consistent AND re-emits a fresh
        // change shortly after upload (post-processing). Wait until the
        // seeded change is VISIBLE and STABLE so the first run fires on the
        // final feed state — otherwise the redeliver's restore walk would
        // legitimately mint a different time-keyed dedup key.
        await waitForChangeStable(s);
        return { httpStatus: await postNotification(identity) };
      }
      // Redeliver — prove BOTH freshness layers. For changes.list specs,
      // first wait for the feed to STABILIZE: Drive re-emits a file with a
      // LATER change.time shortly after upload (post-processing), which is a
      // genuinely NEW feed state — by-design it fires again (time-keyed dedup
      // key). The dedup proof needs the same feed state on both walks.
      await waitForChangeStable(s);
      // 1. WATERMARK: identical notification against the ADVANCED cursor.
      const watermarkStatus = await postNotification(identity);
      if (watermarkStatus !== 200) return { httpStatus: watermarkStatus };
      // 2. DEDUP: restore the exact pre-change cursor/snapshot, re-POST — the
      //    pull re-detects the same change; dedup must drop it.
      await triggerResourcesRepo.updateConfig(s.rowId, s.seededConfig);
      return { httpStatus: await postNotification(identity) };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId, identity) {
      const s = stateByChannel.get(identity.channelId);
      if (s) {
        stateByChannel.delete(identity.channelId);
        for (const remove of s.removes) {
          await remove().catch(() => {});
        }
      }
      // Direct delete — NO deactivation hook (it would call channels.stop for
      // a watch channel that never existed).
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      await common.softDeleteWorkflow(workflowId);
      if (s?.dedupPrefix) {
        const { error } = await supabase
          .from("webhook_event_dedup")
          .delete()
          .eq("provider", spec.provider)
          .like("event_id", `${s.dedupPrefix}%`);
        if (error) {
          console.warn(
            JSON.stringify({
              event: "trigger-smoke.google-watch.dedup_cleanup_failed",
              error: error.message,
            }),
          );
        }
      }
    },

    async cleanupDedup() {
      // Dedup rows are LIKE-cleaned on the smoke resource prefix inside
      // cleanupRegistration (the prefix is only known there) — nothing to do.
    },

    sleep: common.sleep,
  };
}
