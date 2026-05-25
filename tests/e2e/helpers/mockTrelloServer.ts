import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { createHmac } from "node:crypto";

/**
 * Standalone mock Trello server for the Slice 17 Commit 6 e2e walkthrough.
 *
 * V2's FIRST token-ingest provider — Trello's "client authorization"
 * flow returns a per-user token in the URL fragment, not via a server
 * callback. The mock simulates this by issuing a 302 from
 * `/1/authorize` to `${return_url}#token=<mock-token>`. Browsers
 * preserve fragments through redirects, so the V2 client ingest page
 * receives the fragment and POSTs to /api/integrations/oauth/trello/ingest.
 *
 * **URL conventions:** V2's Trello code targets two production hosts:
 *   - `https://trello.com/1/authorize` — authorize page
 *   - `https://api.trello.com/1/...` — REST API
 *
 * The dev server overrides both via `TRELLO_AUTHORIZE_BASE` +
 * `TRELLO_API_BASE` pointing at this mock. The mock distinguishes by
 * path prefix — `/1/authorize` is the authorize page; everything
 * else under `/1/` is REST.
 *
 * **Webhook signature scheme:** Trello's `X-Trello-Webhook` header
 * is base64 of HMAC-SHA1 over `${rawBody}${callbackURL}` keyed with
 * the OAuth client secret. The mock signs deliveries with
 * `TRELLO_CLIENT_SECRET` — must match the dev server's value.
 *
 * **Routes (real Trello surface):**
 *   GET    /1/authorize                       → 302 to `${return_url}#token=...`
 *   GET    /1/members/me                      → returns member { id, username, ... }
 *   POST   /1/cards                           → cardsCreate
 *   PUT    /1/cards/{id}                      → cardsUpdate (covers move + archive)
 *   POST   /1/cards/{id}/actions/comments     → cardsAddComment
 *   POST   /1/cards/{id}/idLabels             → cardsAddLabel
 *   POST   /1/lists                           → listsCreate
 *   POST   /1/boards                          → boardsCreate
 *   POST   /1/webhooks                        → webhooksCreate
 *   DELETE /1/webhooks/{id}                   → webhooksDelete
 *
 * **Control plane (test-only):**
 *   POST /__sendCreateCardEvent     — sign + POST a Trello createCard
 *                                     event to a registered webhook.
 *                                     Body: { webhookId, actionId?,
 *                                     boardId?, listId?, cardId?,
 *                                     cardName?, shortLink? }.
 *   POST /__replayLastWebhookEvent  — replay last sent event with
 *                                     same body + same signature +
 *                                     same callback URL. Tests dedup.
 *   POST /__sendInvalidSignatureEvent — POST with a deliberately wrong
 *                                       X-Trello-Webhook header. V2
 *                                       must 401.
 *   POST /__sendBoardMismatchEvent  — sign + POST createCard with a
 *                                     board id that differs from the
 *                                     trigger's stored boardId. V2
 *                                     must 200-ack without dispatch.
 *   POST /__sendUnsupportedActionEvent — sign + POST an event whose
 *                                        action.type is unsupported
 *                                        (e.g., createLabel). V2 must
 *                                        200-ack without dispatch.
 *   POST /__reset                  — clear all recorded state.
 *   GET  /__inspect                — dump recorded calls + state.
 *
 * Listens on a fixed port (default 9886, override via TRELLO_MOCK_PORT).
 * Different port from every other mock (9876-9885).
 */

export interface RecordedAuthorize {
  /** Trello app `key` query param — V2's TRELLO_CLIENT_ID. */
  key: string | null;
  /** `return_url` query param — where the 302 sends the browser. */
  returnUrl: string | null;
  /** `scope` query param — V2 sends "read,write,account". */
  scope: string | null;
  /** `response_type` — V2 sends "token". */
  responseType: string | null;
  /** `callback_method` — V2 sends "fragment". */
  callbackMethod: string | null;
  /** `expiration` — V2 sends "never". */
  expiration: string | null;
  /** `name` — V2 sends "ChainReact". */
  name: string | null;
}

export interface RecordedMembersMe {
  /**
   * Auth params extracted from `?key=&token=` query. Trello accepts
   * NO Bearer auth — the wire contract is URL-param.
   */
  key: string | null;
  token: string | null;
}

export interface RecordedCardCall {
  method: string;
  path: string;
  /** Auth params from query string. */
  key: string | null;
  token: string | null;
  body: string;
  parsedBody: Record<string, unknown>;
}

export interface RecordedWebhookCreate {
  key: string | null;
  token: string | null;
  body: string;
  parsedBody: Record<string, unknown>;
  /** Echoed `idModel` from request body. */
  idModel: string | null;
  /** Echoed `callbackURL` from request body. */
  callbackURL: string | null;
  /** Server-assigned webhook id. */
  responseWebhookId: string;
}

export interface RecordedWebhookDelete {
  webhookId: string;
  key: string | null;
  token: string | null;
}

export interface RecordedWebhookEvent {
  webhookId: string;
  url: string;
  actionType: string;
  actionId: string;
  status: number;
  responseBody: string;
}

export interface MockTrelloHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    membersMe: RecordedMembersMe[];
    cardsCreate: RecordedCardCall[];
    cardsUpdate: RecordedCardCall[];
    cardsAddComment: RecordedCardCall[];
    cardsAddLabel: RecordedCardCall[];
    listsCreate: RecordedCardCall[];
    boardsCreate: RecordedCardCall[];
    webhookCreate: RecordedWebhookCreate[];
    webhookDelete: RecordedWebhookDelete[];
    webhookEvent: RecordedWebhookEvent[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.TRELLO_MOCK_PORT ?? "9886");

/** Mock identity returned by /1/members/me — also embedded in token-ingest result. */
const MOCK_MEMBER_ID = "trello-mock-member-id";
const MOCK_MEMBER_USERNAME = "octocat-trello-e2e";
const MOCK_MEMBER_FULL_NAME = "Octo Trello E2E";

/** The user token the authorize endpoint hands back to the browser. */
const MOCK_USER_TOKEN = "trello-mock-e2e-user-token";

interface MockWebhook {
  id: string;
  idModel: string;
  callbackURL: string;
  description: string | null;
}

interface LastWebhookEvent {
  webhookId: string;
  callbackURL: string;
  rawBody: string;
  signature: string;
}

interface MutableState {
  calls: MockTrelloHandle["calls"];
  webhooks: Map<string, MockWebhook>;
  lastWebhookEvent: LastWebhookEvent | null;
  webhookCounter: number;
  cardCounter: number;
  listCounter: number;
  boardCounter: number;
  actionCounter: number;
}

function freshCalls(): MockTrelloHandle["calls"] {
  return {
    authorize: [],
    membersMe: [],
    cardsCreate: [],
    cardsUpdate: [],
    cardsAddComment: [],
    cardsAddLabel: [],
    listsCreate: [],
    boardsCreate: [],
    webhookCreate: [],
    webhookDelete: [],
    webhookEvent: [],
  };
}

function freshState(): MutableState {
  return {
    calls: freshCalls(),
    webhooks: new Map(),
    lastWebhookEvent: null,
    webhookCounter: 0,
    cardCounter: 0,
    listCounter: 0,
    boardCounter: 0,
    actionCounter: 0,
  };
}

export interface StartMockTrelloOptions {
  /** V2 dev server origin — used to construct webhook delivery URLs. */
  appBaseUrl: string;
  /** TRELLO_CLIENT_SECRET — used to sign webhook deliveries. MUST match dev. */
  appSecret: string;
  port?: number;
}

export async function startMockTrelloServer(
  opts: StartMockTrelloOptions,
): Promise<MockTrelloHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, state, opts).catch((err) => {
      console.error("[mockTrello] handler error", err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: (err as Error).message }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    calls: state.calls,
    reset: () => Object.assign(state, freshState()),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function parseJsonSafe<T = Record<string, unknown>>(body: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    return {} as T;
  }
}

function signTrello(rawBody: string, callbackURL: string, secret: string): string {
  return createHmac("sha1", secret)
    .update(rawBody, "utf8")
    .update(callbackURL, "utf8")
    .digest("base64");
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  opts: StartMockTrelloOptions,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // ── Control plane ──────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/__reset") {
    Object.assign(state, freshState());
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && url.pathname === "/__inspect") {
    json(res, 200, {
      calls: state.calls,
      webhooks: Array.from(state.webhooks.values()),
      lastWebhookEvent: state.lastWebhookEvent,
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/__sendCreateCardEvent") {
    await handleSendEvent(req, res, state, opts, {
      actionType: "createCard",
      mismatchBoard: false,
      invalidSignature: false,
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/__sendUnsupportedActionEvent") {
    await handleSendEvent(req, res, state, opts, {
      actionType: "createLabel",
      mismatchBoard: false,
      invalidSignature: false,
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/__sendBoardMismatchEvent") {
    await handleSendEvent(req, res, state, opts, {
      actionType: "createCard",
      mismatchBoard: true,
      invalidSignature: false,
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/__sendInvalidSignatureEvent") {
    await handleSendEvent(req, res, state, opts, {
      actionType: "createCard",
      mismatchBoard: false,
      invalidSignature: true,
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/__replayLastWebhookEvent") {
    await handleReplayLast(res, state);
    return;
  }

  // ── Real Trello surface ────────────────────────────────────────

  // GET /1/authorize — issues 302 to `return_url#token=<token>`.
  if (req.method === "GET" && url.pathname === "/1/authorize") {
    handleAuthorize(res, state, url);
    return;
  }

  // GET /1/members/me
  if (req.method === "GET" && url.pathname === "/1/members/me") {
    handleMembersMe(res, state, url);
    return;
  }

  // REST endpoints — all under /1/
  if (req.method === "POST" && url.pathname === "/1/cards") {
    await handleCardsCreate(req, res, state, url);
    return;
  }
  const updateMatch = url.pathname.match(/^\/1\/cards\/([^/]+)$/);
  if (req.method === "PUT" && updateMatch) {
    await handleCardsUpdate(req, res, state, url, updateMatch[1]!);
    return;
  }
  const commentMatch = url.pathname.match(
    /^\/1\/cards\/([^/]+)\/actions\/comments$/,
  );
  if (req.method === "POST" && commentMatch) {
    await handleCardsAddComment(req, res, state, url, commentMatch[1]!);
    return;
  }
  const labelMatch = url.pathname.match(/^\/1\/cards\/([^/]+)\/idLabels$/);
  if (req.method === "POST" && labelMatch) {
    await handleCardsAddLabel(req, res, state, url, labelMatch[1]!);
    return;
  }
  if (req.method === "POST" && url.pathname === "/1/lists") {
    await handleListsCreate(req, res, state, url);
    return;
  }
  if (req.method === "POST" && url.pathname === "/1/boards") {
    await handleBoardsCreate(req, res, state, url);
    return;
  }
  if (req.method === "POST" && url.pathname === "/1/webhooks") {
    await handleWebhooksCreate(req, res, state, url);
    return;
  }
  const deleteMatch = url.pathname.match(/^\/1\/webhooks\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    await handleWebhooksDelete(res, state, url, deleteMatch[1]!);
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: `mock trello: no route for ${req.method} ${url.pathname}` }));
}

function handleAuthorize(
  res: ServerResponse,
  state: MutableState,
  url: URL,
): void {
  const key = url.searchParams.get("key");
  const returnUrl = url.searchParams.get("return_url");
  state.calls.authorize.push({
    key,
    returnUrl,
    scope: url.searchParams.get("scope"),
    responseType: url.searchParams.get("response_type"),
    callbackMethod: url.searchParams.get("callback_method"),
    expiration: url.searchParams.get("expiration"),
    name: url.searchParams.get("name"),
  });

  if (!returnUrl) {
    res.statusCode = 400;
    res.end("missing return_url");
    return;
  }
  // Trello returns the token in the URL fragment. Browsers preserve
  // fragments through 302 redirects when they're in the Location
  // header.
  const location = `${returnUrl}#token=${encodeURIComponent(MOCK_USER_TOKEN)}`;
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

function handleMembersMe(
  res: ServerResponse,
  state: MutableState,
  url: URL,
): void {
  state.calls.membersMe.push({
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
  });
  json(res, 200, {
    id: MOCK_MEMBER_ID,
    username: MOCK_MEMBER_USERNAME,
    fullName: MOCK_MEMBER_FULL_NAME,
    initials: "OT",
    avatarUrl: "https://trello-members.s3.amazonaws.com/mock/170.png",
    url: `https://trello.com/${MOCK_MEMBER_USERNAME}`,
  });
}

async function handleCardsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
): Promise<void> {
  const body = await readBody(req);
  const parsed = parseJsonSafe(body);
  state.cardCounter += 1;
  const cardId = `card-mock-${state.cardCounter}`;
  state.calls.cardsCreate.push({
    method: "POST",
    path: url.pathname,
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
    body,
    parsedBody: parsed,
  });
  json(res, 200, {
    id: cardId,
    name: parsed.name ?? null,
    desc: parsed.desc ?? null,
    url: `https://trello.com/c/${cardId}/mock`,
    shortUrl: `https://trello.com/c/${cardId}`,
    shortLink: cardId,
    idList: parsed.idList ?? null,
    idBoard: "board-mock-1",
    pos: parsed.pos ?? 65536,
    closed: false,
    due: parsed.due ?? null,
    dueComplete: parsed.dueComplete ?? null,
    start: parsed.start ?? null,
    idMembers: [],
    idLabels: [],
  });
}

async function handleCardsUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
  cardId: string,
): Promise<void> {
  const body = await readBody(req);
  const parsed = parseJsonSafe(body);
  state.calls.cardsUpdate.push({
    method: "PUT",
    path: url.pathname,
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
    body,
    parsedBody: parsed,
  });
  json(res, 200, {
    id: cardId,
    name: parsed.name ?? "mock card",
    desc: parsed.desc ?? null,
    url: `https://trello.com/c/${cardId}/mock`,
    shortUrl: `https://trello.com/c/${cardId}`,
    idList: parsed.idList ?? null,
    idBoard: "board-mock-1",
    closed: parsed.closed ?? false,
    due: parsed.due ?? null,
    dueComplete: parsed.dueComplete ?? null,
    start: parsed.start ?? null,
    pos: parsed.pos ?? null,
    idMembers: [],
    idLabels: [],
  });
}

async function handleCardsAddComment(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
  cardId: string,
): Promise<void> {
  const body = await readBody(req);
  const parsed = parseJsonSafe(body);
  state.actionCounter += 1;
  state.calls.cardsAddComment.push({
    method: "POST",
    path: url.pathname,
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
    body,
    parsedBody: parsed,
  });
  json(res, 200, {
    id: `action-mock-${state.actionCounter}`,
    type: "commentCard",
    date: new Date().toISOString(),
    data: { text: parsed.text ?? "", idCard: cardId },
    memberCreator: {
      id: MOCK_MEMBER_ID,
      username: MOCK_MEMBER_USERNAME,
      fullName: MOCK_MEMBER_FULL_NAME,
    },
  });
}

async function handleCardsAddLabel(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
  _cardId: string,
): Promise<void> {
  const body = await readBody(req);
  const parsed = parseJsonSafe(body);
  const labelValue = url.searchParams.get("value");
  state.calls.cardsAddLabel.push({
    method: "POST",
    path: url.pathname,
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
    body,
    parsedBody: { ...parsed, value: labelValue },
  });
  json(res, 200, [labelValue ?? "label-mock-1"]);
}

async function handleListsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
): Promise<void> {
  const body = await readBody(req);
  const parsed = parseJsonSafe(body);
  state.listCounter += 1;
  const listId = `list-mock-${state.listCounter}`;
  state.calls.listsCreate.push({
    method: "POST",
    path: url.pathname,
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
    body,
    parsedBody: parsed,
  });
  json(res, 200, {
    id: listId,
    name: parsed.name ?? null,
    idBoard: parsed.idBoard ?? null,
    pos: parsed.pos ?? 65536,
    closed: false,
  });
}

async function handleBoardsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
): Promise<void> {
  const body = await readBody(req);
  const parsed = parseJsonSafe(body);
  state.boardCounter += 1;
  const boardId = `board-mock-${state.boardCounter}`;
  state.calls.boardsCreate.push({
    method: "POST",
    path: url.pathname,
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
    body,
    parsedBody: parsed,
  });
  json(res, 200, {
    id: boardId,
    name: parsed.name ?? null,
    desc: parsed.desc ?? null,
    url: `https://trello.com/b/${boardId}`,
    shortUrl: `https://trello.com/b/${boardId}`,
    closed: false,
    idOrganization: null,
    prefs: { permissionLevel: parsed.prefs_permissionLevel ?? "private" },
  });
}

async function handleWebhooksCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
): Promise<void> {
  const body = await readBody(req);
  const parsed = parseJsonSafe(body);
  state.webhookCounter += 1;
  const webhookId = `wh-mock-${state.webhookCounter}`;
  const idModel = (parsed.idModel as string | undefined) ?? null;
  const callbackURL = (parsed.callbackURL as string | undefined) ?? null;
  state.calls.webhookCreate.push({
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
    body,
    parsedBody: parsed,
    idModel,
    callbackURL,
    responseWebhookId: webhookId,
  });
  if (idModel !== null && callbackURL !== null) {
    state.webhooks.set(webhookId, {
      id: webhookId,
      idModel,
      callbackURL,
      description: (parsed.description as string | undefined) ?? null,
    });
  }
  json(res, 200, {
    id: webhookId,
    idModel,
    callbackURL,
    description: parsed.description ?? null,
    active: true,
  });
}

async function handleWebhooksDelete(
  res: ServerResponse,
  state: MutableState,
  url: URL,
  webhookId: string,
): Promise<void> {
  state.calls.webhookDelete.push({
    webhookId,
    key: url.searchParams.get("key"),
    token: url.searchParams.get("token"),
  });
  state.webhooks.delete(webhookId);
  json(res, 200, {});
}

// ── Control-plane event senders ───────────────────────────────────

interface SendEventOpts {
  actionType: string;
  mismatchBoard: boolean;
  invalidSignature: boolean;
}

interface SendEventPayload {
  webhookId?: string;
  actionId?: string;
  boardId?: string;
  listId?: string;
  cardId?: string;
  cardName?: string;
  shortLink?: string;
}

async function handleSendEvent(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  opts: StartMockTrelloOptions,
  sendOpts: SendEventOpts,
): Promise<void> {
  const body = await readBody(req);
  const payload = parseJsonSafe<SendEventPayload>(body);
  const webhookId = payload.webhookId;
  if (!webhookId) {
    json(res, 400, { error: "webhookId required" });
    return;
  }
  const webhook = state.webhooks.get(webhookId);
  if (!webhook) {
    json(res, 404, { error: `webhook ${webhookId} not found` });
    return;
  }

  state.actionCounter += 1;
  const actionId = payload.actionId ?? `action-mock-${state.actionCounter}`;
  const boardId = sendOpts.mismatchBoard
    ? (payload.boardId ?? "board-mock-mismatch-xyz")
    : (payload.boardId ?? webhook.idModel);

  const trelloAction: Record<string, unknown> = {
    id: actionId,
    type: sendOpts.actionType,
    date: new Date().toISOString(),
    data: {
      card: {
        id: payload.cardId ?? "card-mock-fired",
        name: payload.cardName ?? "Card Fired By Webhook",
        shortLink: payload.shortLink ?? "abc123",
        url: `https://trello.com/c/${payload.shortLink ?? "abc123"}`,
      },
      board: { id: boardId, name: "Mock Board" },
      list: { id: payload.listId ?? "list-mock-fired", name: "Mock List" },
    },
    memberCreator: {
      id: MOCK_MEMBER_ID,
      username: MOCK_MEMBER_USERNAME,
      fullName: MOCK_MEMBER_FULL_NAME,
    },
  };
  const rawBody = JSON.stringify({ action: trelloAction });
  const realSig = signTrello(rawBody, webhook.callbackURL, opts.appSecret);
  const sigToSend = sendOpts.invalidSignature
    ? "AAAA" + realSig.slice(4) // mutate first 4 chars → wrong digest
    : realSig;

  state.lastWebhookEvent = {
    webhookId,
    callbackURL: webhook.callbackURL,
    rawBody,
    signature: realSig,
  };

  const deliverResp = await deliverWebhook(
    webhook.callbackURL,
    rawBody,
    sigToSend,
  );

  state.calls.webhookEvent.push({
    webhookId,
    url: webhook.callbackURL,
    actionType: sendOpts.actionType,
    actionId,
    status: deliverResp.status,
    responseBody: deliverResp.body,
  });

  json(res, 200, {
    status: deliverResp.status,
    body: deliverResp.body,
    actionId,
  });
}

async function handleReplayLast(
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const last = state.lastWebhookEvent;
  if (!last) {
    json(res, 400, { error: "no prior webhook event to replay" });
    return;
  }
  const deliverResp = await deliverWebhook(
    last.callbackURL,
    last.rawBody,
    last.signature,
  );
  state.calls.webhookEvent.push({
    webhookId: last.webhookId,
    url: last.callbackURL,
    actionType: "replayed",
    actionId: "replayed",
    status: deliverResp.status,
    responseBody: deliverResp.body,
  });
  json(res, 200, { status: deliverResp.status, body: deliverResp.body });
}

async function deliverWebhook(
  url: string,
  rawBody: string,
  signature: string,
): Promise<{ status: number; body: string }> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trello-Webhook": signature,
    },
    body: rawBody,
  });
  const text = await resp.text();
  return { status: resp.status, body: text };
}
