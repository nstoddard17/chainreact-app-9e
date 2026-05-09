import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";

/**
 * Standalone mock Microsoft (Azure AD + Graph) server for the Slice 6
 * Outlook mail e2e walkthrough.
 *
 * Routes (sized to V2's actual call patterns — Outlook mail + Slice 7
 * Outlook Calendar):
 *   GET  /common/oauth2/v2.0/authorize    → 302 to redirect_uri with state
 *                                           + synthetic code. Honors
 *                                           redirect_uri so Slice 7+
 *                                           providers (Calendar) can share
 *                                           this route.
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
 *   POST /v1.0/subscriptions              → SYNCHRONOUSLY validates by
 *                                           POSTing ?validationToken=...
 *                                           to the notificationUrl, then
 *                                           returns the subscription
 *                                           record. If validation fails,
 *                                           returns 400.
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

export interface InjectedMessage {
  id: string;
  resource: Record<string, unknown>;
}

/** Slice 7: injected calendar event resource. */
export interface InjectedEvent {
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
    subscriptionsCreate: RecordedSubscriptionsCreate[];
    subscriptionsRenew: RecordedSubscriptionsRenew[];
    subscriptionsDelete: RecordedSubscriptionsDelete[];
  };
  messages: Map<string, InjectedMessage>;
  events: Map<string, InjectedEvent>;
  subscriptions: Map<string, RegisteredSubscription>;
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
  subscriptions: Map<string, RegisteredSubscription>;
  lastAuthorizeScope: string | null;
  lastSubscriptionId: string | null;
  subscriptionCounter: number;
  eventCounter: number;
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
      subscriptionsCreate: [],
      subscriptionsRenew: [],
      subscriptionsDelete: [],
    },
    messages: new Map(),
    events: new Map(),
    subscriptions: new Map(),
    lastAuthorizeScope: null,
    lastSubscriptionId: null,
    subscriptionCounter: 0,
    eventCounter: 0,
  };
}

export async function startMockMicrosoftServer(opts: {
  appBaseUrl: string;
  port?: number;
}): Promise<MockMicrosoftHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

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
    get subscriptions() {
      return state.subscriptions;
    },
    get lastAuthorizeScope() {
      return state.lastAuthorizeScope;
    },
    get lastSubscriptionId() {
      return state.lastSubscriptionId;
    },
    reset: () => Object.assign(state, freshState()),
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

  if (req.method === "POST" && url.pathname === "/__sendNotification") {
    const bodyText = await readBody(req);
    let payload: {
      messageId?: string;
      eventId?: string;
      kind?: "message" | "event";
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
    // with Slice 6).
    const isEvent =
      payload.kind === "event" ||
      (payload.kind === undefined && Boolean(payload.eventId));
    const resourceId = isEvent ? payload.eventId : payload.messageId;
    if (!resourceId) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: isEvent ? "eventId required" : "messageId required",
        }),
      );
      return;
    }

    const changeType = payload.changeType ?? subscription.changeType;
    const odataType = isEvent
      ? "#Microsoft.Graph.Event"
      : "#Microsoft.Graph.Message";
    const resourcePath = isEvent
      ? `users/alice@e2e.test/events/${resourceId}`
      : `users/alice@e2e.test/messages/${resourceId}`;
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
    Object.assign(state, freshState());
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/__inspect") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        calls: state.calls,
        subscriptions: Array.from(state.subscriptions.values()),
        lastSubscriptionId: state.lastSubscriptionId,
        messageIds: Array.from(state.messages.keys()),
        eventIds: Array.from(state.events.keys()),
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

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
