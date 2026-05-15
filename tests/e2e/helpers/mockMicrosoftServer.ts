import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";

/**
 * Standalone mock Microsoft (Azure AD + Graph) server for the Slice 6
 * Outlook mail / Slice 7 Outlook Calendar / Slice 8 OneDrive
 * walkthroughs.
 *
 * Routes (sized to V2's actual call patterns — Outlook mail + Slice 7
 * Outlook Calendar + Slice 8 OneDrive):
 *   GET  /common/oauth2/v2.0/authorize    → 302 to redirect_uri with state
 *                                           + synthetic code. Honors
 *                                           redirect_uri so Slice 7+
 *                                           providers (Calendar / OneDrive)
 *                                           can share this route.
 *   POST /common/oauth2/v2.0/token        → access + refresh token; scope
 *                                           in response echoes the most
 *                                           recent authorize scope. Same
 *                                           route for both authorization_code
 *                                           and refresh_token grants
 *                                           (parsedBody.grant_type
 *                                           distinguishes for the spec).
 *   GET  /v1.0/me?$select=mail,...,id     → Graph /me — email + UPN + id.
 *                                           Used by oauth.ts handleCallback.
 *   POST /v1.0/me/sendMail                → 202 No body. Records request.
 *   GET  /v1.0/me/messages/{id}           → Returns injected message by id.
 *   POST /v1.0/me/events                  → Slice 7. Records body, returns
 *                                           a synthetic Graph event id.
 *   GET  /v1.0/me/events/{id}             → Slice 7. Returns injected
 *                                           event by id. 404 when the
 *                                           event was never injected (or
 *                                           was deleted via control plane).
 *   GET  /v1.0/me/drive/items/{id}        → Slice 8. Returns injected
 *                                           DriveItem by id. 404 when the
 *                                           item was never injected.
 *   GET  /v1.0/me/drive/root/delta        → Slice 8. Used by the
 *                                           file_changed activate hook to
 *                                           capture a baseline cursor +
 *                                           by the delta-fallback receive
 *                                           branch. Honors `$top=1` (the
 *                                           wrapper's baseline mode) and
 *                                           `?token=…` (incremental).
 *                                           Always terminal — returns
 *                                           `@odata.deltaLink` immediately
 *                                           with no items in baseline mode.
 *   POST /v1.0/me/drive/root/children     → Slice 8. Records body, echoes
 *                                           a synthetic folder DriveItem.
 *                                           Used by the create_folder
 *                                           action when parentItemId is
 *                                           omitted / "root".
 *   POST /v1.0/subscriptions              → SYNCHRONOUSLY validates by
 *                                           POSTing ?validationToken=...
 *                                           to the notificationUrl, then
 *                                           returns the subscription
 *                                           record. If validation fails,
 *                                           returns 400. Resource-agnostic
 *                                           — Slice 6/7/8 share this path.
 *   PATCH /v1.0/subscriptions/{id}        → Updates expirationDateTime.
 *   DELETE /v1.0/subscriptions/{id}       → 204 No Content.
 *
 * Control plane (test-only):
 *   POST /__injectMessage  — inject a Graph message resource into the
 *                            mock store. Body: full GraphMessage shape.
 *                            The next /me/messages/{id} call returns it.
 *   POST /__injectEvent    — Slice 7. Inject a Graph event resource.
 *                            Body: full GraphEvent shape. The next
 *                            /me/events/{id} call returns it.
 *   POST /__injectDriveItem — Slice 8. Inject a Graph DriveItem resource.
 *                            Body: full DriveItem shape. The next
 *                            /me/drive/items/{id} call returns it.
 *   POST /__sendNotification
 *                          — POST a Graph notification envelope to the
 *                            REGISTERED notificationUrl of the most
 *                            recently created subscription. Body shape:
 *                              { messageId: string } — mail (default,
 *                                back-compat with Slice 6).
 *                              { eventId: string, kind?: "event",
 *                                changeType?: "created"|"updated"|
 *                                "deleted" } — Slice 7. The mock derives
 *                                resource path + @odata.type for events.
 *                              { itemId: string, kind?: "driveItem",
 *                                changeType?: "updated" } — Slice 8.
 *                                Mock derives resource path +
 *                                #Microsoft.Graph.DriveItem @odata.type.
 *                            Returns { status, body } from V2's webhook
 *                            route.
 *   POST /__reset          — clear all state.
 *   GET  /__inspect        — dump calls + store; cross-process seam.
 *
 * Listens on a fixed port (default 9878, override via MICROSOFT_MOCK_PORT).
 * Different port from Slack (9876) and Google (9877) so all three can run
 * simultaneously. If the port is busy, fail loud at start.
 */

export interface RecordedAuthorize {
  state: string;
  scope: string;
  codeChallenge: string | null;
  redirectUri: string | null;
  responseMode: string | null;
}

export interface RecordedTokenExchange {
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedMe {
  authorization: string | undefined;
  url: string;
}

export interface RecordedSendMail {
  authorization: string | undefined;
  body: Record<string, unknown>;
}

export interface RecordedGetMessage {
  authorization: string | undefined;
  url: string;
  messageId: string;
}

/**
 * Outlook Mail 2.1 Commit 3: reply / replyAll hit log. `endpoint`
 * captures which Graph URL was hit so the spec can assert the handler's
 * Q11 replyAll boolean drove the right path selection.
 */
export interface RecordedReplyMessage {
  authorization: string | undefined;
  messageId: string;
  endpoint: "reply" | "replyAll";
  body: Record<string, unknown>;
}

/** Outlook Mail 2.1 Commit 3: forward hit log. */
export interface RecordedForwardMessage {
  authorization: string | undefined;
  messageId: string;
  body: Record<string, unknown>;
}

/**
 * Outlook Mail 2.1 Commit 3: create-draft hit log. Records the message
 * body so the spec can assert recipient parsing + Q11 importance/isHtml
 * round-tripped through the handler; `responseDraftId` is the synthetic
 * id the mock returned so the spec can correlate against the workflow's
 * action output.
 */
export interface RecordedCreateDraft {
  authorization: string | undefined;
  body: Record<string, unknown>;
  responseDraftId: string;
}

export interface RecordedSubscriptionsCreate {
  authorization: string | undefined;
  body: Record<string, unknown>;
  responseSubscriptionId: string;
  validationStatus: number | null;
  validationEchoMatched: boolean;
}

export interface RecordedSubscriptionsRenew {
  authorization: string | undefined;
  subscriptionId: string;
  body: Record<string, unknown>;
}

export interface RecordedSubscriptionsDelete {
  authorization: string | undefined;
  subscriptionId: string;
}

/**
 * Slice 7: Outlook Calendar create_event records body + auth header so
 * the spec can assert the action handler decrypted the access token and
 * forwarded the workflow's resolved config.
 */
export interface RecordedEventsCreate {
  authorization: string | undefined;
  body: Record<string, unknown>;
  responseEventId: string;
}

/** Slice 7: Outlook Calendar eventsGet hit log. */
export interface RecordedEventsGet {
  authorization: string | undefined;
  url: string;
  eventId: string;
}

/** Slice 8: OneDrive driveItemsGet hit log (id-fetch receive branch + get_file action). */
export interface RecordedDriveItemsGet {
  authorization: string | undefined;
  url: string;
  itemId: string;
}

/**
 * Slice 8: OneDrive driveRootDelta hit log. `mode` distinguishes the
 * activate hook's baseline walk from the receive path's delta-fallback
 * incremental call so the spec can assert each branch independently.
 */
export interface RecordedDriveRootDelta {
  authorization: string | undefined;
  url: string;
  mode: "baseline" | "incremental";
}

/**
 * Slice 8: OneDrive create_folder action records body + auth header so
 * the spec can assert the action handler decrypted the access token and
 * forwarded the workflow's resolved config.
 */
export interface RecordedDriveRootChildrenCreate {
  authorization: string | undefined;
  body: Record<string, unknown>;
  responseItemId: string;
}

/**
 * Slice 15: Excel worksheet usedRange GET hit log. Captures the workbook
 * + worksheet so the spec can assert per-tick poll behavior + action
 * pre-write tail calculation independently.
 */
export interface RecordedWorksheetUsedRange {
  authorization: string | undefined;
  url: string;
  workbookId: string;
  worksheetName: string;
}

/**
 * Slice 15: Excel worksheet range PATCH hit log. Records the resolved
 * A1 address + values body so the spec can verify add_row's column
 * alignment + tail-row math.
 */
export interface RecordedWorksheetRangePatch {
  authorization: string | undefined;
  workbookId: string;
  worksheetName: string;
  address: string;
  values: ReadonlyArray<ReadonlyArray<unknown>>;
}

/**
 * Slice 15: tracked worksheet state in the mock. Workbook → worksheet
 * name → 2D values array. The mock's __injectExcelWorksheet sets a
 * baseline; __appendExcelRow pushes one row onto the end (simulates a
 * user editing the workbook between activation and poll). The
 * usedRange route reads this; the range PATCH route writes back.
 */
export interface ExcelWorksheetState {
  values: unknown[][];
}

/**
 * Excel parity Commit 5: range-delete hit log. POST to
 * `/range(address='...')/delete` for `delete_row`. Records the shift
 * direction so the spec can verify the handler issued "Up".
 */
export interface RecordedWorksheetRangeDelete {
  authorization: string | undefined;
  workbookId: string;
  worksheetName: string;
  address: string;
  shift: string;
}

/**
 * Excel parity Commit 5: worksheet PATCH hit log. PATCH to
 * `/workbook/worksheets('{name}')` for `rename_worksheet`. Records the
 * new name body so the spec can verify the resolved config flowed
 * through refreshAndRetry.
 */
export interface RecordedWorksheetPatch {
  authorization: string | undefined;
  workbookId: string;
  worksheetName: string;
  newName: string;
}

/**
 * Excel parity Commit 5: worksheet DELETE hit log. DELETE to
 * `/workbook/worksheets('{name}')` for `delete_worksheet`.
 */
export interface RecordedWorksheetDelete {
  authorization: string | undefined;
  workbookId: string;
  worksheetName: string;
}

/**
 * Excel parity Commit 5: table rows GET hit log. GET to
 * `/workbook/tables/{tableName}/rows` for the `new_table_row` and
 * `updated_table_row` polling triggers.
 */
export interface RecordedTableRowsList {
  authorization: string | undefined;
  url: string;
  workbookId: string;
  tableName: string;
}

/**
 * Excel parity Commit 5: table row state. Workbook → table name →
 * ordered list of `{index, values}` records. `index` is Graph's stable
 * row index (zero-based) and stays pinned across mid-table mutations.
 * Used by `__injectExcelTable` + `__updateExcelTableRow` control plane
 * endpoints to drive `new_table_row` / `updated_table_row` e2e
 * scenarios.
 */
export interface ExcelTableRowState {
  index: number;
  values: unknown[];
}

/**
 * Slice 16: Teams channel-message send POST hit log. Records the
 * (teamId, channelId) plus body so the spec can assert action calls
 * decrypted the access token + forwarded the resolved config.
 */
export interface RecordedTeamsChannelMessageSend {
  authorization: string | undefined;
  teamId: string;
  channelId: string;
  body: Record<string, unknown>;
  responseMessageId: string;
}

/**
 * Slice 16: Teams channel-message GET (id-fetch hydration on the
 * receive path).
 */
export interface RecordedTeamsChannelMessageGet {
  authorization: string | undefined;
  url: string;
  teamId: string;
  channelId: string;
  messageId: string;
}

/**
 * Slice 16: injected Teams chatMessage resource. The mock's
 * __injectTeamsMessage seeds these; the
 * `/v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}` GET
 * route returns the stored resource (404 when absent).
 */
export interface InjectedTeamsMessage {
  id: string;
  teamId: string;
  channelId: string;
  resource: Record<string, unknown>;
}

export interface InjectedMessage {
  id: string;
  resource: Record<string, unknown>;
}

/** Slice 7: injected calendar event resource. */
export interface InjectedEvent {
  id: string;
  resource: Record<string, unknown>;
}

/** Slice 8: injected OneDrive DriveItem resource. */
export interface InjectedDriveItem {
  id: string;
  resource: Record<string, unknown>;
}

export interface RegisteredSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  lifecycleNotificationUrl: string | null;
  expirationDateTime: string;
  clientState: string;
}

export interface MockMicrosoftHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    me: RecordedMe[];
    sendMail: RecordedSendMail[];
    getMessage: RecordedGetMessage[];
    replyMessage: RecordedReplyMessage[];
    forwardMessage: RecordedForwardMessage[];
    createDraft: RecordedCreateDraft[];
    eventsCreate: RecordedEventsCreate[];
    eventsGet: RecordedEventsGet[];
    driveItemsGet: RecordedDriveItemsGet[];
    driveRootDelta: RecordedDriveRootDelta[];
    driveRootChildrenCreate: RecordedDriveRootChildrenCreate[];
    excelUsedRange: RecordedWorksheetUsedRange[];
    excelRangePatch: RecordedWorksheetRangePatch[];
    excelRangeDelete: RecordedWorksheetRangeDelete[];
    excelWorksheetPatch: RecordedWorksheetPatch[];
    excelWorksheetDelete: RecordedWorksheetDelete[];
    excelTableRowsList: RecordedTableRowsList[];
    teamsChannelMessageSend: RecordedTeamsChannelMessageSend[];
    teamsChannelMessageGet: RecordedTeamsChannelMessageGet[];
    subscriptionsCreate: RecordedSubscriptionsCreate[];
    subscriptionsRenew: RecordedSubscriptionsRenew[];
    subscriptionsDelete: RecordedSubscriptionsDelete[];
  };
  messages: Map<string, InjectedMessage>;
  events: Map<string, InjectedEvent>;
  driveItems: Map<string, InjectedDriveItem>;
  teamsMessages: Map<string, InjectedTeamsMessage>;
  subscriptions: Map<string, RegisteredSubscription>;
  /**
   * Slice 15: workbook id → worksheet name → state. Outer keys are the
   * driveItem id of the workbook; inner keys are the worksheet name
   * passed by the polling trigger / action handler.
   */
  excelWorksheets: Map<string, Map<string, ExcelWorksheetState>>;
  /**
   * Excel parity Commit 5: workbook id → table name → ordered table
   * rows. Drives `new_table_row` + `updated_table_row` polling tests.
   * Empty inner map means "table exists but has no rows" — distinct
   * from "table not found" which means the outer key is absent.
   */
  excelTables: Map<string, Map<string, ExcelTableRowState[]>>;
  lastAuthorizeScope: string | null;
  lastSubscriptionId: string | null;
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.MICROSOFT_MOCK_PORT ?? "9878");

/** Microsoft /me/messages subscription max — 4230 minutes. */
const MAX_EXPIRATION_MINUTES = 4230;

interface MutableState {
  calls: MockMicrosoftHandle["calls"];
  messages: Map<string, InjectedMessage>;
  events: Map<string, InjectedEvent>;
  driveItems: Map<string, InjectedDriveItem>;
  teamsMessages: Map<string, InjectedTeamsMessage>;
  subscriptions: Map<string, RegisteredSubscription>;
  excelWorksheets: Map<string, Map<string, ExcelWorksheetState>>;
  excelTables: Map<string, Map<string, ExcelTableRowState[]>>;
  lastAuthorizeScope: string | null;
  lastSubscriptionId: string | null;
  subscriptionCounter: number;
  eventCounter: number;
  /**
   * Slice 16: monotonic counter so each POST to a channel-messages
   * endpoint returns a stable, distinct message id (`mock-teams-msg-N`).
   */
  teamsMessageCounter: number;
  /**
   * Slice 8: monotonic counter so __sendNotification → driveItemsGet
   * → normalize produces a stable but per-run-unique deltaLink and
   * folder DriveItem id. Same pattern as eventCounter / subscriptionCounter.
   */
  driveItemCounter: number;
  /**
   * Outlook Mail 2.1 Commit 3: monotonic counter for draft ids returned
   * by POST /v1.0/me/messages so each draft creation in a single test
   * gets a distinct response id. Reset on /__reset.
   */
  draftMessageCounter: number;
  /**
   * Slice 8: monotonic counter for the synthetic delta cursors the
   * mock returns from /me/drive/root/delta. Both initial baseline +
   * incremental responses bump this. Persisted-cursor uniqueness
   * matters because the file_changed pull persists the new deltaLink
   * and a stale value would replay the wrong delta on the next call.
   */
  driveDeltaCursor: number;
  /**
   * Slice 8: port the mock server is listening on. Threaded into state
   * so the delta endpoint can build a self-pointing deltaLink (real
   * Graph deltaLinks are absolute URLs; the wrapper passes them
   * verbatim back to fetch). Set by startMockMicrosoftServer().
   */
  serverPort: number;
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      me: [],
      sendMail: [],
      getMessage: [],
      replyMessage: [],
      forwardMessage: [],
      createDraft: [],
      eventsCreate: [],
      eventsGet: [],
      driveItemsGet: [],
      driveRootDelta: [],
      driveRootChildrenCreate: [],
      excelUsedRange: [],
      excelRangePatch: [],
      excelRangeDelete: [],
      excelWorksheetPatch: [],
      excelWorksheetDelete: [],
      excelTableRowsList: [],
      teamsChannelMessageSend: [],
      teamsChannelMessageGet: [],
      subscriptionsCreate: [],
      subscriptionsRenew: [],
      subscriptionsDelete: [],
    },
    messages: new Map(),
    events: new Map(),
    driveItems: new Map(),
    teamsMessages: new Map(),
    subscriptions: new Map(),
    excelWorksheets: new Map(),
    excelTables: new Map(),
    lastAuthorizeScope: null,
    lastSubscriptionId: null,
    subscriptionCounter: 0,
    eventCounter: 0,
    teamsMessageCounter: 0,
    driveItemCounter: 0,
    draftMessageCounter: 0,
    driveDeltaCursor: 0,
    // Set by startMockMicrosoftServer() once the listener has bound.
    serverPort: 0,
  };
}

export async function startMockMicrosoftServer(opts: {
  appBaseUrl: string;
  port?: number;
}): Promise<MockMicrosoftHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();
  state.serverPort = port;

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, state).catch((err) => {
      console.error("[mock-microsoft] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-microsoft handler crashed");
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
    get messages() {
      return state.messages;
    },
    get events() {
      return state.events;
    },
    get driveItems() {
      return state.driveItems;
    },
    get subscriptions() {
      return state.subscriptions;
    },
    get teamsMessages() {
      return state.teamsMessages;
    },
    get excelWorksheets() {
      return state.excelWorksheets;
    },
    get excelTables() {
      return state.excelTables;
    },
    get lastAuthorizeScope() {
      return state.lastAuthorizeScope;
    },
    get lastSubscriptionId() {
      return state.lastSubscriptionId;
    },
    reset: () => {
      // Preserve serverPort across reset — freshState() defaults it to 0
      // because the listener-bound port is only known once the server
      // has bound. Resetting to 0 would break the delta endpoint's
      // self-pointing URL construction.
      const preservedPort = state.serverPort;
      Object.assign(state, freshState());
      state.serverPort = preservedPort;
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
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
  if (
    req.method === "GET" &&
    url.pathname === "/common/oauth2/v2.0/authorize"
  ) {
    const stateParam = url.searchParams.get("state");
    const scope = url.searchParams.get("scope") ?? "";
    const codeChallenge = url.searchParams.get("code_challenge");
    const redirectUri = url.searchParams.get("redirect_uri");
    const responseMode = url.searchParams.get("response_mode");
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
      responseMode,
    });
    state.lastAuthorizeScope = scope;
    const callback = redirectUri
      ? new URL(redirectUri)
      : new URL(
          "/api/integrations/oauth/microsoft-outlook/callback",
          appBaseUrl,
        );
    callback.searchParams.set("code", `mock-ms-code-${Date.now()}`);
    callback.searchParams.set("state", stateParam);
    res.writeHead(302, { location: callback.toString() });
    res.end();
    return;
  }

  // ── Token exchange (also used for refresh_token grants) ──
  if (req.method === "POST" && url.pathname === "/common/oauth2/v2.0/token") {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const parsed: Record<string, string> = {};
    for (const [k, v] of params.entries()) parsed[k] = v;
    state.calls.tokenExchange.push({ body, parsedBody: parsed });
    const grantedScope =
      state.lastAuthorizeScope ?? "offline_access Mail.Send Mail.Read";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        access_token: "ms-mock-e2e-access",
        refresh_token: "ms-mock-e2e-refresh",
        expires_in: 3600,
        scope: grantedScope,
        token_type: "Bearer",
      }),
    );
    return;
  }

  // ── Graph /me ──
  // V2 calls /v1.0/me?$select=mail,userPrincipalName,id at OAuth callback time.
  if (req.method === "GET" && url.pathname === "/v1.0/me") {
    state.calls.me.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "ms-graph-uid-e2e",
        mail: "alice@e2e.test",
        userPrincipalName: "alice@e2e.test",
        displayName: "Alice E2E",
      }),
    );
    return;
  }

  // ── Outlook Mail 2.1 Commit 4: synthetic signed-URL file source ──
  //
  // Returns canned bytes for the attachment-flow e2e scenario. The
  // workflow's send_email action is configured with a `signed_url`
  // FileRef pointing at this endpoint; `fetchFileBytes` direct-fetches
  // it (no auth header), base64-encodes the bytes, and constructs the
  // Graph fileAttachment envelope. URL is keyed by the trailing
  // filename so a test can verify the bytes were retrieved by name.
  if (req.method === "GET" && url.pathname.startsWith("/__file/")) {
    const name = url.pathname.replace(/^\/__file\//, "");
    // Deterministic, non-empty content. Decoded length matters more
    // than the exact bytes — the e2e asserts `contentBytes.length > 0`.
    const bytes = Buffer.from(
      `mock-outlook-attachment:${name}:`.repeat(8),
      "utf8",
    );
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.length),
    });
    res.end(bytes);
    return;
  }

  // ── Graph /me/sendMail ──
  if (req.method === "POST" && url.pathname === "/v1.0/me/sendMail") {
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore — record empty body for inspection
    }
    state.calls.sendMail.push({
      authorization: req.headers.authorization,
      body: parsed,
    });
    res.writeHead(202);
    res.end();
    return;
  }

  // ── Outlook Mail 2.1: Graph /me/messages/{id}/reply or /replyAll ──
  //
  // Endpoint selection is the load-bearing assertion for the
  // reply_to_email action — Q11 `replyAll` boolean drives `/reply` vs
  // `/replyAll`. Both return 202 No Content like /me/sendMail.
  {
    const replyMatch = url.pathname.match(
      /^\/v1\.0\/me\/messages\/([^/]+)\/(reply|replyAll)$/,
    );
    if (req.method === "POST" && replyMatch) {
      const messageId = decodeURIComponent(replyMatch[1]!);
      const endpoint = replyMatch[2] as "reply" | "replyAll";
      const bodyText = await readBody(req);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        // ignore — record empty body for inspection
      }
      state.calls.replyMessage.push({
        authorization: req.headers.authorization,
        messageId,
        endpoint,
        body: parsed,
      });
      res.writeHead(202);
      res.end();
      return;
    }
  }

  // ── Outlook Mail 2.1: Graph /me/messages/{id}/forward ──
  {
    const forwardMatch = url.pathname.match(
      /^\/v1\.0\/me\/messages\/([^/]+)\/forward$/,
    );
    if (req.method === "POST" && forwardMatch) {
      const messageId = decodeURIComponent(forwardMatch[1]!);
      const bodyText = await readBody(req);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        // ignore — record empty body for inspection
      }
      state.calls.forwardMessage.push({
        authorization: req.headers.authorization,
        messageId,
        body: parsed,
      });
      res.writeHead(202);
      res.end();
      return;
    }
  }

  // ── Outlook Mail 2.1: Graph POST /me/messages (create draft) ──
  //
  // Unlike sendMail (202 No Content), this returns 201 Created with the
  // draft envelope including a synthetic id + webLink + createdDateTime.
  // The handler maps these onto the action's draftId / webLink /
  // createdAt outputs.
  if (req.method === "POST" && url.pathname === "/v1.0/me/messages") {
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore — record empty body for inspection
    }
    state.draftMessageCounter += 1;
    const draftId = `mock-draft-${state.draftMessageCounter}`;
    state.calls.createDraft.push({
      authorization: req.headers.authorization,
      body: parsed,
      responseDraftId: draftId,
    });
    const now = new Date().toISOString();
    const responseBody: Record<string, unknown> = {
      id: draftId,
      // Echo the relevant config fields back so spec assertions can
      // round-trip without needing to inject a stored resource.
      subject: parsed.subject ?? null,
      body: parsed.body ?? null,
      toRecipients: parsed.toRecipients ?? [],
      ccRecipients: parsed.ccRecipients ?? [],
      bccRecipients: parsed.bccRecipients ?? [],
      importance: parsed.importance ?? "normal",
      isDraft: true,
      webLink: `https://outlook.office.com/owa/?ItemID=${draftId}`,
      createdDateTime: now,
      lastModifiedDateTime: now,
    };
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify(responseBody));
    return;
  }

  // ── Graph /me/messages/{id} ──
  if (
    req.method === "GET" &&
    url.pathname.startsWith("/v1.0/me/messages/")
  ) {
    const messageId = decodeURIComponent(
      url.pathname.replace(/^\/v1\.0\/me\/messages\//, ""),
    );
    state.calls.getMessage.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      messageId,
    });
    const stored = state.messages.get(messageId);
    if (!stored) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "ErrorItemNotFound",
            message: "The specified object was not found.",
          },
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stored.resource));
    return;
  }

  // ── Slice 7: Graph /me/events (create) ──
  if (req.method === "POST" && url.pathname === "/v1.0/me/events") {
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore — record empty body for inspection
    }
    state.eventCounter += 1;
    const eventId = `mock-event-${state.eventCounter}`;
    state.calls.eventsCreate.push({
      authorization: req.headers.authorization,
      body: parsed,
      responseEventId: eventId,
    });
    // Echo a Graph event response. Graph echoes the input + adds id +
    // webLink + organizer + createdDateTime/lastModifiedDateTime.
    const echoed: Record<string, unknown> = {
      id: eventId,
      ...parsed,
      organizer: parsed.organizer ?? {
        emailAddress: { name: "Alice E2E", address: "alice@e2e.test" },
      },
      webLink: `https://outlook.office.com/calendar/?ItemID=${eventId}`,
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
    };
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify(echoed));
    return;
  }

  // ── Slice 7: Graph /me/events/{id} (get) ──
  if (
    req.method === "GET" &&
    url.pathname.startsWith("/v1.0/me/events/")
  ) {
    const eventId = decodeURIComponent(
      url.pathname.replace(/^\/v1\.0\/me\/events\//, ""),
    );
    state.calls.eventsGet.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      eventId,
    });
    const stored = state.events.get(eventId);
    if (!stored) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "ErrorItemNotFound",
            message: "The specified object was not found.",
          },
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stored.resource));
    return;
  }

  // ── Slice 8: Graph /me/drive/root/delta (baseline + incremental) ──
  // The wrapper hits /me/drive/root/delta?$top=1 for the activate hook's
  // baseline cursor walk; on incremental it hits the deltaLink we
  // returned previously (which we encode as ?token=…). Both modes
  // terminate with @odata.deltaLink — the mock never returns
  // @odata.nextLink (no pagination needed for the e2e). Baseline mode
  // returns no items; incremental returns the items we've buffered (the
  // e2e's id-fetch path doesn't exercise this so the array stays empty,
  // but the route is correct for delta-fallback).
  if (
    req.method === "GET" &&
    url.pathname === "/v1.0/me/drive/root/delta"
  ) {
    const incrementalToken = url.searchParams.get("token");
    const isIncremental = Boolean(incrementalToken);
    state.calls.driveRootDelta.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      mode: isIncremental ? "incremental" : "baseline",
    });
    state.driveDeltaCursor += 1;
    const newCursor = `delta-cursor-${state.driveDeltaCursor}`;
    const deltaLink = new URL(
      "/v1.0/me/drive/root/delta",
      `http://127.0.0.1:${state.serverPort}`,
    );
    deltaLink.searchParams.set("token", newCursor);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        // No items on either branch in the e2e — the spec exercises the
        // id-fetch receive path; delta-fallback would return drive items
        // here in a future test.
        value: [],
        "@odata.deltaLink": deltaLink.toString(),
      }),
    );
    return;
  }

  // ── Slice 8: Graph /me/drive/items/{id} (get) ──
  // Match the exact `/items/{id}` shape only — any further path segment
  // (e.g. `/items/{id}/children`, `/items/{id}/copy`) belongs to a
  // different Graph endpoint that Slice 8's e2e doesn't exercise.
  // Without the no-slash guard, a future moveItem/copyItem/listItems
  // call would accidentally route here and 404 with a confusing message.
  if (
    req.method === "GET" &&
    url.pathname.startsWith("/v1.0/me/drive/items/") &&
    !url.pathname.slice("/v1.0/me/drive/items/".length).includes("/")
  ) {
    const itemId = decodeURIComponent(
      url.pathname.replace(/^\/v1\.0\/me\/drive\/items\//, ""),
    );
    state.calls.driveItemsGet.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      itemId,
    });
    const stored = state.driveItems.get(itemId);
    if (!stored) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "itemNotFound",
            message: "The resource could not be found.",
          },
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stored.resource));
    return;
  }

  // ── Slice 8: Graph /me/drive/root/children (POST — create folder at root) ──
  // Slice 8's create_folder action with parentItemId omitted / "root"
  // routes here (driveItemsCreateFolder.ts:50-52). The mock echoes a
  // folder DriveItem so the action handler can read result.id, name,
  // webUrl, parentReference, folder.childCount, createdDateTime,
  // lastModifiedDateTime. Records body so the spec asserts the
  // conflictBehavior=fail invariant (Slice 8 Q11) and the resolved name
  // forwarded from the workflow's hardcoded config.
  if (
    req.method === "POST" &&
    url.pathname === "/v1.0/me/drive/root/children"
  ) {
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore — record empty body for inspection
    }
    state.driveItemCounter += 1;
    const itemId = `mock-driveitem-${state.driveItemCounter}`;
    state.calls.driveRootChildrenCreate.push({
      authorization: req.headers.authorization,
      body: parsed,
      responseItemId: itemId,
    });
    // Echo a Graph folder DriveItem response. The action handler reads
    // id (required), name, webUrl, parentReference, folder.childCount,
    // createdDateTime, lastModifiedDateTime.
    const echoed = {
      id: itemId,
      name: parsed.name ?? "Untitled",
      folder: { childCount: 0 },
      webUrl: `https://onedrive.live.com/?id=${itemId}`,
      parentReference: {
        driveId: "mock-drive-id",
        driveType: "personal",
        id: "root",
        path: "/drive/root:",
      },
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
    };
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify(echoed));
    return;
  }

  // ── Slice 15: Excel workbook worksheets GET (list) ──
  // Matches /v1.0/me/drive/items/{wb}/workbook/worksheets exactly (no
  // sub-path) so it doesn't shadow the usedRange / range routes below.
  const worksheetsListMatch = url.pathname.match(
    /^\/v1\.0\/me\/drive\/items\/([^/]+)\/workbook\/worksheets$/,
  );
  if (req.method === "GET" && worksheetsListMatch) {
    const workbookId = decodeURIComponent(worksheetsListMatch[1]!);
    const wb = state.excelWorksheets.get(workbookId);
    const names = wb ? Array.from(wb.keys()) : [];
    const out = names.map((name, i) => ({
      id: `ws-${workbookId}-${i}`,
      name,
      position: i,
      visibility: "Visible",
    }));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ value: out }));
    return;
  }

  // ── Slice 15: Excel worksheet usedRange GET ──
  // Matches /v1.0/me/drive/items/{wb}/workbook/worksheets('{name}')/usedRange...
  // The worksheet name is encoded inside single quotes; the route's
  // suffix may include `(valuesOnly=true)` which the wrapper appends.
  const usedRangeMatch = url.pathname.match(
    /^\/v1\.0\/me\/drive\/items\/([^/]+)\/workbook\/worksheets\('([^']+)'\)\/usedRange/,
  );
  if (req.method === "GET" && usedRangeMatch) {
    const workbookId = decodeURIComponent(usedRangeMatch[1]!);
    const worksheetName = decodeURIComponent(usedRangeMatch[2]!);
    state.calls.excelUsedRange.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      workbookId,
      worksheetName,
    });
    const wb = state.excelWorksheets.get(workbookId);
    const sheet = wb?.get(worksheetName);
    // Graph's usedRange for an empty worksheet returns a 1×1 range with
    // a single null cell. Mirror that so the activate hook + add_row
    // "empty-sheet" heuristics exercise the same envelope they would
    // see in production.
    if (!sheet || sheet.values.length === 0) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          address: `${worksheetName}!A1`,
          rowCount: 1,
          columnCount: 1,
          values: [[null]],
        }),
      );
      return;
    }
    const rowCount = sheet.values.length;
    const columnCount =
      sheet.values[0]?.length ?? 0;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        address: `${worksheetName}!A1:${columnLetter(columnCount)}${rowCount}`,
        rowCount,
        columnCount,
        values: sheet.values,
      }),
    );
    return;
  }

  // ── Slice 15: Excel worksheet range PATCH (write row values) ──
  // Matches /v1.0/me/drive/items/{wb}/workbook/worksheets('{name}')/range(address='...')
  const rangePatchMatch = url.pathname.match(
    /^\/v1\.0\/me\/drive\/items\/([^/]+)\/workbook\/worksheets\('([^']+)'\)\/range\(address='([^']+)'\)$/,
  );
  if (req.method === "PATCH" && rangePatchMatch) {
    const workbookId = decodeURIComponent(rangePatchMatch[1]!);
    const worksheetName = decodeURIComponent(rangePatchMatch[2]!);
    const address = decodeURIComponent(rangePatchMatch[3]!);
    const bodyText = await readBody(req);
    let parsed: { values?: unknown[][] } = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore — recorded as empty
    }
    const values = (parsed.values ?? []) as unknown[][];
    state.calls.excelRangePatch.push({
      authorization: req.headers.authorization,
      workbookId,
      worksheetName,
      address,
      values,
    });
    // Persist into the worksheet store so a subsequent usedRange GET
    // observes the new tail row.
    let wb = state.excelWorksheets.get(workbookId);
    if (!wb) {
      wb = new Map();
      state.excelWorksheets.set(workbookId, wb);
    }
    let sheet = wb.get(worksheetName);
    if (!sheet) {
      sheet = { values: [] };
      wb.set(worksheetName, sheet);
    }
    // Decode the target row from the address (A1:Cn → row n).
    const rowMatch = address.match(/[A-Z]+(\d+):/);
    const targetRow = rowMatch ? Number(rowMatch[1]) : sheet.values.length + 1;
    while (sheet.values.length < targetRow) sheet.values.push([]);
    sheet.values[targetRow - 1] = values[0] ?? [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        address,
        rowCount: values.length,
        columnCount: values[0]?.length ?? 0,
        values,
      }),
    );
    return;
  }

  // ── Excel parity Commit 5: range delete endpoint (delete_row) ──
  // Matches /v1.0/me/drive/items/{wb}/workbook/worksheets('{name}')/range(address='{addr}')/delete
  // Body shape `{ shift: "Up" | "Left" }`. The delete_row handler always
  // sends shift="Up" and an address of the form "{N}:{N}".
  const rangeDeleteMatch = url.pathname.match(
    /^\/v1\.0\/me\/drive\/items\/([^/]+)\/workbook\/worksheets\('([^']+)'\)\/range\(address='([^']+)'\)\/delete$/,
  );
  if (req.method === "POST" && rangeDeleteMatch) {
    const workbookId = decodeURIComponent(rangeDeleteMatch[1]!);
    const worksheetName = decodeURIComponent(rangeDeleteMatch[2]!);
    const address = decodeURIComponent(rangeDeleteMatch[3]!);
    const bodyText = await readBody(req);
    let parsed: { shift?: string } = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // record empty body if invalid
    }
    state.calls.excelRangeDelete.push({
      authorization: req.headers.authorization,
      workbookId,
      worksheetName,
      address,
      shift: parsed.shift ?? "",
    });
    // Apply the deletion to the in-memory worksheet so a subsequent
    // usedRange GET reflects the new state. Address form "{N}:{N}" =
    // delete the 1-based row N.
    const rowMatch = address.match(/^(\d+):(\d+)$/);
    if (rowMatch && parsed.shift === "Up") {
      const startRow = Number(rowMatch[1]);
      const endRow = Number(rowMatch[2]);
      const wb = state.excelWorksheets.get(workbookId);
      const sheet = wb?.get(worksheetName);
      if (sheet && startRow === endRow) {
        sheet.values.splice(startRow - 1, 1);
      }
    }
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Excel parity Commit 5: worksheet PATCH endpoint (rename_worksheet) ──
  // Matches /v1.0/me/drive/items/{wb}/workbook/worksheets('{name}')
  // exactly (no sub-path). Renames the worksheet in place, preserving
  // its position in the workbook so id stays stable across calls.
  const worksheetPatchMatch = url.pathname.match(
    /^\/v1\.0\/me\/drive\/items\/([^/]+)\/workbook\/worksheets\('([^']+)'\)$/,
  );
  if (req.method === "PATCH" && worksheetPatchMatch) {
    const workbookId = decodeURIComponent(worksheetPatchMatch[1]!);
    const worksheetName = decodeURIComponent(worksheetPatchMatch[2]!);
    const bodyText = await readBody(req);
    let parsed: { name?: string } = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // record empty body if invalid
    }
    const newName = parsed.name ?? "";
    state.calls.excelWorksheetPatch.push({
      authorization: req.headers.authorization,
      workbookId,
      worksheetName,
      newName,
    });
    const wb = state.excelWorksheets.get(workbookId);
    if (!wb || !wb.has(worksheetName)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "ItemNotFound",
            message: `worksheet '${worksheetName}' not found`,
          },
        }),
      );
      return;
    }
    // Rebuild the map preserving insertion order so the renamed
    // worksheet keeps the same position (and same derived id).
    const ordered: Array<[string, ExcelWorksheetState]> = [];
    let position = 0;
    let resolvedPosition = 0;
    for (const [name, sheet] of wb) {
      if (name === worksheetName) {
        ordered.push([newName, sheet]);
        resolvedPosition = position;
      } else {
        ordered.push([name, sheet]);
      }
      position++;
    }
    wb.clear();
    for (const [k, v] of ordered) wb.set(k, v);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: `ws-${workbookId}-${resolvedPosition}`,
        name: newName,
        position: resolvedPosition,
        visibility: "Visible",
      }),
    );
    return;
  }

  // ── Excel parity Commit 5: worksheet DELETE endpoint (delete_worksheet) ──
  // Matches /v1.0/me/drive/items/{wb}/workbook/worksheets('{name}') with
  // method DELETE. Mirrors Graph's 204-no-body success contract.
  if (req.method === "DELETE" && worksheetPatchMatch) {
    const workbookId = decodeURIComponent(worksheetPatchMatch[1]!);
    const worksheetName = decodeURIComponent(worksheetPatchMatch[2]!);
    state.calls.excelWorksheetDelete.push({
      authorization: req.headers.authorization,
      workbookId,
      worksheetName,
    });
    const wb = state.excelWorksheets.get(workbookId);
    if (!wb || !wb.has(worksheetName)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "ItemNotFound",
            message: `worksheet '${worksheetName}' not found`,
          },
        }),
      );
      return;
    }
    wb.delete(worksheetName);
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Excel parity Commit 5: table rows GET endpoint ──
  // Matches /v1.0/me/drive/items/{wb}/workbook/tables/{tableName}/rows
  // for the new_table_row + updated_table_row polling triggers.
  // Returns Graph's stable `index` per row.
  const tableRowsMatch = url.pathname.match(
    /^\/v1\.0\/me\/drive\/items\/([^/]+)\/workbook\/tables\/([^/]+)\/rows$/,
  );
  if (req.method === "GET" && tableRowsMatch) {
    const workbookId = decodeURIComponent(tableRowsMatch[1]!);
    const tableName = decodeURIComponent(tableRowsMatch[2]!);
    state.calls.excelTableRowsList.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      workbookId,
      tableName,
    });
    const wb = state.excelTables.get(workbookId);
    const rows = wb?.get(tableName) ?? [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        value: rows.map((r) => ({
          index: r.index,
          values: [r.values],
        })),
      }),
    );
    return;
  }

  // ── Slice 16: Teams channel message GET (receive-path hydration) ──
  // Matches /v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}
  // exactly (no trailing path segment). Used by the new_channel_message
  // trigger's pull.ts when `includeResourceData: false` (always, in
  // Batch 1) — the notification only carries the message id and we
  // fetch the body here.
  const teamsChannelMessageGetMatch = url.pathname.match(
    /^\/v1\.0\/teams\/([^/]+)\/channels\/([^/]+)\/messages\/([^/]+)$/,
  );
  if (req.method === "GET" && teamsChannelMessageGetMatch) {
    const teamId = decodeURIComponent(teamsChannelMessageGetMatch[1]!);
    const channelId = decodeURIComponent(teamsChannelMessageGetMatch[2]!);
    const messageId = decodeURIComponent(teamsChannelMessageGetMatch[3]!);
    state.calls.teamsChannelMessageGet.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
      teamId,
      channelId,
      messageId,
    });
    const stored = state.teamsMessages.get(messageId);
    if (!stored) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "NotFound",
            message: "The specified chatMessage was not found.",
          },
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stored.resource));
    return;
  }

  // ── Slice 16: Teams channel message POST (send_channel_message action) ──
  // Matches /v1.0/teams/{teamId}/channels/{channelId}/messages exactly
  // (no further segments — the replies endpoint adds /messages/{id}/replies
  // which would NOT match this regex). Echoes a chatMessage with a
  // synthetic id; records the body so the spec can assert the action
  // forwarded the resolved config through refreshAndRetry.
  const teamsChannelMessageSendMatch = url.pathname.match(
    /^\/v1\.0\/teams\/([^/]+)\/channels\/([^/]+)\/messages$/,
  );
  if (req.method === "POST" && teamsChannelMessageSendMatch) {
    const teamId = decodeURIComponent(teamsChannelMessageSendMatch[1]!);
    const channelId = decodeURIComponent(teamsChannelMessageSendMatch[2]!);
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // record empty body if invalid
    }
    state.teamsMessageCounter += 1;
    const messageId = `mock-teams-msg-${state.teamsMessageCounter}`;
    state.calls.teamsChannelMessageSend.push({
      authorization: req.headers.authorization,
      teamId,
      channelId,
      body: parsed,
      responseMessageId: messageId,
    });
    const echoed = {
      id: messageId,
      replyToId: null,
      body: parsed.body ?? null,
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
      messageType: "message",
      importance: "normal",
      from: {
        user: {
          id: "ms-graph-uid-e2e",
          displayName: "Alice E2E",
          userIdentityType: "aadUser",
        },
      },
      webUrl: `https://teams.microsoft.com/l/message/${channelId}/${messageId}`,
    };
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify(echoed));
    return;
  }

  // ── Graph /v1.0/subscriptions (collection) ──
  if (req.method === "POST" && url.pathname === "/v1.0/subscriptions") {
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "InvalidRequest",
            message: "Body is not valid JSON.",
          },
        }),
      );
      return;
    }

    // Microsoft validates by POSTing ?validationToken=... to the
    // notificationUrl SYNCHRONOUSLY before returning the subscription.
    const notificationUrl = String(parsed.notificationUrl ?? "");
    const clientState = String(parsed.clientState ?? "");
    const validationToken = `validation-token-${Date.now()}`;
    let validationStatus: number | null = null;
    let validationEchoMatched = false;
    if (notificationUrl) {
      const validationUrl = new URL(notificationUrl);
      validationUrl.searchParams.set("validationToken", validationToken);
      try {
        const validationResp = await fetch(validationUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        validationStatus = validationResp.status;
        const echoed = await validationResp.text();
        validationEchoMatched = echoed === validationToken;
      } catch (err) {
        console.error(
          "[mock-microsoft] validation handshake failed",
          err,
        );
      }
    }

    if (
      !notificationUrl ||
      validationStatus !== 200 ||
      !validationEchoMatched
    ) {
      // Real Graph would return 400 with a ValidationError
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "ValidationError",
            message: "Subscription validation request failed.",
          },
        }),
      );
      state.calls.subscriptionsCreate.push({
        authorization: req.headers.authorization,
        body: parsed,
        responseSubscriptionId: "",
        validationStatus,
        validationEchoMatched,
      });
      return;
    }

    state.subscriptionCounter += 1;
    const subscriptionId = `ms-sub-${state.subscriptionCounter}`;
    const subscription: RegisteredSubscription = {
      id: subscriptionId,
      resource: String(parsed.resource ?? ""),
      changeType: String(parsed.changeType ?? "created"),
      notificationUrl,
      lifecycleNotificationUrl:
        typeof parsed.lifecycleNotificationUrl === "string"
          ? parsed.lifecycleNotificationUrl
          : null,
      expirationDateTime: String(parsed.expirationDateTime ?? ""),
      clientState,
    };
    state.subscriptions.set(subscriptionId, subscription);
    state.lastSubscriptionId = subscriptionId;
    state.calls.subscriptionsCreate.push({
      authorization: req.headers.authorization,
      body: parsed,
      responseSubscriptionId: subscriptionId,
      validationStatus,
      validationEchoMatched,
    });

    res.writeHead(201, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: subscriptionId,
        resource: subscription.resource,
        changeType: subscription.changeType,
        notificationUrl: subscription.notificationUrl,
        lifecycleNotificationUrl: subscription.lifecycleNotificationUrl,
        expirationDateTime: subscription.expirationDateTime,
        clientState: subscription.clientState,
      }),
    );
    return;
  }

  // ── Graph /v1.0/subscriptions/{id} ──
  const subPathMatch = url.pathname.match(/^\/v1\.0\/subscriptions\/(.+)$/);
  if (subPathMatch) {
    const subscriptionId = decodeURIComponent(subPathMatch[1]!);
    if (req.method === "PATCH") {
      const bodyText = await readBody(req);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "InvalidRequest", message: "Body is not valid JSON." },
          }),
        );
        return;
      }
      state.calls.subscriptionsRenew.push({
        authorization: req.headers.authorization,
        subscriptionId,
        body: parsed,
      });
      const sub = state.subscriptions.get(subscriptionId);
      if (!sub) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "ResourceNotFound", message: "Subscription not found." },
          }),
        );
        return;
      }
      const newExp =
        typeof parsed.expirationDateTime === "string"
          ? parsed.expirationDateTime
          : sub.expirationDateTime;
      sub.expirationDateTime = newExp;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: subscriptionId,
          resource: sub.resource,
          changeType: sub.changeType,
          expirationDateTime: newExp,
        }),
      );
      return;
    }
    if (req.method === "DELETE") {
      state.calls.subscriptionsDelete.push({
        authorization: req.headers.authorization,
        subscriptionId,
      });
      const existed = state.subscriptions.delete(subscriptionId);
      if (!existed) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "ResourceNotFound", message: "Subscription not found." },
          }),
        );
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }
  }

  // ── Control plane ──
  if (req.method === "POST" && url.pathname === "/__injectMessage") {
    const bodyText = await readBody(req);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const id = String(payload.id ?? "");
    if (!id) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "id required" }));
      return;
    }
    state.messages.set(id, { id, resource: payload });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  // ── Slice 7: __injectEvent control plane ──
  if (req.method === "POST" && url.pathname === "/__injectEvent") {
    const bodyText = await readBody(req);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const id = String(payload.id ?? "");
    if (!id) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "id required" }));
      return;
    }
    state.events.set(id, { id, resource: payload });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  // ── Slice 15: __injectExcelWorksheet control plane ──
  // Sets the entire worksheet's value matrix. Body shape:
  //   { workbookId: "wb-1", worksheetName: "Sheet1",
  //     values: [["name","age"], ["alice", 30]] }
  // The activation hook's usedRange call observes these values
  // verbatim, so the snapshot baseline matches exactly.
  if (req.method === "POST" && url.pathname === "/__injectExcelWorksheet") {
    const bodyText = await readBody(req);
    let payload: {
      workbookId?: string;
      worksheetName?: string;
      values?: unknown[][];
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const workbookId = payload.workbookId ?? "";
    const worksheetName = payload.worksheetName ?? "";
    if (!workbookId || !worksheetName) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "workbookId + worksheetName required" }));
      return;
    }
    let wb = state.excelWorksheets.get(workbookId);
    if (!wb) {
      wb = new Map();
      state.excelWorksheets.set(workbookId, wb);
    }
    wb.set(worksheetName, { values: (payload.values ?? []) as unknown[][] });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, workbookId, worksheetName }));
    return;
  }

  // ── Slice 15: __appendExcelRow control plane ──
  // Appends one row to the tail of a worksheet. Simulates a user
  // editing the workbook between activation and a poll tick, so the
  // poll detects a new row and fires.
  if (req.method === "POST" && url.pathname === "/__appendExcelRow") {
    const bodyText = await readBody(req);
    let payload: {
      workbookId?: string;
      worksheetName?: string;
      row?: unknown[];
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const workbookId = payload.workbookId ?? "";
    const worksheetName = payload.worksheetName ?? "";
    if (!workbookId || !worksheetName || !Array.isArray(payload.row)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "workbookId + worksheetName + row[] required",
        }),
      );
      return;
    }
    let wb = state.excelWorksheets.get(workbookId);
    if (!wb) {
      wb = new Map();
      state.excelWorksheets.set(workbookId, wb);
    }
    let sheet = wb.get(worksheetName);
    if (!sheet) {
      sheet = { values: [] };
      wb.set(worksheetName, sheet);
    }
    sheet.values.push(payload.row as unknown[]);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ ok: true, rowIndex: sheet.values.length }),
    );
    return;
  }

  // ── Excel parity Commit 5: __updateExcelRow control plane ──
  // Mutates the values at a 1-based rowIndex in an existing worksheet.
  // Simulates an in-place cell edit between activation and a poll tick
  // so the `updated_row` trigger detects a hash diff and fires.
  // Body shape:
  //   { workbookId, worksheetName, rowIndex: 1-based, values: [...] }
  if (req.method === "POST" && url.pathname === "/__updateExcelRow") {
    const bodyText = await readBody(req);
    let payload: {
      workbookId?: string;
      worksheetName?: string;
      rowIndex?: number;
      values?: unknown[];
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const workbookId = payload.workbookId ?? "";
    const worksheetName = payload.worksheetName ?? "";
    const rowIndex = Number(payload.rowIndex ?? 0);
    if (
      !workbookId ||
      !worksheetName ||
      !Number.isInteger(rowIndex) ||
      rowIndex < 1 ||
      !Array.isArray(payload.values)
    ) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "workbookId + worksheetName + 1-based rowIndex + values[] required",
        }),
      );
      return;
    }
    const wb = state.excelWorksheets.get(workbookId);
    const sheet = wb?.get(worksheetName);
    if (!sheet) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "worksheet not found" }));
      return;
    }
    // Pad with empty rows if the caller is updating past the tail (no
    // production path does this; the helper is defensive only).
    while (sheet.values.length < rowIndex) sheet.values.push([]);
    sheet.values[rowIndex - 1] = payload.values as unknown[];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rowIndex }));
    return;
  }

  // ── Excel parity Commit 5: __injectExcelTable control plane ──
  // Seeds a table's rows for the `new_table_row` + `updated_table_row`
  // trigger e2e scenarios. Body shape:
  //   { workbookId, tableName, rows: [{ index, values }] }
  if (req.method === "POST" && url.pathname === "/__injectExcelTable") {
    const bodyText = await readBody(req);
    let payload: {
      workbookId?: string;
      tableName?: string;
      rows?: Array<{ index?: number; values?: unknown[] }>;
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const workbookId = payload.workbookId ?? "";
    const tableName = payload.tableName ?? "";
    if (!workbookId || !tableName || !Array.isArray(payload.rows)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "workbookId + tableName + rows[] required",
        }),
      );
      return;
    }
    let wb = state.excelTables.get(workbookId);
    if (!wb) {
      wb = new Map();
      state.excelTables.set(workbookId, wb);
    }
    wb.set(
      tableName,
      payload.rows.map((r) => ({
        index: Number(r.index ?? 0),
        values: Array.isArray(r.values) ? (r.values as unknown[]) : [],
      })),
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, workbookId, tableName }));
    return;
  }

  // ── Excel parity Commit 5: __updateExcelTableRow control plane ──
  // Mutates a single table row's values at its stable Graph index.
  // Index identity stays pinned, so the `updated_table_row` trigger
  // sees a hash change at the same key (vs. a `new_row`-style key
  // delta). Body shape:
  //   { workbookId, tableName, index, values: [...] }
  if (req.method === "POST" && url.pathname === "/__updateExcelTableRow") {
    const bodyText = await readBody(req);
    let payload: {
      workbookId?: string;
      tableName?: string;
      index?: number;
      values?: unknown[];
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const workbookId = payload.workbookId ?? "";
    const tableName = payload.tableName ?? "";
    const index = Number(payload.index ?? -1);
    if (
      !workbookId ||
      !tableName ||
      !Number.isInteger(index) ||
      index < 0 ||
      !Array.isArray(payload.values)
    ) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "workbookId + tableName + index + values[] required",
        }),
      );
      return;
    }
    const wb = state.excelTables.get(workbookId);
    const rows = wb?.get(tableName);
    if (!rows) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "table not found" }));
      return;
    }
    const row = rows.find((r) => r.index === index);
    if (!row) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "row index not found" }));
      return;
    }
    row.values = payload.values as unknown[];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, index }));
    return;
  }

  // ── Slice 16: __injectTeamsMessage control plane ──
  // Seeds a Graph chatMessage resource for the
  // /v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId} GET
  // route (receive-path hydration). Body shape:
  //   { id, teamId, channelId, ...graphMessageFields }
  // Only `id`, `teamId`, `channelId` are required; the rest of the
  // payload is echoed verbatim as the resource body.
  if (req.method === "POST" && url.pathname === "/__injectTeamsMessage") {
    const bodyText = await readBody(req);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const id = String(payload.id ?? "");
    const teamId = String(payload.teamId ?? "");
    const channelId = String(payload.channelId ?? "");
    if (!id || !teamId || !channelId) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: "id + teamId + channelId required" }),
      );
      return;
    }
    state.teamsMessages.set(id, {
      id,
      teamId,
      channelId,
      resource: payload,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  // ── Slice 8: __injectDriveItem control plane ──
  if (req.method === "POST" && url.pathname === "/__injectDriveItem") {
    const bodyText = await readBody(req);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const id = String(payload.id ?? "");
    if (!id) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "id required" }));
      return;
    }
    state.driveItems.set(id, { id, resource: payload });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/__sendNotification") {
    const bodyText = await readBody(req);
    let payload: {
      messageId?: string;
      eventId?: string;
      itemId?: string;
      // Slice 16: chatMessageId + teamId + channelId pinpoint a Teams
      // chatMessage. Kept distinct from `messageId` (mail) to avoid the
      // semantic collision between the two Graph resource families.
      chatMessageId?: string;
      teamId?: string;
      channelId?: string;
      kind?: "message" | "event" | "driveItem" | "chatMessage";
      changeType?: string;
      // Slice 7: lets the spec deliberately spoof a clientState to drive
      // the "invalid clientState rejected" path without touching the
      // registered subscription's stored value.
      clientStateOverride?: string;
      subscriptionId?: string;
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const subscriptionId =
      payload.subscriptionId ?? state.lastSubscriptionId ?? "";
    const subscription = state.subscriptions.get(subscriptionId);
    if (!subscription) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: "subscription not found", subscriptionId }),
      );
      return;
    }

    // Resolve resource kind. Slice 7: kind="event" or eventId implies
    // calendar; kind="message" or messageId implies mail (back-compat
    // with Slice 6). Slice 8: kind="driveItem" or itemId implies
    // OneDrive. Slice 16: kind="chatMessage" or chatMessageId implies
    // Teams channel message — also requires teamId + channelId for
    // the resource path.
    const isChatMessage =
      payload.kind === "chatMessage" ||
      (payload.kind === undefined && Boolean(payload.chatMessageId));
    const isDriveItem =
      !isChatMessage &&
      (payload.kind === "driveItem" ||
        (payload.kind === undefined && Boolean(payload.itemId)));
    const isEvent =
      !isChatMessage &&
      !isDriveItem &&
      (payload.kind === "event" ||
        (payload.kind === undefined && Boolean(payload.eventId)));
    let resourceId: string | undefined;
    let resourceMissingError: string;
    if (isChatMessage) {
      resourceId = payload.chatMessageId;
      resourceMissingError = "chatMessageId required";
    } else if (isDriveItem) {
      resourceId = payload.itemId;
      resourceMissingError = "itemId required";
    } else if (isEvent) {
      resourceId = payload.eventId;
      resourceMissingError = "eventId required";
    } else {
      resourceId = payload.messageId;
      resourceMissingError = "messageId required";
    }
    if (!resourceId) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: resourceMissingError }));
      return;
    }
    if (isChatMessage && (!payload.teamId || !payload.channelId)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "chatMessage notifications require teamId + channelId",
        }),
      );
      return;
    }

    const changeType = payload.changeType ?? subscription.changeType;
    let odataType: string;
    let resourcePath: string;
    if (isChatMessage) {
      odataType = "#Microsoft.Graph.chatMessage";
      resourcePath = `teams('${payload.teamId}')/channels('${payload.channelId}')/messages('${resourceId}')`;
    } else if (isDriveItem) {
      odataType = "#Microsoft.Graph.DriveItem";
      resourcePath = `users/alice@e2e.test/drive/items/${resourceId}`;
    } else if (isEvent) {
      odataType = "#Microsoft.Graph.Event";
      resourcePath = `users/alice@e2e.test/events/${resourceId}`;
    } else {
      odataType = "#Microsoft.Graph.Message";
      resourcePath = `users/alice@e2e.test/messages/${resourceId}`;
    }
    const clientState =
      payload.clientStateOverride ?? subscription.clientState;

    const envelope = {
      value: [
        {
          subscriptionId,
          subscriptionExpirationDateTime: subscription.expirationDateTime,
          changeType,
          resource: resourcePath,
          resourceData: {
            "@odata.type": odataType,
            id: resourceId,
          },
          clientState,
          tenantId: "tenant-e2e",
        },
      ],
    };

    const resp = await fetch(subscription.notificationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    const responseBody = await resp.text();

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ status: resp.status, body: responseBody }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__reset") {
    // Preserve serverPort across reset — same reasoning as the
    // process-side reset() handle.
    const preservedPort = state.serverPort;
    Object.assign(state, freshState());
    state.serverPort = preservedPort;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/__inspect") {
    const excelDump: Record<string, Record<string, unknown[][]>> = {};
    for (const [wbId, wb] of state.excelWorksheets) {
      excelDump[wbId] = {};
      for (const [name, sheet] of wb) {
        excelDump[wbId][name] = sheet.values;
      }
    }
    const excelTableDump: Record<
      string,
      Record<string, Array<{ index: number; values: unknown[] }>>
    > = {};
    for (const [wbId, wb] of state.excelTables) {
      excelTableDump[wbId] = {};
      for (const [name, rows] of wb) {
        excelTableDump[wbId][name] = rows.map((r) => ({
          index: r.index,
          values: r.values,
        }));
      }
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        calls: state.calls,
        subscriptions: Array.from(state.subscriptions.values()),
        lastSubscriptionId: state.lastSubscriptionId,
        messageIds: Array.from(state.messages.keys()),
        eventIds: Array.from(state.events.keys()),
        driveItemIds: Array.from(state.driveItems.keys()),
        teamsMessageIds: Array.from(state.teamsMessages.keys()),
        excelWorksheets: excelDump,
        excelTables: excelTableDump,
      }),
    );
    return;
  }

  // 404 for anything else.
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-microsoft: unhandled ${req.method} ${url.pathname}`);
  // Reference unused constant so dead-code elimination doesn't trip the
  // inevitable "unused variable" lint when MAX_EXPIRATION_MINUTES is
  // pulled in by future Slice 7 changes (Calendar uses the same max).
  void MAX_EXPIRATION_MINUTES;
}

/**
 * Slice 15: shared A1 column-letter helper. Mirrors the production
 * helper inside addRow.ts so the mock's used-range address envelope
 * (e.g. "Sheet1!A1:C3") matches what production wrappers compute.
 */
function columnLetter(n: number): string {
  if (n < 1) return "A";
  let result = "";
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
