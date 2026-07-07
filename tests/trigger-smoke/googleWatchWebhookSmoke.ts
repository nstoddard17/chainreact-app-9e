/**
 * Trigger-smoke — Google WATCH-CHANNEL webhook pure specs (Lane C direct-seed
 * + REAL Google fetch), on the generic orchestrator in directSeedWebhookSmoke.ts.
 *
 * Covers all 6 registered Google watch-channel triggers:
 *   google-sheets:new_worksheet / row_changed
 *   google-docs:new_document / document_updated
 *   google-drive:file_changed
 *   google-calendar:event_changed
 *
 * ARCHITECTURE (shared across all four providers): Google push notifications
 * carry NO change data — only X-Goog-* headers naming the channel. Each
 * receive route looks the trigger row up by `config.channelId`, verifies the
 * `X-Goog-Channel-Token` HMAC (buildChannelToken over the channelId, keyed
 * WATCH_CHANNEL_SECRET — exercised UNWEAKENED), then runs the trigger's PULL:
 * a REAL provider fetch (spreadsheets.get / values.get / Drive changes.list /
 * Calendar events.list?syncToken) that diffs against the row's persisted
 * cursor/snapshot, normalizes, and dispatches.
 *
 * HYBRID HONESTY SCOPE (same as the Microsoft Graph batch): the NOTIFICATION
 * is synthetic (direct-seeded trigger row with a smoke-minted channelId; NO
 * Google watch channel is created — files.watch / events.watch never called —
 * and Google did NOT deliver anything), but the RESOURCE and the CURSOR are
 * REAL — the baseline cursor/snapshot is captured live exactly the way each
 * activate hook does, the change is seeded through certified actions (or the
 * production API wrapper where no action exists, e.g. Sheets addSheet), and
 * the production receive path re-fetches the delta from LIVE Google. This
 * certifies the V2 ingestion path per event shape. It does NOT certify watch
 * registration/renewal (files.watch / events.watch / channels.stop) and does
 * NOT claim Google delivered.
 *
 * FRESHNESS is proven in TWO layers by the deps' redeliver step:
 *   1. WATERMARK — re-POSTing the identical notification re-pulls from the
 *      ADVANCED cursor/snapshot and finds nothing (0 new runs).
 *   2. DEDUP — the pre-change cursor/snapshot JSON is RESTORED onto the row,
 *      the same notification is POSTed again, the pull RE-DETECTS the same
 *      change, and the `(provider, eventId)` webhook_event_dedup row drops it
 *      (still exactly 1 run).
 *
 * Every spec is pure (no I/O). Real wiring (routes, certified seeding
 * actions, Google fetches, cursor restore) lives in
 * googleWatchWebhookSmokeDeps.ts and only runs in the gated dev test.
 */
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedSmokeRun,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

/** Shared identity for all Google watch webhook specs. */
export interface GoogleWatchSmokeIdentity extends DirectSeedSmokeIdentity {
  /**
   * = channelId. The orchestrator's reporting/cleanup handle. Google dedup
   * keys are RESOURCE-scoped (spreadsheetId / fileId / calendar eventId
   * prefixes) and only known after seeding, so the deps track the real dedup
   * prefix internally and ignore this value in cleanupDedup.
   */
  readonly eventId: string;
  /** Smoke-minted watch channel id (never a real Google watch). */
  readonly channelId: string;
  /** Run-unique crsmoke marker carried by the seeded resource. */
  readonly marker: string;
}

/**
 * The X-Goog-* notification headers the deps attach to the real-route POST.
 * `channelToken` is computed by the deps via the production buildChannelToken
 * (HMAC over channelId keyed WATCH_CHANNEL_SECRET) so route verification runs
 * unweakened. Google watch notifications have an EMPTY body — everything
 * rides in headers.
 */
export function buildGoogleWatchNotificationHeaders(
  identity: GoogleWatchSmokeIdentity,
  input: { channelToken: string; resourceState?: string },
): Record<string, string> {
  return {
    "x-goog-channel-id": identity.channelId,
    "x-goog-channel-token": input.channelToken,
    "x-goog-resource-id": "crsmoke-resource",
    "x-goog-resource-state": input.resourceState ?? "change",
    "x-goog-message-number": "2",
  };
}

function payloadStringIncludes(
  run: DirectSeedSmokeRun,
  field: string,
  needle: string,
): boolean {
  const v = run.triggerPayload?.[field];
  return typeof v === "string" && v.includes(needle);
}

export type GoogleWatchSpec = DirectSeedWebhookSpec<GoogleWatchSmokeIdentity>;

// ─── google-sheets ───────────────────────────────────────────────────────────

export const SHEETS_NEW_WORKSHEET_SPEC: GoogleWatchSpec = {
  label: "google-sheets:new_worksheet",
  provider: "google-sheets",
  expectedEventType: "new_worksheet",
  // The meta's required spreadsheetId is a builder-gate placeholder only —
  // the receive path reads the SEEDED ROW config (real smoke spreadsheet id).
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "google-sheets",
      "new_worksheet",
      { spreadsheetId: "crsmoke-placeholder-spreadsheet" },
      "google-sheets:new_worksheet",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "new_worksheet") return false;
    // eventId: `${spreadsheetId}:new_worksheet:${sheetId}:${nameHash}`.
    if (typeof run.eventId !== "string" || !run.eventId.includes(":new_worksheet:")) {
      return false;
    }
    if (run.triggerPayload?.changeKind !== "added") return false;
    // Marker proof: the REAL fetched worksheet list carries the marker-named
    // sheet the smoke added via the production batchUpdate addSheet.
    return run.triggerPayload?.worksheetName === identity.marker;
  },
};

export const SHEETS_ROW_CHANGED_SPEC: GoogleWatchSpec = {
  label: "google-sheets:row_changed",
  provider: "google-sheets",
  expectedEventType: "row_changed",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "google-sheets",
      "row_changed",
      {
        spreadsheetId: "crsmoke-placeholder-spreadsheet",
        sheetName: "Smoke",
        changeKinds: ["added"],
      },
      "google-sheets:row_changed",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "row_changed") return false;
    if (run.triggerPayload?.changeKind !== "added") return false;
    // Marker proof: the REAL values.get row carries the marker cell the
    // certified append_row wrote.
    const values = run.triggerPayload?.rowValues;
    if (!Array.isArray(values)) return false;
    return values.some(
      (v) => typeof v === "string" && v.includes(identity.marker),
    );
  },
};

// ─── google-docs ─────────────────────────────────────────────────────────────

export const DOCS_NEW_DOCUMENT_SPEC: GoogleWatchSpec = {
  label: "google-docs:new_document",
  provider: "google-docs",
  expectedEventType: "new_document",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "google-docs",
      "new_document",
      {},
      "google-docs:new_document",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "new_document") return false;
    if (run.triggerPayload?.changeKind !== "created") return false;
    // Marker proof: the REAL changes.list entry's file name is the marker
    // title of the doc the certified create_document created. (Firing at all
    // ALSO proves the Docs-mimeType + createdTime===modifiedTime gates passed
    // on the real fetched change.)
    return payloadStringIncludes(run, "title", identity.marker);
  },
};

export const DOCS_DOCUMENT_UPDATED_SPEC: GoogleWatchSpec = {
  label: "google-docs:document_updated",
  provider: "google-docs",
  expectedEventType: "document_updated",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "google-docs",
      "document_updated",
      {},
      "google-docs:document_updated",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "document_updated") return false;
    if (run.triggerPayload?.changeKind !== "updated") return false;
    // Marker proof: the updated doc's title carries the marker. The seeded
    // row pins config.documentId to the smoke doc, so the receive-time
    // documentId filter passing is also proven by firing at all.
    return payloadStringIncludes(run, "title", identity.marker);
  },
};

// ─── google-drive ────────────────────────────────────────────────────────────

export const DRIVE_FILE_CHANGED_SPEC: GoogleWatchSpec = {
  label: "google-drive:file_changed",
  provider: "google-drive",
  expectedEventType: "file_changed",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "google-drive",
      "file_changed",
      {},
      "google-drive:file_changed",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "file_changed") return false;
    if (run.triggerPayload?.changeKind !== "created") return false;
    if (run.triggerPayload?.objectKind !== "file") return false;
    // Marker proof: the REAL changes.list entry's name is the marker filename
    // the certified upload_file created.
    return run.triggerPayload?.name === `${identity.marker}.txt`;
  },
};

// ─── google-calendar ─────────────────────────────────────────────────────────

export const CALENDAR_EVENT_CHANGED_SPEC: GoogleWatchSpec = {
  label: "google-calendar:event_changed",
  provider: "google-calendar",
  expectedEventType: "event_changed",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "google-calendar",
      "event_changed",
      {},
      "google-calendar:event_changed",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "event_changed") return false;
    if (run.triggerPayload?.changeKind !== "created") return false;
    // Marker proof: the REAL events.list delta entry's summary carries the
    // marker of the event the certified create_event created.
    return payloadStringIncludes(run, "summary", identity.marker);
  },
};

export const ALL_GOOGLE_WATCH_SPECS: readonly GoogleWatchSpec[] = [
  SHEETS_NEW_WORKSHEET_SPEC,
  SHEETS_ROW_CHANGED_SPEC,
  DOCS_NEW_DOCUMENT_SPEC,
  DOCS_DOCUMENT_UPDATED_SPEC,
  DRIVE_FILE_CHANGED_SPEC,
  CALENDAR_EVENT_CHANGED_SPEC,
];
