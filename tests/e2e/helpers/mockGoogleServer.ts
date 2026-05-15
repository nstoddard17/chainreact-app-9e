import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { Buffer } from "node:buffer";

/**
 * Standalone mock Google server for the Gmail (Slice 2f), Google Calendar
 * (Slice 3b), Google Drive (Slice 4b), and Google Sheets (Slice 5b) e2e
 * walkthroughs.
 *
 * Routes (sized to V2's actual call patterns — nothing more):
 *   GET  /o/oauth2/v2/auth                       → 302 to the redirect_uri
 *                                                  query param (V2's per-provider
 *                                                  callback) with the preserved
 *                                                  state + a synthetic code.
 *                                                  Honoring redirect_uri lets
 *                                                  Gmail AND Calendar share this
 *                                                  route without provider-aware
 *                                                  branching.
 *   POST /token                                  → canned token-exchange
 *                                                  response with a recognizable
 *                                                  access + refresh token. Scope
 *                                                  in the response echoes back
 *                                                  whatever the spec needs to
 *                                                  cover both providers' scope
 *                                                  manifests; the access token
 *                                                  doesn't carry scope claims so
 *                                                  one canned token works.
 *   GET  /v1/userinfo                            → OIDC userinfo response with
 *                                                  email + sub. Calendar's OAuth
 *                                                  callback uses this for the
 *                                                  accountId lookup (the
 *                                                  calendar.events scope alone
 *                                                  doesn't grant a getProfile
 *                                                  endpoint that returns email).
 *
 *   Gmail-specific:
 *   GET  /gmail/v1/users/me/profile              → emailAddress + currentHistoryId.
 *                                                  Used by Slice 2c's OAuth
 *                                                  callback for accountId AND
 *                                                  by Slice 2e's activation
 *                                                  hook for the snapshot.
 *   GET  /gmail/v1/users/me/history              → history.list, returns one
 *                                                  messageAdded entry per email
 *                                                  injected since startHistoryId.
 *   GET  /gmail/v1/users/me/messages/{id}        → format=metadata default;
 *                                                  Gmail 2.3 Commit 6 adds
 *                                                  format=full handling so the
 *                                                  new_attachment trigger +
 *                                                  get_attachment action can
 *                                                  enumerate `payload.parts`
 *                                                  for an injected email that
 *                                                  carries attachments.
 *   GET  /gmail/v1/users/me/messages/{id}/attachments/{attId}
 *                                                → Gmail 2.3 Commit 6. Returns
 *                                                  the wire shape
 *                                                  `{ data: base64url, size }`
 *                                                  for an attachment fixture
 *                                                  attached to an injected
 *                                                  email.
 *   POST /gmail/v1/users/me/messages/send        → records the base64url raw
 *                                                  body decoded into headers +
 *                                                  body parts; returns a fake
 *                                                  send id.
 *
 *   Calendar-specific:
 *   GET  /calendar/v3/calendars/{cid}/events     → events.list. With no syncToken
 *                                                  query: initial baseline used
 *                                                  by Slice 3 activate hook —
 *                                                  returns empty items + current
 *                                                  nextSyncToken. With
 *                                                  syncToken=X: drains pending
 *                                                  delta entries injected at
 *                                                  syncTokenAtInsert >= X and
 *                                                  returns them.
 *   POST /calendar/v3/calendars/{cid}/events/watch
 *                                                → events.watch. Returns canned
 *                                                  { id, resourceId, expiration }
 *                                                  where expiration is now+7d
 *                                                  in milliseconds-as-string
 *                                                  (Calendar's max TTL).
 *   POST /calendar/v3/calendars/{cid}/events     → events.insert. Records the
 *                                                  request body and returns a
 *                                                  canned event resource.
 *
 *   Drive-specific:
 *   POST /drive/v3/files/{fileId}/watch          → files.watch. Returns canned
 *                                                  { id, resourceId, expiration }
 *                                                  where expiration is now+7d
 *                                                  in milliseconds-as-string.
 *   GET  /drive/v3/changes/startPageToken        → returns current Drive
 *                                                  pageToken cursor (used by
 *                                                  Slice 4 activate hook AND
 *                                                  by pull's 410-recovery path).
 *   GET  /drive/v3/changes                       → changes.list. With
 *                                                  pageToken=X: drains pending
 *                                                  change entries injected at
 *                                                  pageTokenAtInsert >= X and
 *                                                  returns them. Always returns
 *                                                  newStartPageToken so the
 *                                                  caller persists the new
 *                                                  cursor.
 *   POST /drive/v3/files                         → files.create. Records the
 *                                                  request body and returns a
 *                                                  canned file/folder resource.
 *
 *   Sheets-specific:
 *   GET  /v4/spreadsheets/{id}                   → spreadsheets.get. Returns
 *                                                  canned spreadsheet metadata
 *                                                  with the test sheet's
 *                                                  current row count.
 *   GET  /v4/spreadsheets/{id}/values/{range}    → values.get. Returns
 *                                                  currentSheetsRows for the
 *                                                  test spreadsheet (the test
 *                                                  controls row count via
 *                                                  __injectSheetRow). Range
 *                                                  filtering is intentionally
 *                                                  loose — Sheets API in
 *                                                  reality slices to the
 *                                                  exact range, but the spec
 *                                                  always requests A:Z so the
 *                                                  mock returns all rows.
 *   POST /v4/spreadsheets/{id}/values/{range}:append
 *                                                → values.append. Records
 *                                                  request body, returns
 *                                                  canned updates response.
 *                                                  Does NOT auto-extend the
 *                                                  mock's row store (no
 *                                                  webhook cascades — the
 *                                                  spec drives all state
 *                                                  changes explicitly).
 *   PUT  /v4/spreadsheets/{id}/values/{range}    → values.update. Records.
 *   POST /v4/spreadsheets/{id}/values/{range}:clear
 *                                                → values.clear. Records.
 *
 * Control plane (test-only):
 *   POST /__injectEmail   — inject an email into the mock store and bump
 *                           historyId; the next history.list returns it.
 *                           Gmail 2.3 Commit 6 — body accepts an optional
 *                           `attachments: [{attachmentId, filename,
 *                           mimeType, sizeBytes, base64Data}, …]` field.
 *                           When provided, the email is multipart/mixed
 *                           at top level and the attachments surface
 *                           under `payload.parts` on format=full
 *                           messages.get calls.
 *   POST /__injectLabelChange
 *                         — Gmail 2.3 Commit 6. Bumps historyId and queues
 *                           a labelsAdded entry pointing at an already-
 *                           injected email. Body: `{messageId, addedLabelIds}`.
 *                           Used by the new_labeled_email e2e to fire the
 *                           trigger for a configured labelId.
 *   POST /__replayLastEmail — re-queue the most recently injected email
 *                           WITHOUT bumping historyId. Used by the dedup
 *                           probe so the spec proves the same Gmail message
 *                           id seen twice does not produce two runs.
 *   POST /__injectCalendarEvent
 *                         — bump currentSyncToken by 1, queue a Calendar event
 *                           resource for the next events.list?syncToken=… call.
 *                           Body is the full CalendarEventResource shape; the
 *                           spec hand-crafts it with status/created/updated/etc.
 *   POST /__replayLastCalendarEvent
 *                         — re-queue the most recently injected calendar event
 *                           at its ORIGINAL syncTokenAtInsert WITHOUT bumping
 *                           the cursor. Calendar's analog of __replayLastEmail
 *                           — proves dedup catches the same Calendar event id
 *                           on a second push notification.
 *   POST /__injectDriveChange
 *                         — bump currentDrivePageToken by 1, queue a Drive
 *                           change entry for the next changes.list?pageToken=…
 *                           call. Body is the full DriveChangeEntry shape.
 *   POST /__replayLastDriveChange
 *                         — re-queue the most recently injected drive change
 *                           at its ORIGINAL pageTokenAtInsert WITHOUT bumping
 *                           the cursor. Drive's analog of __replayLastEmail —
 *                           proves dedup catches the same Drive change on a
 *                           second push notification.
 *   POST /__injectSheetRow
 *                         — append a row to the test spreadsheet's row store.
 *                           Body: `{ values: any[] }`. The next values.get
 *                           call surfaces this row.
 *   POST /__replayLastSheetRow
 *                         — re-append the most recently injected row, bumping
 *                           the row count by one more. Sheets' "dedup" works
 *                           via the row-count baseline V2 maintains, NOT via
 *                           webhook_event_dedup at the dispatcher (the spec
 *                           comments explain this; this knob is provided for
 *                           symmetry with Drive/Calendar but the Sheets spec
 *                           uses the simpler "POST webhook twice" approach).
 *   POST /__reset         — clear ALL state (Gmail + Calendar + Drive +
 *                           Sheets) and reset all cursors.
 *   GET  /__inspect       — dump calls + store state; cross-process seam.
 *
 * Listens on a fixed port (default 9877, override via GMAIL_MOCK_PORT).
 * Different port from Slack (9876) so both can run simultaneously under
 * the same global-setup. If the port is busy, fail loud at start.
 *
 * Stateful: tracks an in-memory `currentHistoryId` (BigInt) and a queue
 * of `pendingHistoryEntries` so the spec controls exactly which messages
 * surface on each history.list call. The `replayLastEmail` knob exists
 * specifically for the dedup test — re-queues an entry without bumping
 * the cursor, exactly like a stored-historyId-rewound scenario.
 */

const SEED_HISTORY_ID = "100000";
const SEED_CALENDAR_SYNC_TOKEN = "sync-100000";
const SEED_DRIVE_PAGE_TOKEN = "page-100000";
/** ms — Calendar watches expire after 7 days; mock returns now+7d on watch. */
const CALENDAR_WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** ms — Drive watches: per V1, treat as 7d for renewal-cron purposes. */
const DRIVE_WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RecordedAuthorize {
  state: string;
  scope: string;
  codeChallenge: string | null;
  /** redirect_uri the dispatcher passed — the mock 302s back to this. */
  redirectUri: string | null;
}

export interface RecordedTokenExchange {
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedProfile {
  authorization: string | undefined;
  responseHistoryId: string;
}

export interface RecordedHistoryList {
  authorization: string | undefined;
  url: string;
  startHistoryId: string;
  pageToken: string | null;
  historyTypes: string[];
  responseEntries: number;
}

export interface RecordedMessagesGet {
  authorization: string | undefined;
  url: string;
  messageId: string;
  format: string;
}

/**
 * Gmail 2.3 Commit 6 — `users.messages.attachments.get` recording for
 * the new_attachment + get_attachment e2e scenarios. Mirrors the other
 * Gmail recorders.
 */
export interface RecordedMessagesAttachmentsGet {
  authorization: string | undefined;
  url: string;
  messageId: string;
  attachmentId: string;
}

export interface RecordedMessagesSend {
  authorization: string | undefined;
  raw: string;
  decoded: string;
  parsed: ParsedRfc5322;
}

export interface RecordedUserinfo {
  authorization: string | undefined;
}

export interface RecordedCalendarEventsList {
  authorization: string | undefined;
  url: string;
  calendarId: string;
  syncToken: string | null;
  pageToken: string | null;
  /** How many delta items the response carried. */
  responseItems: number;
  /** Whether the response included a fresh nextSyncToken. */
  responseSyncToken: string | null;
}

export interface RecordedCalendarEventsWatch {
  authorization: string | undefined;
  calendarId: string;
  body: Record<string, unknown>;
  responseChannelId: string;
  responseResourceId: string;
}

export interface RecordedCalendarEventsInsert {
  authorization: string | undefined;
  calendarId: string;
  url: string;
  /** Parsed JSON body sent to events.insert. */
  body: Record<string, unknown>;
}

/**
 * Calendar event resource queued by __injectCalendarEvent for delivery on the
 * next events.list?syncToken=… call. Stored alongside the syncToken that was
 * current AT INSERT TIME so the inject-vs-replay distinction is precise.
 */
export interface InjectedCalendarEvent {
  /** Sync token current at the moment this was injected. */
  syncTokenAtInsert: string;
  /** Full event resource — the spec hand-crafts a realistic shape. */
  resource: Record<string, unknown>;
}

export interface RecordedDriveFilesWatch {
  authorization: string | undefined;
  fileId: string;
  body: Record<string, unknown>;
  responseChannelId: string;
  responseResourceId: string;
}

export interface RecordedDriveChangesGetStartPageToken {
  authorization: string | undefined;
  responseStartPageToken: string;
}

export interface RecordedDriveChangesList {
  authorization: string | undefined;
  url: string;
  pageToken: string | null;
  /** How many delta items the response carried. */
  responseChanges: number;
  /** Whether the response included a fresh newStartPageToken (terminal page). */
  responseNewStartPageToken: string | null;
  /** nextPageToken value when response was paginated mid-stream. */
  responseNextPageToken: string | null;
}

export interface RecordedDriveFilesCreate {
  authorization: string | undefined;
  url: string;
  body: Record<string, unknown>;
}

/**
 * Drive change entry queued by __injectDriveChange for delivery on the next
 * changes.list?pageToken=… call. Stored alongside the pageToken that was
 * current AT INSERT TIME so the inject-vs-replay distinction is precise.
 */
export interface InjectedDriveChange {
  /** Page token current at the moment this was injected. */
  pageTokenAtInsert: string;
  /** Full Drive change entry — the spec hand-crafts a realistic shape. */
  change: Record<string, unknown>;
}

export interface RecordedSheetsSpreadsheetsGet {
  authorization: string | undefined;
  url: string;
  spreadsheetId: string;
}

export interface RecordedSheetsValuesGet {
  authorization: string | undefined;
  url: string;
  spreadsheetId: string;
  range: string;
  responseRowCount: number;
}

export interface RecordedSheetsValuesAppend {
  authorization: string | undefined;
  url: string;
  spreadsheetId: string;
  range: string;
  body: Record<string, unknown>;
  valueInputOption: string | null;
}

export interface RecordedSheetsValuesUpdate {
  authorization: string | undefined;
  url: string;
  spreadsheetId: string;
  range: string;
  body: Record<string, unknown>;
  valueInputOption: string | null;
}

export interface RecordedSheetsValuesClear {
  authorization: string | undefined;
  url: string;
  spreadsheetId: string;
  range: string;
}

/**
 * Sheets 2.1 Commit 2 — create_spreadsheet action exercises the
 * collection-root POST. Records the resolved title + sheets[] array so
 * the spec can assert the bare-vs-initial-sheet-name body shapes the
 * V2 wrapper sends.
 */
export interface RecordedSheetsSpreadsheetsCreate {
  authorization: string | undefined;
  url: string;
  body: Record<string, unknown>;
  /** `body.properties.title` extracted for readability in assertions. */
  title: string | null;
  /** `body.sheets[]` length — 0 when V2 sends a title-only body. */
  initialSheetCount: number;
  /** First initial sheet title (or null if no sheets[] field). */
  firstInitialSheetTitle: string | null;
  /** Echo of the synthetic id the mock returned in the response. */
  responseSpreadsheetId: string;
}

/**
 * Sheets 2.1 Commit 2 — delete_row action exercises
 * spreadsheets.batchUpdate with a deleteDimension request. Records the
 * resolved requests[] array so the spec can assert the half-open
 * (startIndex, endIndex) range that V2's handler computes from the
 * 1-indexed rowNumber input.
 */
export interface RecordedSheetsSpreadsheetsBatchUpdate {
  authorization: string | undefined;
  url: string;
  spreadsheetId: string;
  body: Record<string, unknown>;
  /** `body.requests[]` count; delete_row sends exactly 1. */
  requestCount: number;
  /** Convenience extraction: first deleteDimension request's range. */
  firstDeleteDimensionRange: {
    sheetId?: number;
    dimension?: string;
    startIndex?: number;
    endIndex?: number;
  } | null;
}

/**
 * Minimal RFC 5322 parse — splits headers / body on the first blank line,
 * extracts header name/value pairs case-insensitively, and pulls the
 * primary mimeType. For multipart/alternative we also bucket parts by
 * Content-Type so the spec can grep the plain-text leaf.
 */
export interface ParsedRfc5322 {
  headers: Record<string, string>;
  mimeType: string;
  partsByMimeType: Record<string, string>;
}

/**
 * Per-attachment fixture stored on an injected email. Gmail 2.3 Commit 6.
 *
 * When the spec inject an email with `attachments: [...]`, each entry is
 * stored verbatim here. `users.messages.get?format=full` reads these
 * back as MIME parts; `users.messages.attachments.get` reads the
 * `base64Data` field.
 */
export interface InjectedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /**
   * Base64url-encoded bytes. Gmail's `users.messages.attachments.get`
   * returns this verbatim — the handler / decodeBase64Url turn it into
   * raw bytes for stageFileToStorage.
   */
  base64Data: string;
}

export interface InjectedEmail {
  id: string;
  threadId: string;
  labelIds: readonly string[];
  snippet: string;
  internalDate: string;
  sizeEstimate: number;
  mimeType: string;
  headers: Array<{ name: string; value: string }>;
  /** historyId that was current when the email was injected. */
  historyIdAtInsert: string;
  /**
   * Gmail 2.3 Commit 6 — optional attachment fixtures. Empty array =
   * no attachments. Surfaces under `payload.parts` when
   * `users.messages.get?format=full` is requested.
   */
  attachments: readonly InjectedAttachment[];
}

/**
 * Gmail 2.3 Commit 6 — labelsAdded history entries queued for the next
 * `users.history.list` call. The new_labeled_email trigger filters
 * `source === "labelsAdded"` and matches on `addedLabelIds`, so the
 * mock must surface these distinct from messagesAdded entries.
 */
export interface PendingLabelChange {
  historyId: string;
  messageId: string;
  addedLabelIds: readonly string[];
}

export interface MockGoogleHandle {
  port: number;
  baseUrl: string;
  /** Cumulative call records since last reset. */
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    profile: RecordedProfile[];
    historyList: RecordedHistoryList[];
    messagesGet: RecordedMessagesGet[];
    messagesAttachmentsGet: RecordedMessagesAttachmentsGet[];
    send: RecordedMessagesSend[];
    userinfo: RecordedUserinfo[];
    calendarEventsList: RecordedCalendarEventsList[];
    calendarEventsWatch: RecordedCalendarEventsWatch[];
    calendarEventsInsert: RecordedCalendarEventsInsert[];
    driveFilesWatch: RecordedDriveFilesWatch[];
    driveChangesGetStartPageToken: RecordedDriveChangesGetStartPageToken[];
    driveChangesList: RecordedDriveChangesList[];
    driveFilesCreate: RecordedDriveFilesCreate[];
    sheetsSpreadsheetsGet: RecordedSheetsSpreadsheetsGet[];
    sheetsSpreadsheetsCreate: RecordedSheetsSpreadsheetsCreate[];
    sheetsSpreadsheetsBatchUpdate: RecordedSheetsSpreadsheetsBatchUpdate[];
    sheetsValuesGet: RecordedSheetsValuesGet[];
    sheetsValuesAppend: RecordedSheetsValuesAppend[];
    sheetsValuesUpdate: RecordedSheetsValuesUpdate[];
    sheetsValuesClear: RecordedSheetsValuesClear[];
  };
  /** Map of injected emails by id. */
  emails: Map<string, InjectedEmail>;
  /**
   * historyId entries pending delivery on the next history.list call.
   * Each entry pairs a message id with the historyId it was added at.
   * `replayLastEmail` re-pushes the most recent pending without bumping.
   */
  pendingHistoryEntries: Array<{ historyId: string; messageId: string }>;
  /**
   * Gmail 2.3 Commit 6 — labelsAdded entries pending delivery on the
   * next history.list call. Distinct from messagesAdded so the
   * new_labeled_email trigger gets the right history.record shape.
   */
  pendingLabelChanges: PendingLabelChange[];
  /** Current historyId — returned by getProfile + history.list. */
  currentHistoryId: string;
  /** Most recently injected message id (for replay). */
  lastInjectedMessageId: string | null;
  /** Calendar — current syncToken returned by events.list responses. */
  currentCalendarSyncToken: string;
  /** Calendar — events queued for the next events.list?syncToken=… delta. */
  pendingCalendarEvents: InjectedCalendarEvent[];
  /**
   * Calendar — durable backing store of all injected events by id. The
   * pending queue is consumed (drained) by events.list calls; this map
   * survives so __replayLastCalendarEvent can re-push the same resource at
   * its original syncTokenAtInsert without the spec re-supplying it.
   */
  calendarEvents: Map<string, InjectedCalendarEvent>;
  /** Calendar — most recently injected event id (for replay). */
  lastInjectedCalendarEventId: string | null;
  /** Drive — current pageToken returned by changes.list / startPageToken responses. */
  currentDrivePageToken: string;
  /** Drive — changes queued for the next changes.list?pageToken=… delta. */
  pendingDriveChanges: InjectedDriveChange[];
  /**
   * Drive — durable backing store of all injected changes by fileId. The
   * pending queue is consumed (drained) by changes.list calls; this map
   * survives so __replayLastDriveChange can re-push the same change at its
   * original pageTokenAtInsert without the spec re-supplying it.
   */
  driveChanges: Map<string, InjectedDriveChange>;
  /** Drive — most recently injected change's fileId (for replay). */
  lastInjectedDriveFileId: string | null;
  /**
   * Sheets — current rows of the test spreadsheet. The first dimension
   * is rows; each row is an array of cell values. Default empty;
   * __injectSheetRow appends. `valuesGet` returns this array verbatim
   * (range filtering is intentionally loose — the spec always asks for
   * A:Z so the entire array is the right answer).
   */
  currentSheetsRows: Array<ReadonlyArray<unknown>>;
  /**
   * Sheets — most recently injected row's values, for __replayLastSheetRow.
   * Distinct from `currentSheetsRows.at(-1)` only in that the replay
   * reuses the captured snapshot even after currentSheetsRows is reset.
   */
  lastInjectedSheetsRow: ReadonlyArray<unknown> | null;
  /**
   * Scope string from the most recent authorize call. Cached here so the
   * next /token response can echo whatever set the user "consented" to,
   * without per-provider branching on the token route.
   */
  lastAuthorizeScope: string | null;
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.GMAIL_MOCK_PORT ?? "9877");

export async function startMockGoogleServer(opts: {
  appBaseUrl: string;
  port?: number;
}): Promise<MockGoogleHandle> {
  const port = opts.port ?? DEFAULT_PORT;

  const state: MutableState = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, state).catch((err) => {
      console.error("[mock-google] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-google handler crashed");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    get calls() {
      return state.calls;
    },
    get emails() {
      return state.emails;
    },
    get pendingHistoryEntries() {
      return state.pendingHistoryEntries;
    },
    get pendingLabelChanges() {
      return state.pendingLabelChanges;
    },
    get currentHistoryId() {
      return state.currentHistoryId;
    },
    get lastInjectedMessageId() {
      return state.lastInjectedMessageId;
    },
    get currentCalendarSyncToken() {
      return state.currentCalendarSyncToken;
    },
    get pendingCalendarEvents() {
      return state.pendingCalendarEvents;
    },
    get calendarEvents() {
      return state.calendarEvents;
    },
    get lastInjectedCalendarEventId() {
      return state.lastInjectedCalendarEventId;
    },
    get currentDrivePageToken() {
      return state.currentDrivePageToken;
    },
    get pendingDriveChanges() {
      return state.pendingDriveChanges;
    },
    get driveChanges() {
      return state.driveChanges;
    },
    get lastInjectedDriveFileId() {
      return state.lastInjectedDriveFileId;
    },
    get currentSheetsRows() {
      return state.currentSheetsRows;
    },
    get lastInjectedSheetsRow() {
      return state.lastInjectedSheetsRow;
    },
    get lastAuthorizeScope() {
      return state.lastAuthorizeScope;
    },
    reset: () => Object.assign(state, freshState()),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

type MutableState = Pick<
  MockGoogleHandle,
  | "calls"
  | "emails"
  | "pendingHistoryEntries"
  | "pendingLabelChanges"
  | "currentHistoryId"
  | "lastInjectedMessageId"
  | "currentCalendarSyncToken"
  | "pendingCalendarEvents"
  | "calendarEvents"
  | "lastInjectedCalendarEventId"
  | "currentDrivePageToken"
  | "pendingDriveChanges"
  | "driveChanges"
  | "lastInjectedDriveFileId"
  | "currentSheetsRows"
  | "lastInjectedSheetsRow"
  | "lastAuthorizeScope"
>;

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      profile: [],
      historyList: [],
      messagesGet: [],
      messagesAttachmentsGet: [],
      send: [],
      userinfo: [],
      calendarEventsList: [],
      calendarEventsWatch: [],
      calendarEventsInsert: [],
      driveFilesWatch: [],
      driveChangesGetStartPageToken: [],
      driveChangesList: [],
      driveFilesCreate: [],
      sheetsSpreadsheetsGet: [],
      sheetsSpreadsheetsCreate: [],
      sheetsSpreadsheetsBatchUpdate: [],
      sheetsValuesGet: [],
      sheetsValuesAppend: [],
      sheetsValuesUpdate: [],
      sheetsValuesClear: [],
    },
    emails: new Map(),
    pendingHistoryEntries: [],
    pendingLabelChanges: [],
    currentHistoryId: SEED_HISTORY_ID,
    lastInjectedMessageId: null,
    currentCalendarSyncToken: SEED_CALENDAR_SYNC_TOKEN,
    pendingCalendarEvents: [],
    calendarEvents: new Map(),
    lastInjectedCalendarEventId: null,
    currentDrivePageToken: SEED_DRIVE_PAGE_TOKEN,
    pendingDriveChanges: [],
    driveChanges: new Map(),
    lastInjectedDriveFileId: null,
    currentSheetsRows: [],
    lastInjectedSheetsRow: null,
    lastAuthorizeScope: null,
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  appBaseUrl: string,
  state: MutableState,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://placeholder");

  // ── Authorize ──
  if (req.method === "GET" && url.pathname === "/o/oauth2/v2/auth") {
    const stateParam = url.searchParams.get("state");
    const scope = url.searchParams.get("scope") ?? "";
    const codeChallenge = url.searchParams.get("code_challenge");
    const redirectUri = url.searchParams.get("redirect_uri");
    if (!stateParam) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing state");
      return;
    }
    state.calls.authorize.push({
      state: stateParam,
      scope,
      codeChallenge,
      redirectUri,
    });
    // Track the most recent scope so the next token exchange echoes it back.
    // Real Google grants whatever the user consented to from the authorize
    // request; the mock approximates that by passing the scope through.
    state.lastAuthorizeScope = scope;
    // Honor the dispatcher's redirect_uri so this single route works for both
    // gmail and google-calendar callbacks. Real Google validates redirect_uri
    // against registered URIs; the mock just trusts what V2 sent. Falling back
    // to the gmail callback keeps the route usable if a future caller forgets
    // to pass redirect_uri.
    const callback = redirectUri
      ? new URL(redirectUri)
      : new URL("/api/integrations/oauth/gmail/callback", appBaseUrl);
    callback.searchParams.set("code", `mock-google-code-${Date.now()}`);
    callback.searchParams.set("state", stateParam);
    res.writeHead(302, { location: callback.toString() });
    res.end();
    return;
  }

  // ── Token exchange ──
  if (req.method === "POST" && url.pathname === "/token") {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const parsed: Record<string, string> = {};
    for (const [k, v] of params.entries()) parsed[k] = v;
    state.calls.tokenExchange.push({ body, parsedBody: parsed });
    res.writeHead(200, { "content-type": "application/json" });
    // Echo whichever scope was on the most recent authorize call so Gmail
    // and Calendar walkthroughs both end up with their manifest's scope set
    // persisted on the integration row. Falls back to Gmail's pair to keep
    // pre-Slice-3b behavior intact when the mock somehow received a token
    // exchange without a prior authorize (impossible via the real flow).
    const grantedScope =
      state.lastAuthorizeScope ??
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
    res.end(
      JSON.stringify({
        access_token: "ya29.mock-e2e-access",
        refresh_token: "1//mock-e2e-refresh",
        expires_in: 3600,
        scope: grantedScope,
        token_type: "Bearer",
      }),
    );
    return;
  }

  // ── OIDC userinfo (Calendar OAuth callback's accountId lookup) ──
  if (req.method === "GET" && url.pathname === "/v1/userinfo") {
    state.calls.userinfo.push({ authorization: req.headers.authorization });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        email: "alice@e2e.test",
        email_verified: true,
        sub: "user-sub-e2e",
      }),
    );
    return;
  }

  // ── Calendar events.list ──
  // Path: /calendar/v3/calendars/{cid}/events
  // Two cases:
  //   - No syncToken query param: initial baseline (Slice 3 activate hook).
  //     Return empty items + currentCalendarSyncToken as nextSyncToken.
  //   - syncToken=X: drain any pending entries whose syncTokenAtInsert >= X
  //     and return them. Always return currentCalendarSyncToken so the
  //     caller persists the new cursor.
  const calendarEventsListMatch = url.pathname.match(
    /^\/calendar\/v3\/calendars\/([^/]+)\/events$/,
  );
  if (req.method === "GET" && calendarEventsListMatch) {
    const calendarId = decodeURIComponent(calendarEventsListMatch[1]!);
    const syncToken = url.searchParams.get("syncToken");
    const pageToken = url.searchParams.get("pageToken");

    let items: Array<Record<string, unknown>> = [];
    if (syncToken) {
      // Delta call. Drain entries with syncTokenAtInsert >= syncToken.
      // String compare works because mock issues lexically-ordered tokens
      // ("sync-100000" < "sync-100001" < …).
      const remaining: InjectedCalendarEvent[] = [];
      for (const entry of state.pendingCalendarEvents) {
        if (entry.syncTokenAtInsert >= syncToken) {
          items.push(entry.resource);
          // Drained — spec re-queues explicitly via /__replayLastCalendarEvent
          // when it wants a replay.
          continue;
        }
        remaining.push(entry);
      }
      state.pendingCalendarEvents = remaining;
    }

    state.calls.calendarEventsList.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      calendarId,
      syncToken,
      pageToken,
      responseItems: items.length,
      responseSyncToken: state.currentCalendarSyncToken,
    });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kind: "calendar#events",
        summary: calendarId,
        timeZone: "UTC",
        items,
        nextSyncToken: state.currentCalendarSyncToken,
      }),
    );
    return;
  }

  // ── Calendar events.watch ──
  // Path: /calendar/v3/calendars/{cid}/events/watch
  const calendarEventsWatchMatch = url.pathname.match(
    /^\/calendar\/v3\/calendars\/([^/]+)\/events\/watch$/,
  );
  if (req.method === "POST" && calendarEventsWatchMatch) {
    const calendarId = decodeURIComponent(calendarEventsWatchMatch[1]!);
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    const channelId = (parsed.id as string) ?? "";
    // Resource id Google would generate on its end. Echoing a deterministic
    // string keeps assertions simple.
    const resourceId = `mock-resource-${channelId}`;
    const expiration = String(Date.now() + CALENDAR_WATCH_TTL_MS);
    state.calls.calendarEventsWatch.push({
      authorization: req.headers.authorization,
      calendarId,
      body: parsed,
      responseChannelId: channelId,
      responseResourceId: resourceId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kind: "api#channel",
        id: channelId,
        resourceId,
        resourceUri: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?alt=json`,
        expiration,
      }),
    );
    return;
  }

  // ── Calendar events.insert ──
  // Path: /calendar/v3/calendars/{cid}/events
  // POST (the GET branch above handles list).
  if (req.method === "POST" && calendarEventsListMatch) {
    const calendarId = decodeURIComponent(calendarEventsListMatch[1]!);
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    state.calls.calendarEventsInsert.push({
      authorization: req.headers.authorization,
      calendarId,
      url: req.url ?? "",
      body: parsed,
    });
    const id = `mock-evt-${Date.now()}`;
    const nowIso = new Date().toISOString();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kind: "calendar#event",
        id,
        status: "confirmed",
        htmlLink: `https://calendar.google.com/event?eid=${id}`,
        created: nowIso,
        updated: nowIso,
        summary: parsed.summary,
        start: parsed.start,
        end: parsed.end,
        attendees: parsed.attendees ?? [],
      }),
    );
    return;
  }

  // ── Sheets spreadsheets.create ──
  // Path: POST /v4/spreadsheets (collection root — no path id)
  // Used by Sheets 2.1 create_spreadsheet action. Records the resolved
  // title + initial sheet titles. Echoes a synthetic spreadsheetId +
  // spreadsheetUrl back; the spec asserts the body shape and that the
  // returned id flows into the workflow_run output.
  if (req.method === "POST" && url.pathname === "/v4/spreadsheets") {
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    const properties = (parsed.properties ?? {}) as Record<string, unknown>;
    const title = typeof properties.title === "string" ? properties.title : null;
    const sheetsArr = Array.isArray(parsed.sheets)
      ? (parsed.sheets as Array<Record<string, unknown>>)
      : [];
    // Echo back the user-supplied sheet titles, or default to a single
    // "Sheet1" entry (mirrors Google's default when caller omits sheets[]).
    const effectiveSheets =
      sheetsArr.length > 0
        ? sheetsArr.map((s, idx) => {
            const props = (s.properties ?? {}) as Record<string, unknown>;
            return {
              properties: {
                sheetId: idx,
                title: (props.title as string) ?? `Sheet${idx + 1}`,
                index: idx,
                sheetType: "GRID",
                gridProperties: { rowCount: 1000, columnCount: 26 },
              },
            };
          })
        : [
            {
              properties: {
                sheetId: 0,
                title: "Sheet1",
                index: 0,
                sheetType: "GRID",
                gridProperties: { rowCount: 1000, columnCount: 26 },
              },
            },
          ];
    const responseSpreadsheetId = `mock-ss-${Date.now()}`;
    const firstInitialSheetTitle =
      sheetsArr.length > 0
        ? (((sheetsArr[0]!.properties ?? {}) as Record<string, unknown>)
            .title as string) ?? null
        : null;
    state.calls.sheetsSpreadsheetsCreate.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      body: parsed,
      title,
      initialSheetCount: sheetsArr.length,
      firstInitialSheetTitle,
      responseSpreadsheetId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        spreadsheetId: responseSpreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${responseSpreadsheetId}/edit`,
        properties: {
          title: title ?? "Untitled",
          locale: "en_US",
          timeZone: "America/Los_Angeles",
          autoRecalc: "ON_CHANGE",
          defaultFormat: {},
        },
        sheets: effectiveSheets,
      }),
    );
    return;
  }

  // ── Sheets spreadsheets.batchUpdate ──
  // Path: POST /v4/spreadsheets/{id}:batchUpdate
  // Used by Sheets 2.1 delete_row action (deleteDimension request).
  // Future: format_range (repeatCell). Records the request shape so the
  // spec can assert the half-open (startIndex, endIndex) range V2's
  // handler computes from the 1-indexed rowNumber input.
  // MUST be matched before the spreadsheets.get GET handler (different
  // method, but the path prefix would also match the GET regex without
  // the colon).
  const sheetsBatchUpdateMatch = url.pathname.match(
    /^\/v4\/spreadsheets\/([^/]+):batchUpdate$/,
  );
  if (req.method === "POST" && sheetsBatchUpdateMatch) {
    const spreadsheetId = decodeURIComponent(sheetsBatchUpdateMatch[1]!);
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    const requestsArr = Array.isArray(parsed.requests)
      ? (parsed.requests as Array<Record<string, unknown>>)
      : [];
    const firstDeleteReq = requestsArr.find(
      (r) => r && typeof r === "object" && "deleteDimension" in r,
    );
    const firstDeleteRange =
      firstDeleteReq && typeof firstDeleteReq.deleteDimension === "object"
        ? (
            (firstDeleteReq.deleteDimension as Record<string, unknown>)
              .range as Record<string, unknown> | undefined
          )
        : undefined;
    state.calls.sheetsSpreadsheetsBatchUpdate.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      spreadsheetId,
      body: parsed,
      requestCount: requestsArr.length,
      firstDeleteDimensionRange: firstDeleteRange
        ? {
            sheetId:
              typeof firstDeleteRange.sheetId === "number"
                ? firstDeleteRange.sheetId
                : undefined,
            dimension:
              typeof firstDeleteRange.dimension === "string"
                ? firstDeleteRange.dimension
                : undefined,
            startIndex:
              typeof firstDeleteRange.startIndex === "number"
                ? firstDeleteRange.startIndex
                : undefined,
            endIndex:
              typeof firstDeleteRange.endIndex === "number"
                ? firstDeleteRange.endIndex
                : undefined,
          }
        : null,
    });
    // Echo back a per-request reply array shaped like Google's response.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        spreadsheetId,
        replies: requestsArr.map(() => ({})),
      }),
    );
    return;
  }

  // ── Sheets spreadsheets.get ──
  // Path: /v4/spreadsheets/{id}
  // Used by Slice 5's get_sheet_metadata action. The action's e2e doesn't
  // assert on the metadata content; we return a minimal canned shape.
  const sheetsSpreadsheetsGetMatch = url.pathname.match(
    /^\/v4\/spreadsheets\/([^/]+)$/,
  );
  if (req.method === "GET" && sheetsSpreadsheetsGetMatch) {
    const spreadsheetId = decodeURIComponent(sheetsSpreadsheetsGetMatch[1]!);
    state.calls.sheetsSpreadsheetsGet.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      spreadsheetId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        spreadsheetId,
        properties: {
          title: "E2E Test Spreadsheet",
          locale: "en_US",
          timeZone: "America/Los_Angeles",
        },
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: "Sheet1",
              index: 0,
              sheetType: "GRID",
              gridProperties: {
                rowCount: state.currentSheetsRows.length,
                columnCount: 26,
              },
            },
          },
        ],
      }),
    );
    return;
  }

  // ── Sheets values.get ──
  // Path: /v4/spreadsheets/{id}/values/{range}
  // GET only. POST against the same path-with-:append/:clear suffix is
  // matched separately further down.
  const sheetsValuesPathMatch = url.pathname.match(
    /^\/v4\/spreadsheets\/([^/]+)\/values\/(.+?)(:append|:clear)?$/,
  );
  if (
    req.method === "GET" &&
    sheetsValuesPathMatch &&
    !sheetsValuesPathMatch[3]
  ) {
    const spreadsheetId = decodeURIComponent(sheetsValuesPathMatch[1]!);
    const range = decodeURIComponent(sheetsValuesPathMatch[2]!);
    state.calls.sheetsValuesGet.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      spreadsheetId,
      range,
      responseRowCount: state.currentSheetsRows.length,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        range,
        majorDimension: url.searchParams.get("majorDimension") ?? "ROWS",
        // Spec always asks for A:Z; mock returns the entire row store.
        // Real Sheets would slice to the exact range, but the spec
        // doesn't depend on slice behavior.
        values: state.currentSheetsRows,
      }),
    );
    return;
  }

  // ── Sheets values.append ──
  // Path: /v4/spreadsheets/{id}/values/{range}:append
  // Records the call. Does NOT extend currentSheetsRows — the spec
  // controls all row-state changes via __injectSheetRow to avoid
  // accidental webhook cascades.
  if (
    req.method === "POST" &&
    sheetsValuesPathMatch &&
    sheetsValuesPathMatch[3] === ":append"
  ) {
    const spreadsheetId = decodeURIComponent(sheetsValuesPathMatch[1]!);
    const range = decodeURIComponent(sheetsValuesPathMatch[2]!);
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    state.calls.sheetsValuesAppend.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      spreadsheetId,
      range,
      body: parsed,
      valueInputOption: url.searchParams.get("valueInputOption"),
    });
    const appendedRows = ((parsed.values as unknown[][]) ?? []).length;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        spreadsheetId,
        tableRange: range,
        updates: {
          spreadsheetId,
          updatedRange: `${range.split("!")[0]}!A${state.currentSheetsRows.length + 1}`,
          updatedRows: appendedRows,
          updatedColumns: Math.max(
            ...((parsed.values as unknown[][]) ?? [[]]).map(
              (r) => (r ?? []).length,
            ),
            1,
          ),
          updatedCells: appendedRows,
        },
      }),
    );
    return;
  }

  // ── Sheets values.update ──
  // PUT against /v4/spreadsheets/{id}/values/{range} (no :append/:clear suffix).
  if (
    req.method === "PUT" &&
    sheetsValuesPathMatch &&
    !sheetsValuesPathMatch[3]
  ) {
    const spreadsheetId = decodeURIComponent(sheetsValuesPathMatch[1]!);
    const range = decodeURIComponent(sheetsValuesPathMatch[2]!);
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    state.calls.sheetsValuesUpdate.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      spreadsheetId,
      range,
      body: parsed,
      valueInputOption: url.searchParams.get("valueInputOption"),
    });
    const updatedRows = ((parsed.values as unknown[][]) ?? []).length;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        spreadsheetId,
        updatedRange: range,
        updatedRows,
        updatedColumns: Math.max(
          ...((parsed.values as unknown[][]) ?? [[]]).map(
            (r) => (r ?? []).length,
          ),
          1,
        ),
        updatedCells: updatedRows,
      }),
    );
    return;
  }

  // ── Sheets values.clear ──
  // Path: /v4/spreadsheets/{id}/values/{range}:clear
  if (
    req.method === "POST" &&
    sheetsValuesPathMatch &&
    sheetsValuesPathMatch[3] === ":clear"
  ) {
    const spreadsheetId = decodeURIComponent(sheetsValuesPathMatch[1]!);
    const range = decodeURIComponent(sheetsValuesPathMatch[2]!);
    state.calls.sheetsValuesClear.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      spreadsheetId,
      range,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ spreadsheetId, clearedRange: range }));
    return;
  }

  // ── Drive files.watch ──
  // Path: /drive/v3/files/{fileId}/watch
  // Used by Slice 4 activate. Body: { id, type: "web_hook", address, token,
  // params?: { ttl } }. Returns canned { id, resourceId, expiration }.
  const driveFilesWatchMatch = url.pathname.match(
    /^\/drive\/v3\/files\/([^/]+)\/watch$/,
  );
  if (req.method === "POST" && driveFilesWatchMatch) {
    const fileId = decodeURIComponent(driveFilesWatchMatch[1]!);
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    const channelId = (parsed.id as string) ?? "";
    const resourceId = `mock-drive-resource-${channelId}`;
    const expiration = String(Date.now() + DRIVE_WATCH_TTL_MS);
    state.calls.driveFilesWatch.push({
      authorization: req.headers.authorization,
      fileId,
      body: parsed,
      responseChannelId: channelId,
      responseResourceId: resourceId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kind: "api#channel",
        id: channelId,
        resourceId,
        resourceUri: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=json`,
        expiration,
      }),
    );
    return;
  }

  // ── Drive changes.getStartPageToken ──
  if (
    req.method === "GET" &&
    url.pathname === "/drive/v3/changes/startPageToken"
  ) {
    state.calls.driveChangesGetStartPageToken.push({
      authorization: req.headers.authorization,
      responseStartPageToken: state.currentDrivePageToken,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kind: "drive#startPageToken",
        startPageToken: state.currentDrivePageToken,
      }),
    );
    return;
  }

  // ── Drive changes.list ──
  // Path: /drive/v3/changes
  // pageToken=X drains pending entries with pageTokenAtInsert >= X.
  // newStartPageToken = current cursor (signals terminal page).
  if (req.method === "GET" && url.pathname === "/drive/v3/changes") {
    const pageToken = url.searchParams.get("pageToken");
    let changes: Array<Record<string, unknown>> = [];
    if (pageToken) {
      // String compare works because mock issues lexically-ordered tokens
      // ("page-100000" < "page-100001" < …). Drains entries whose
      // pageTokenAtInsert >= request pageToken — the >= (not >) handles
      // the replay case where re-queue sits at the same token V2 stored.
      const remaining: InjectedDriveChange[] = [];
      for (const entry of state.pendingDriveChanges) {
        if (entry.pageTokenAtInsert >= pageToken) {
          changes.push(entry.change);
          // Drained — spec re-queues explicitly via /__replayLastDriveChange
          // when it wants a replay.
          continue;
        }
        remaining.push(entry);
      }
      state.pendingDriveChanges = remaining;
    }

    state.calls.driveChangesList.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      pageToken,
      responseChanges: changes.length,
      responseNewStartPageToken: state.currentDrivePageToken,
      responseNextPageToken: null,
    });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kind: "drive#changeList",
        changes,
        newStartPageToken: state.currentDrivePageToken,
      }),
    );
    return;
  }

  // ── Drive files.create (folder + metadata-only) ──
  // Path: /drive/v3/files (POST). Slice 4 Batch 2 only exercises the
  // create_folder path; uploadFile uses /upload/drive/v3/files which is a
  // different host root and isn't needed for this walkthrough.
  if (req.method === "POST" && url.pathname === "/drive/v3/files") {
    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    state.calls.driveFilesCreate.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      body: parsed,
    });
    const id = `mock-drv-${Date.now()}`;
    const nowIso = new Date().toISOString();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kind: "drive#file",
        id,
        name: parsed.name,
        mimeType: parsed.mimeType,
        parents: parsed.parents ?? [],
        webViewLink: `https://drive.google.com/drive/folders/${id}`,
        createdTime: nowIso,
        modifiedTime: nowIso,
      }),
    );
    return;
  }

  // ── users.getProfile ──
  if (
    req.method === "GET" &&
    url.pathname === "/gmail/v1/users/me/profile"
  ) {
    state.calls.profile.push({
      authorization: req.headers.authorization,
      responseHistoryId: state.currentHistoryId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        emailAddress: "alice@e2e.test",
        messagesTotal: state.emails.size,
        threadsTotal: state.emails.size,
        historyId: state.currentHistoryId,
      }),
    );
    return;
  }

  // ── users.history.list ──
  if (
    req.method === "GET" &&
    url.pathname === "/gmail/v1/users/me/history"
  ) {
    const startHistoryId = url.searchParams.get("startHistoryId") ?? "0";
    const pageToken = url.searchParams.get("pageToken");
    const historyTypes = url.searchParams.getAll("historyTypes");
    const startBig = safeBigInt(startHistoryId);

    // Drain pending entries whose historyId is > startHistoryId. The
    // dedup probe re-queues an entry at its original historyId, so we
    // include entries with historyId >= startHistoryId when the
    // requested cursor matches the entry's historyId exactly — this
    // simulates "stored cursor was rewound and we walk forward again".
    interface HistoryEntry {
      id: string;
      messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
      labelsAdded?: Array<{
        message: { id: string; threadId: string };
        labelIds: readonly string[];
      }>;
    }
    const out: HistoryEntry[] = [];
    const remaining: typeof state.pendingHistoryEntries = [];
    for (const entry of state.pendingHistoryEntries) {
      const entryBig = safeBigInt(entry.historyId);
      if (startBig === null || entryBig === null) {
        remaining.push(entry);
        continue;
      }
      // > startHistoryId is the normal case (new message arrived since the
      // stored cursor). === also delivers — handles dedup probe / rewind.
      if (entryBig >= startBig) {
        const email = state.emails.get(entry.messageId);
        if (email) {
          out.push({
            id: entry.historyId,
            messagesAdded: [
              { message: { id: email.id, threadId: email.threadId } },
            ],
          });
        }
        // Once delivered, remove from pending — the spec re-queues
        // explicitly via /__replayLastEmail when it wants a replay.
        continue;
      }
      remaining.push(entry);
    }
    state.pendingHistoryEntries = remaining;

    // Gmail 2.3 Commit 6 — drain pending labelsAdded entries on the
    // same cursor rule. The trigger filters by source first then by
    // addedLabelIds; emit them with the spec-supplied label-id list so
    // the new_labeled_email trigger can match (or NOT match — the spec
    // can inject a non-matching label change and assert no fire).
    const remainingLabels: typeof state.pendingLabelChanges = [];
    for (const change of state.pendingLabelChanges) {
      const entryBig = safeBigInt(change.historyId);
      if (startBig === null || entryBig === null) {
        remainingLabels.push(change);
        continue;
      }
      if (entryBig >= startBig) {
        const email = state.emails.get(change.messageId);
        if (email) {
          out.push({
            id: change.historyId,
            labelsAdded: [
              {
                message: { id: email.id, threadId: email.threadId },
                labelIds: change.addedLabelIds,
              },
            ],
          });
        }
        continue;
      }
      remainingLabels.push(change);
    }
    state.pendingLabelChanges = remainingLabels;

    state.calls.historyList.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      startHistoryId,
      pageToken,
      historyTypes,
      responseEntries: out.length,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        history: out,
        historyId: state.currentHistoryId,
      }),
    );
    return;
  }

  // ── users.messages.attachments.get ──
  // Gmail 2.3 Commit 6. Path: /gmail/v1/users/me/messages/{messageId}/attachments/{attachmentId}
  // MUST be matched before users.messages.get (which uses startsWith
  // and would otherwise eat this path).
  const attachmentsGetMatch = url.pathname.match(
    /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/,
  );
  if (req.method === "GET" && attachmentsGetMatch) {
    const messageId = decodeURIComponent(attachmentsGetMatch[1]!);
    const attachmentId = decodeURIComponent(attachmentsGetMatch[2]!);
    state.calls.messagesAttachmentsGet.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      messageId,
      attachmentId,
    });
    const email = state.emails.get(messageId);
    const att = email?.attachments.find(
      (a) => a.attachmentId === attachmentId,
    );
    if (!email || !att) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { code: 404, message: "Attachment not found" },
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        // Gmail's wire shape: base64url-encoded data + reported size.
        data: att.base64Data,
        size: att.sizeBytes,
      }),
    );
    return;
  }

  // ── users.messages.get ──
  if (
    req.method === "GET" &&
    url.pathname.startsWith("/gmail/v1/users/me/messages/")
  ) {
    const messageId = decodeURIComponent(
      url.pathname.replace("/gmail/v1/users/me/messages/", ""),
    );
    const format = url.searchParams.get("format") ?? "";
    state.calls.messagesGet.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      messageId,
      format,
    });
    const email = state.emails.get(messageId);
    if (!email) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: 404, message: "Not Found" } }));
      return;
    }
    // Gmail 2.3 Commit 6 — format=full returns the full MIME tree with
    // `parts`. format=metadata (and the legacy empty default) keeps the
    // pre-Commit-6 shape so the existing slice-2f new_email walkthrough
    // is byte-for-byte unchanged.
    const payload: Record<string, unknown> = {
      mimeType: email.mimeType,
      headers: email.headers,
    };
    if (format === "full" && email.attachments.length > 0) {
      // Single top-level part for body + one part per attachment is the
      // typical multipart/mixed shape for emails with attachments. The
      // extractAttachmentMetadata walk picks up the attachments via the
      // filename + body.attachmentId predicate.
      payload.parts = [
        {
          mimeType: "text/plain",
          filename: "",
          body: { size: email.sizeEstimate },
        },
        ...email.attachments.map((a) => ({
          mimeType: a.mimeType,
          filename: a.filename,
          body: { attachmentId: a.attachmentId, size: a.sizeBytes },
        })),
      ];
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: email.id,
        threadId: email.threadId,
        labelIds: email.labelIds,
        snippet: email.snippet,
        internalDate: email.internalDate,
        sizeEstimate: email.sizeEstimate,
        payload,
      }),
    );
    return;
  }

  // ── users.messages.send ──
  if (
    req.method === "POST" &&
    url.pathname === "/gmail/v1/users/me/messages/send"
  ) {
    const body = await readBody(req);
    let raw = "";
    try {
      const parsed = JSON.parse(body) as { raw?: string };
      raw = parsed.raw ?? "";
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    const decoded = base64UrlDecodeToString(raw);
    const parsedMessage = parseRfc5322(decoded);
    state.calls.send.push({
      authorization: req.headers.authorization,
      raw,
      decoded,
      parsed: parsedMessage,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: `sent-${Date.now()}`,
        threadId: "sent-thr",
        labelIds: ["SENT"],
      }),
    );
    return;
  }

  // ── Control plane ──

  if (req.method === "POST" && url.pathname === "/__injectEmail") {
    const body = await readBody(req);
    let payload: {
      id: string;
      headers: Record<string, string>;
      mimeType?: string;
      snippet?: string;
      /**
       * Gmail 2.3 Commit 6 — optional attachment fixtures. When
       * provided, the next users.messages.get?format=full surfaces
       * these as `payload.parts` and users.messages.attachments.get
       * serves `base64Data` for each id.
       */
      attachments?: Array<{
        attachmentId: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        base64Data: string;
      }>;
    };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    if (!payload.id || !payload.headers) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing id or headers");
      return;
    }
    // Bump historyId by 1 to simulate "a new message arrived".
    const nextId = (safeBigInt(state.currentHistoryId) ?? 0n) + 1n;
    state.currentHistoryId = nextId.toString();
    const attachments: readonly InjectedAttachment[] = (
      payload.attachments ?? []
    ).map((a) => ({
      attachmentId: a.attachmentId,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      base64Data: a.base64Data,
    }));
    // When attachments are present, the email is multipart/mixed at
    // the top level (matches what real Gmail does and what
    // new_email's hasAttachments heuristic looks for).
    const defaultMime = attachments.length > 0
      ? "multipart/mixed"
      : "multipart/alternative";
    const email: InjectedEmail = {
      id: payload.id,
      threadId: `thr-${payload.id}`,
      labelIds: ["INBOX", "UNREAD"],
      snippet: payload.snippet ?? "",
      internalDate: String(Date.now()),
      sizeEstimate: 1024,
      mimeType: payload.mimeType ?? defaultMime,
      headers: Object.entries(payload.headers).map(([name, value]) => ({
        name,
        value,
      })),
      historyIdAtInsert: state.currentHistoryId,
      attachments,
    };
    state.emails.set(email.id, email);
    state.pendingHistoryEntries.push({
      historyId: state.currentHistoryId,
      messageId: email.id,
    });
    state.lastInjectedMessageId = email.id;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        currentHistoryId: state.currentHistoryId,
        messageId: email.id,
        attachmentCount: attachments.length,
      }),
    );
    return;
  }

  // ── Control plane — Gmail 2.3 Commit 6 ──
  //
  // __injectLabelChange: bumps historyId, queues a labelsAdded entry
  // pointing at an already-injected email. The email must already exist
  // (spec injects via __injectEmail first, or via the bundled
  // /__injectEmail-then-/__injectLabelChange flow). `addedLabelIds` is
  // the spec-supplied list — the new_labeled_email trigger matches
  // strictly on this list.
  if (req.method === "POST" && url.pathname === "/__injectLabelChange") {
    const body = await readBody(req);
    let payload: { messageId: string; addedLabelIds: string[] };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    if (
      !payload.messageId ||
      !Array.isArray(payload.addedLabelIds) ||
      payload.addedLabelIds.length === 0
    ) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing messageId or addedLabelIds");
      return;
    }
    if (!state.emails.has(payload.messageId)) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end(`messageId ${payload.messageId} not previously injected`);
      return;
    }
    // Bump historyId to simulate "a label was applied".
    const nextId = (safeBigInt(state.currentHistoryId) ?? 0n) + 1n;
    state.currentHistoryId = nextId.toString();
    state.pendingLabelChanges.push({
      historyId: state.currentHistoryId,
      messageId: payload.messageId,
      addedLabelIds: payload.addedLabelIds,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        currentHistoryId: state.currentHistoryId,
        messageId: payload.messageId,
        addedLabelIds: payload.addedLabelIds,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__injectCalendarEvent") {
    const body = await readBody(req);
    let resource: Record<string, unknown>;
    try {
      resource = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    if (!resource.id) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing event id");
      return;
    }
    // Bump the sync token by 1. Token format `sync-<bigint>` so we can
    // increment via parse + format.
    const m = state.currentCalendarSyncToken.match(/^sync-(\d+)$/);
    if (!m) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("unrecoverable sync token format");
      return;
    }
    const next = (BigInt(m[1]!) + 1n).toString();
    state.currentCalendarSyncToken = `sync-${next}`;
    const entry: InjectedCalendarEvent = {
      syncTokenAtInsert: state.currentCalendarSyncToken,
      resource,
    };
    state.pendingCalendarEvents.push(entry);
    state.calendarEvents.set(resource.id as string, entry);
    state.lastInjectedCalendarEventId = resource.id as string;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        currentSyncToken: state.currentCalendarSyncToken,
        eventId: resource.id,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__replayLastCalendarEvent") {
    if (!state.lastInjectedCalendarEventId) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("no calendar event to replay");
      return;
    }
    // Look up the backing store. Pending was drained on the previous
    // events.list; the durable map keeps the resource around so replay
    // doesn't need spec input. Re-push at the ORIGINAL syncTokenAtInsert
    // so the next events.list?syncToken=… surfaces it again WITHOUT bumping
    // the cursor — exact analog of __replayLastEmail's historyId behavior.
    const entry = state.calendarEvents.get(state.lastInjectedCalendarEventId);
    if (!entry) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("last injected event not found in backing store");
      return;
    }
    state.pendingCalendarEvents.push({
      syncTokenAtInsert: entry.syncTokenAtInsert,
      resource: entry.resource,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        replayedEventId: state.lastInjectedCalendarEventId,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__injectDriveChange") {
    const body = await readBody(req);
    let change: Record<string, unknown>;
    try {
      change = JSON.parse(body) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    const fileId = change.fileId as string | undefined;
    if (!fileId) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing fileId on change");
      return;
    }
    // Bump page token by 1. Token format `page-<bigint>` so we can
    // increment via parse + format (lex order matches numeric order).
    const m = state.currentDrivePageToken.match(/^page-(\d+)$/);
    if (!m) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("unrecoverable page token format");
      return;
    }
    const next = (BigInt(m[1]!) + 1n).toString();
    state.currentDrivePageToken = `page-${next}`;
    const entry: InjectedDriveChange = {
      pageTokenAtInsert: state.currentDrivePageToken,
      change,
    };
    state.pendingDriveChanges.push(entry);
    state.driveChanges.set(fileId, entry);
    state.lastInjectedDriveFileId = fileId;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        currentPageToken: state.currentDrivePageToken,
        fileId,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__replayLastDriveChange") {
    if (!state.lastInjectedDriveFileId) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("no drive change to replay");
      return;
    }
    const entry = state.driveChanges.get(state.lastInjectedDriveFileId);
    if (!entry) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("last injected drive change not found in backing store");
      return;
    }
    // Re-push at the ORIGINAL pageTokenAtInsert. The cursor is NOT bumped,
    // so a subsequent changes.list?pageToken=<that-token> surfaces the same
    // change again. Workflow dispatch must dedup via webhook_event_dedup
    // keyed on (google-drive, "{fileId}:{change.time}").
    state.pendingDriveChanges.push({
      pageTokenAtInsert: entry.pageTokenAtInsert,
      change: entry.change,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        replayedFileId: state.lastInjectedDriveFileId,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__injectSheetRow") {
    const body = await readBody(req);
    let parsed: { values?: ReadonlyArray<unknown> };
    try {
      parsed = JSON.parse(body) as { values?: ReadonlyArray<unknown> };
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    if (!Array.isArray(parsed.values)) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing values array");
      return;
    }
    const row = parsed.values;
    state.currentSheetsRows = [...state.currentSheetsRows, row];
    state.lastInjectedSheetsRow = row;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        rowCount: state.currentSheetsRows.length,
        rowIndex: state.currentSheetsRows.length, // 1-indexed spreadsheet row
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__replayLastSheetRow") {
    if (!state.lastInjectedSheetsRow) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("no sheet row to replay");
      return;
    }
    // Re-append the same values, bumping rowCount by one. Note: Sheets'
    // dedup naturally happens at V2's row-count baseline (lastRowCount in
    // trigger_resources.config), NOT at the dispatcher's
    // webhook_event_dedup table. Re-appending here causes pull to emit a
    // NEW event with a NEW rowIndex (different eventId). The Sheets spec
    // doesn't actually use this knob — it tests dedup the simpler way
    // (POST same webhook twice; pull's row-count baseline returns zero
    // events on the second pull). The knob exists for symmetry with
    // Drive/Calendar specs.
    state.currentSheetsRows = [
      ...state.currentSheetsRows,
      state.lastInjectedSheetsRow,
    ];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        rowCount: state.currentSheetsRows.length,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__replayLastEmail") {
    if (!state.lastInjectedMessageId) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("no email to replay");
      return;
    }
    const email = state.emails.get(state.lastInjectedMessageId);
    if (!email) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("last injected email not found in store");
      return;
    }
    // Re-queue at the original historyId — does NOT bump currentHistoryId.
    // This simulates "the stored cursor was rolled back; the same message
    // surfaces in history.list again". Dedup must catch it via
    // webhook_event_dedup keyed on the gmail message id.
    state.pendingHistoryEntries.push({
      historyId: email.historyIdAtInsert,
      messageId: email.id,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, replayedMessageId: email.id }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/__reset") {
    Object.assign(state, freshState());
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/__inspect") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        calls: state.calls,
        currentHistoryId: state.currentHistoryId,
        emailCount: state.emails.size,
        pendingHistoryEntries: state.pendingHistoryEntries,
        pendingLabelChanges: state.pendingLabelChanges,
        lastInjectedMessageId: state.lastInjectedMessageId,
        currentCalendarSyncToken: state.currentCalendarSyncToken,
        pendingCalendarEvents: state.pendingCalendarEvents,
        calendarEventCount: state.calendarEvents.size,
        lastInjectedCalendarEventId: state.lastInjectedCalendarEventId,
        currentDrivePageToken: state.currentDrivePageToken,
        pendingDriveChanges: state.pendingDriveChanges,
        driveChangeCount: state.driveChanges.size,
        lastInjectedDriveFileId: state.lastInjectedDriveFileId,
        currentSheetsRows: state.currentSheetsRows,
        currentSheetsRowCount: state.currentSheetsRows.length,
        lastInjectedSheetsRow: state.lastInjectedSheetsRow,
      }),
    );
    return;
  }

  // Anything else is unexpected — fail loud so the test surfaces it.
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-google: no route for ${req.method} ${url.pathname}`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeBigInt(v: string): bigint | null {
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

function base64UrlDecodeToString(s: string): string {
  // base64url → base64. Length-pad with '=' so Buffer.from accepts it.
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const padLen = pad === 0 ? 0 : 4 - pad;
  return Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf8");
}

function parseRfc5322(text: string): ParsedRfc5322 {
  // Split headers / body on the first blank line. RFC says CRLF; tolerate
  // bare LF too (some senders emit that, including our own send action).
  const headerEnd = text.search(/\r?\n\r?\n/);
  const headerBlock = headerEnd >= 0 ? text.slice(0, headerEnd) : text;
  const bodyBlock = headerEnd >= 0 ? text.slice(headerEnd).replace(/^\r?\n\r?\n/, "") : "";

  const headers = parseHeaders(headerBlock);
  const mimeType = (headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const partsByMimeType: Record<string, string> = {};

  // Multipart parsing — extract boundary and split. We don't need a full
  // RFC-compliant parser; the spec only asserts the plain-text leaf is
  // present. For multipart/alternative the structure is:
  //   --boundary
  //   Content-Type: text/plain; charset=...
  //   <blank line>
  //   <body>
  //   --boundary
  //   Content-Type: text/html; charset=...
  //   <blank line>
  //   <body>
  //   --boundary--
  if (mimeType.startsWith("multipart/")) {
    const ctRaw = headers["content-type"] ?? "";
    const m = ctRaw.match(/boundary="?([^";]+)"?/i);
    if (m) {
      const boundary = `--${m[1]}`;
      const segments = bodyBlock.split(boundary);
      for (const seg of segments) {
        const trimmed = seg.replace(/^\r?\n/, "").replace(/\r?\n--\s*$/, "");
        if (!trimmed.trim() || trimmed.startsWith("--")) continue;
        const partHeaderEnd = trimmed.search(/\r?\n\r?\n/);
        if (partHeaderEnd < 0) continue;
        const partHeaders = parseHeaders(trimmed.slice(0, partHeaderEnd));
        const partBody = trimmed.slice(partHeaderEnd).replace(/^\r?\n\r?\n/, "");
        const partMime = (partHeaders["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
        if (partMime) {
          // Strip trailing CRLF that's part of the multipart boundary
          // delimiter rather than the body itself.
          partsByMimeType[partMime] = partBody.replace(/\r?\n$/, "");
        }
      }
    }
  } else if (mimeType) {
    partsByMimeType[mimeType] = bodyBlock;
  }

  return { headers, mimeType, partsByMimeType };
}

function parseHeaders(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Unfold continuation lines (RFC 5322 §2.2.3): a line beginning with
  // whitespace is part of the previous header.
  const unfolded = block.replace(/\r?\n[\t ]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    out[name] = value;
  }
  return out;
}
