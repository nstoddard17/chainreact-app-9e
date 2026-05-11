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
    eventsCreate: RecordedEventsCreate[];
    eventsGet: RecordedEventsGet[];
    driveItemsGet: RecordedDriveItemsGet[];
    driveRootDelta: RecordedDriveRootDelta[];
    driveRootChildrenCreate: RecordedDriveRootChildrenCreate[];
    excelUsedRange: RecordedWorksheetUsedRange[];
    excelRangePatch: RecordedWorksheetRangePatch[];
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
      eventsCreate: [],
      eventsGet: [],
      driveItemsGet: [],
      driveRootDelta: [],
      driveRootChildrenCreate: [],
      excelUsedRange: [],
      excelRangePatch: [],
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
    lastAuthorizeScope: null,
    lastSubscriptionId: null,
    subscriptionCounter: 0,
    eventCounter: 0,
    teamsMessageCounter: 0,
    driveItemCounter: 0,
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
