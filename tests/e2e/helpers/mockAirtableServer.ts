import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Standalone mock Airtable (OAuth + REST + webhooks) server for the
 * Slice 10 e2e walkthrough.
 *
 * V2's first non-Google / non-Microsoft REFRESHABLE provider with
 * rotated refresh tokens AND the first webhook-with-cursor-payload-fetch
 * trigger. The mock owns:
 *
 * Routes (sized to V2's actual call patterns):
 *   GET  /oauth2/v1/authorize  → 302 to redirect_uri with state +
 *                                synthetic code. Records code_challenge +
 *                                code_challenge_method so the spec asserts
 *                                PKCE was used (Airtable requires PKCE).
 *   POST /oauth2/v1/token      → access_token + refresh_token + expires_in
 *                                + scope. Form-encoded body, HTTP Basic
 *                                auth required (mock validates Authorization
 *                                header format — fails 401 on missing/
 *                                malformed Basic auth so the spec confirms
 *                                V2 sent it). Refresh path returns a NEW
 *                                refresh_token to exercise V2's rotated-
 *                                refresh-token contract.
 *   GET  /v0/meta/whoami       → Returns id + email + scopes.
 *   GET  /v0/meta/bases/{baseId}/tables → Returns the configured schema.
 *   GET  /v0/{baseId}/{table}  → list records. Honors filterByFormula,
 *                                maxRecords, etc. — mock keeps the
 *                                injected records and returns matches.
 *   GET  /v0/{baseId}/{table}/{id} → get single record.
 *   POST /v0/{baseId}/{table}  → create record. Echoes back with id.
 *   PATCH /v0/{baseId}/{table}/{id} → update record.
 *   DELETE /v0/{baseId}/{table}/{id} → delete record.
 *   POST /v0/bases/{baseId}/webhooks → create webhook. Returns synthetic
 *                                id + macSecretBase64 + expirationTime.
 *   DELETE /v0/bases/{baseId}/webhooks/{id} → delete webhook.
 *   POST /v0/bases/{baseId}/webhooks/{id}/refresh → returns new
 *                                expirationTime.
 *   GET  /v0/bases/{baseId}/webhooks/{id}/payloads?cursor=N → returns
 *                                payloads queued via __injectRecordChange
 *                                from cursor onwards. Cursor advances to
 *                                the new high-water mark.
 *
 * Control plane (test-only):
 *   POST /__injectRecordChange — enqueue a record change against the most
 *                                recently created webhook. Body:
 *                                `{ tableId, recordId, eventType, fields? }`
 *                                or `{ webhookId, ... }` to target a
 *                                specific webhook. Auto-assigns
 *                                baseTransactionNumber. Returns the
 *                                assigned bTN + the cursor index (1-based)
 *                                of the new payload.
 *   POST /__sendWebhookPing    — send a signed `X-Airtable-Content-MAC`
 *                                ping to the webhook's notificationUrl.
 *                                Body: `{ webhookId? }` (defaults to most
 *                                recent). Returns the response shape
 *                                `{ status, body }`.
 *   POST /__reset              — clear all state.
 *   GET  /__inspect            — dump calls + state.
 *
 * Listens on a fixed port (default 9880, override via AIRTABLE_MOCK_PORT).
 * Different port from Slack (9876), Google (9877), Microsoft (9878),
 * Notion (9879).
 *
 * **Refresh-token rotation:** the token endpoint's refresh_token branch
 * issues a NEW refresh_token on every call (ROTATION-by-counter). V2's
 * dispatcher must persist the new value so a second refresh works. Slice
 * 10 unit tests already cover this; the e2e walkthrough does NOT exercise
 * rotation (would require triggering a 401 mid-action, which complicates
 * the mock). Keeping the e2e clean — rotation is unit-test territory.
 */

export interface RecordedAuthorize {
  state: string;
  redirectUri: string | null;
  responseType: string | null;
  scope: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

export interface RecordedTokenExchange {
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedWhoami {
  authorization: string | undefined;
  url: string;
}

export interface RecordedRecordsCall {
  method: string;
  authorization: string | undefined;
  baseId: string;
  tableIdOrName: string;
  recordId: string | null;
  url: string;
  body: Record<string, unknown> | null;
  responseRecordId: string | null;
}

export interface RecordedSchemaCall {
  authorization: string | undefined;
  baseId: string;
}

export interface RecordedWebhookCreate {
  authorization: string | undefined;
  baseId: string;
  body: Record<string, unknown>;
  responseWebhookId: string;
}

export interface RecordedWebhookDelete {
  authorization: string | undefined;
  baseId: string;
  webhookId: string;
}

export interface RecordedWebhookRefresh {
  authorization: string | undefined;
  baseId: string;
  webhookId: string;
}

export interface RecordedWebhookListPayloads {
  authorization: string | undefined;
  baseId: string;
  webhookId: string;
  cursor: string | null;
  responsePayloadCount: number;
  responseCursor: number;
  responseMightHaveMore: boolean;
}

export interface RecordedWebhookPing {
  webhookId: string;
  url: string;
  status: number;
  body: string;
}

export interface MockAirtableHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    whoami: RecordedWhoami[];
    records: RecordedRecordsCall[];
    schema: RecordedSchemaCall[];
    webhookCreate: RecordedWebhookCreate[];
    webhookDelete: RecordedWebhookDelete[];
    webhookRefresh: RecordedWebhookRefresh[];
    webhookListPayloads: RecordedWebhookListPayloads[];
    webhookPing: RecordedWebhookPing[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.AIRTABLE_MOCK_PORT ?? "9880");

/**
 * Single Airtable record stored in the mock.
 */
interface MockRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

/**
 * Mock-side webhook entry.
 */
interface MockWebhook {
  id: string;
  baseId: string;
  notificationUrl: string;
  macSecretBase64: string;
  macSecretBytes: Buffer;
  expirationTime: string;
  /**
   * Per-webhook ordered list of payloads queued by __injectRecordChange.
   * Cursor semantics: cursor=0 returns from index 0, cursor=N returns
   * from index N. Response cursor = startingIndex + payloads.length.
   */
  payloads: Record<string, unknown>[];
}

interface MutableState {
  calls: MockAirtableHandle["calls"];
  /** records keyed by `${baseId}:${tableIdOrName}:${recordId}`. */
  records: Map<string, MockRecord>;
  webhooks: Map<string, MockWebhook>;
  lastWebhookId: string | null;
  webhookCounter: number;
  recordCounter: number;
  baseTransactionCounter: number;
  /** Schema returned by /v0/meta/bases/{baseId}/tables. */
  schemaTables: Array<Record<string, unknown>>;
  /** The last-sent ping body + signature, for replay. */
  lastPing: { webhookId: string; body: string; signature: string } | null;
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      whoami: [],
      records: [],
      schema: [],
      webhookCreate: [],
      webhookDelete: [],
      webhookRefresh: [],
      webhookListPayloads: [],
      webhookPing: [],
    },
    records: new Map(),
    webhooks: new Map(),
    lastWebhookId: null,
    webhookCounter: 0,
    recordCounter: 0,
    baseTransactionCounter: 0,
    schemaTables: defaultSchema(),
    lastPing: null,
  };
}

/**
 * Default schema returned by /v0/meta/bases/{baseId}/tables. The
 * walkthrough configures a `tasks` table with three supported field
 * types so the schema-aware path is exercised end-to-end.
 */
function defaultSchema(): Array<Record<string, unknown>> {
  return [
    {
      id: "tblTASKS",
      name: "Tasks",
      primaryFieldId: "fldNAME",
      fields: [
        { id: "fldNAME", name: "Name", type: "singleLineText" },
        { id: "fldNOTES", name: "Notes", type: "longText" },
        { id: "fldDONE", name: "Done", type: "checkbox" },
      ],
    },
  ];
}

export async function startMockAirtableServer(opts: {
  appBaseUrl: string;
  port?: number;
}): Promise<MockAirtableHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, state).catch((err) => {
      console.error("[mock-airtable] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-airtable handler crashed");
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

  // ── OAuth Authorize ──
  if (req.method === "GET" && url.pathname === "/oauth2/v1/authorize") {
    const stateParam = url.searchParams.get("state");
    if (!stateParam) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing state");
      return;
    }
    state.calls.authorize.push({
      state: stateParam,
      redirectUri: url.searchParams.get("redirect_uri"),
      responseType: url.searchParams.get("response_type"),
      scope: url.searchParams.get("scope"),
      codeChallenge: url.searchParams.get("code_challenge"),
      codeChallengeMethod: url.searchParams.get("code_challenge_method"),
    });
    const callback = url.searchParams.get("redirect_uri")
      ? new URL(url.searchParams.get("redirect_uri")!)
      : new URL("/api/integrations/oauth/airtable/callback", appBaseUrl);
    callback.searchParams.set("code", `mock-airtable-code-${Date.now()}`);
    callback.searchParams.set("state", stateParam);
    res.writeHead(302, { location: callback.toString() });
    res.end();
    return;
  }

  // ── OAuth Token (auth_code + refresh_token branches) ──
  if (req.method === "POST" && url.pathname === "/oauth2/v1/token") {
    const authHeader = req.headers.authorization;
    const contentType = req.headers["content-type"] as string | undefined;
    const body = await readBody(req);
    const parsed = parseFormBody(body);
    state.calls.tokenExchange.push({
      authorization: authHeader,
      contentType,
      body,
      parsedBody: parsed,
    });

    // Validate Basic auth — fail loud on missing header so the spec
    // catches a regression. Airtable requires HTTP Basic auth on
    // BOTH the auth-code exchange and the refresh exchange.
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "invalid_client",
          error_description: "HTTP Basic auth credentials required.",
        }),
      );
      return;
    }
    if (!contentType?.toLowerCase().includes("application/x-www-form-urlencoded")) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "invalid_request",
          error_description: "Content-Type must be application/x-www-form-urlencoded.",
        }),
      );
      return;
    }

    if (parsed.grant_type === "authorization_code") {
      // Mock requires PKCE — fail if code_verifier missing (matches
      // Airtable's real behavior; spec asserts V2 sent it).
      if (!parsed.code_verifier) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "PKCE code_verifier is required.",
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: "airtable-mock-e2e-access",
          refresh_token: "airtable-mock-e2e-refresh-1",
          token_type: "Bearer",
          expires_in: 3600,
          scope:
            "data.records:read data.records:write schema.bases:read webhook:manage",
        }),
      );
      return;
    }

    if (parsed.grant_type === "refresh_token") {
      // ROTATION: every refresh issues a NEW refresh_token. V2's
      // refreshToken() throws if the response is missing one.
      const counter = state.calls.tokenExchange.filter(
        (c) => c.parsedBody.grant_type === "refresh_token",
      ).length;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: `airtable-mock-e2e-access-rotated-${counter}`,
          refresh_token: `airtable-mock-e2e-refresh-rotated-${counter}`,
          token_type: "Bearer",
          expires_in: 3600,
          scope:
            "data.records:read data.records:write schema.bases:read webhook:manage",
        }),
      );
      return;
    }

    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "unsupported_grant_type",
        error_description: `unknown grant_type ${parsed.grant_type ?? "<missing>"}.`,
      }),
    );
    return;
  }

  // ── /v0/meta/whoami ──
  if (req.method === "GET" && url.pathname === "/v0/meta/whoami") {
    state.calls.whoami.push({
      authorization: req.headers.authorization,
      url: req.url ?? "",
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "usrL2PNC5o3H4lBEi",
        email: "alice@e2e.test",
        scopes: [
          "data.records:read",
          "data.records:write",
          "schema.bases:read",
          "webhook:manage",
        ],
      }),
    );
    return;
  }

  // ── /v0/meta/bases/{baseId}/tables ──
  const schemaMatch = url.pathname.match(
    /^\/v0\/meta\/bases\/([^/]+)\/tables$/,
  );
  if (req.method === "GET" && schemaMatch) {
    state.calls.schema.push({
      authorization: req.headers.authorization,
      baseId: decodeURIComponent(schemaMatch[1]!),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ tables: state.schemaTables }));
    return;
  }

  // ── Webhook endpoints ─────────────────────────────────────────────────
  // POST   /v0/bases/{baseId}/webhooks
  // DELETE /v0/bases/{baseId}/webhooks/{webhookId}
  // POST   /v0/bases/{baseId}/webhooks/{webhookId}/refresh
  // GET    /v0/bases/{baseId}/webhooks/{webhookId}/payloads
  const webhookCreateMatch = url.pathname.match(
    /^\/v0\/bases\/([^/]+)\/webhooks$/,
  );
  if (req.method === "POST" && webhookCreateMatch) {
    const baseId = decodeURIComponent(webhookCreateMatch[1]!);
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore — record empty body
    }
    state.webhookCounter += 1;
    const webhookId = `achMOCKWEBHOOK${state.webhookCounter}`;
    const macSecretBytes = randomBytes(32);
    const macSecretBase64 = macSecretBytes.toString("base64");
    const expirationTime = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    ).toISOString();
    const wh: MockWebhook = {
      id: webhookId,
      baseId,
      notificationUrl: String(parsed.notificationUrl ?? ""),
      macSecretBase64,
      macSecretBytes,
      expirationTime,
      payloads: [],
    };
    state.webhooks.set(webhookId, wh);
    state.lastWebhookId = webhookId;
    state.calls.webhookCreate.push({
      authorization: req.headers.authorization,
      baseId,
      body: parsed,
      responseWebhookId: webhookId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: webhookId,
        macSecretBase64,
        expirationTime,
        notificationUrl: wh.notificationUrl,
        specification: parsed.specification ?? null,
      }),
    );
    return;
  }

  const webhookRefreshMatch = url.pathname.match(
    /^\/v0\/bases\/([^/]+)\/webhooks\/([^/]+)\/refresh$/,
  );
  if (req.method === "POST" && webhookRefreshMatch) {
    const baseId = decodeURIComponent(webhookRefreshMatch[1]!);
    const webhookId = decodeURIComponent(webhookRefreshMatch[2]!);
    const wh = state.webhooks.get(webhookId);
    state.calls.webhookRefresh.push({
      authorization: req.headers.authorization,
      baseId,
      webhookId,
    });
    if (!wh) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { type: "NOT_FOUND", message: "webhook not found" },
        }),
      );
      return;
    }
    // Extend by another 7 days.
    wh.expirationTime = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ expirationTime: wh.expirationTime }));
    return;
  }

  const webhookPayloadsMatch = url.pathname.match(
    /^\/v0\/bases\/([^/]+)\/webhooks\/([^/]+)\/payloads$/,
  );
  if (req.method === "GET" && webhookPayloadsMatch) {
    const baseId = decodeURIComponent(webhookPayloadsMatch[1]!);
    const webhookId = decodeURIComponent(webhookPayloadsMatch[2]!);
    const wh = state.webhooks.get(webhookId);
    const cursorParam = url.searchParams.get("cursor");
    if (!wh) {
      state.calls.webhookListPayloads.push({
        authorization: req.headers.authorization,
        baseId,
        webhookId,
        cursor: cursorParam,
        responsePayloadCount: 0,
        responseCursor: 0,
        responseMightHaveMore: false,
      });
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { type: "NOT_FOUND", message: "webhook not found" },
        }),
      );
      return;
    }
    const startingCursor =
      cursorParam !== null ? Number.parseInt(cursorParam, 10) : 0;
    const safeStart = Number.isNaN(startingCursor) ? 0 : startingCursor;
    const slice = wh.payloads.slice(safeStart);
    const responseCursor = safeStart + slice.length;
    state.calls.webhookListPayloads.push({
      authorization: req.headers.authorization,
      baseId,
      webhookId,
      cursor: cursorParam,
      responsePayloadCount: slice.length,
      responseCursor,
      responseMightHaveMore: false,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        payloads: slice,
        cursor: responseCursor,
        mightHaveMore: false,
      }),
    );
    return;
  }

  const webhookDeleteMatch = url.pathname.match(
    /^\/v0\/bases\/([^/]+)\/webhooks\/([^/]+)$/,
  );
  if (req.method === "DELETE" && webhookDeleteMatch) {
    const baseId = decodeURIComponent(webhookDeleteMatch[1]!);
    const webhookId = decodeURIComponent(webhookDeleteMatch[2]!);
    state.calls.webhookDelete.push({
      authorization: req.headers.authorization,
      baseId,
      webhookId,
    });
    state.webhooks.delete(webhookId);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({}));
    return;
  }

  // ── Records CRUD ──────────────────────────────────────────────────────
  // GET    /v0/{baseId}/{tableIdOrName}
  // GET    /v0/{baseId}/{tableIdOrName}/{recordId}
  // POST   /v0/{baseId}/{tableIdOrName}
  // PATCH  /v0/{baseId}/{tableIdOrName}/{recordId}
  // DELETE /v0/{baseId}/{tableIdOrName}/{recordId}
  // (Excludes /v0/meta/... and /v0/bases/.../webhooks/... already matched.)
  const recordsListMatch = url.pathname.match(/^\/v0\/([^/]+)\/([^/]+)$/);
  const recordsItemMatch = url.pathname.match(/^\/v0\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (recordsListMatch && !url.pathname.startsWith("/v0/meta/") && !url.pathname.startsWith("/v0/bases/")) {
    const baseId = decodeURIComponent(recordsListMatch[1]!);
    const tableIdOrName = decodeURIComponent(recordsListMatch[2]!);

    if (req.method === "GET") {
      // List records — return all records keyed under (baseId, tableIdOrName).
      const matches: MockRecord[] = [];
      for (const [k, v] of state.records.entries()) {
        if (k.startsWith(`${baseId}:${tableIdOrName}:`)) matches.push(v);
      }
      const filterByFormula = url.searchParams.get("filterByFormula");
      const maxRecords = url.searchParams.get("maxRecords");
      let final = matches;
      if (filterByFormula && matches.length > 0) {
        // Naive filterByFormula support: assumes formula is `{Name}='X'`
        // (good enough for the find_record path the e2e exercises;
        // production parses real Airtable formulas server-side).
        const m = filterByFormula.match(/\{(\w+)\}\s*=\s*['"]([^'"]+)['"]/);
        if (m) {
          const [, fieldName, expected] = m;
          final = matches.filter(
            (r) => String(r.fields[fieldName!] ?? "") === expected,
          );
        }
      }
      if (maxRecords) {
        final = final.slice(0, Number.parseInt(maxRecords, 10));
      }
      state.calls.records.push({
        method: "GET",
        authorization: req.headers.authorization,
        baseId,
        tableIdOrName,
        recordId: null,
        url: req.url ?? "",
        body: null,
        responseRecordId: null,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ records: final }));
      return;
    }

    if (req.method === "POST") {
      const bodyText = await readBody(req);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        // ignore
      }
      state.recordCounter += 1;
      const recordId = `recMOCK${state.recordCounter}`;
      const fields = (parsed.fields ?? {}) as Record<string, unknown>;
      const createdTime = new Date().toISOString();
      const record: MockRecord = { id: recordId, fields, createdTime };
      state.records.set(`${baseId}:${tableIdOrName}:${recordId}`, record);
      state.calls.records.push({
        method: "POST",
        authorization: req.headers.authorization,
        baseId,
        tableIdOrName,
        recordId,
        url: req.url ?? "",
        body: parsed,
        responseRecordId: recordId,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(record));
      return;
    }
  }

  if (recordsItemMatch && !url.pathname.startsWith("/v0/meta/") && !url.pathname.startsWith("/v0/bases/")) {
    const baseId = decodeURIComponent(recordsItemMatch[1]!);
    const tableIdOrName = decodeURIComponent(recordsItemMatch[2]!);
    const recordId = decodeURIComponent(recordsItemMatch[3]!);
    const key = `${baseId}:${tableIdOrName}:${recordId}`;

    if (req.method === "GET") {
      const record = state.records.get(key);
      state.calls.records.push({
        method: "GET",
        authorization: req.headers.authorization,
        baseId,
        tableIdOrName,
        recordId,
        url: req.url ?? "",
        body: null,
        responseRecordId: record?.id ?? null,
      });
      if (!record) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { type: "NOT_FOUND", message: "record not found" },
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(record));
      return;
    }

    if (req.method === "PATCH") {
      const bodyText = await readBody(req);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        // ignore
      }
      const existing = state.records.get(key);
      if (!existing) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { type: "NOT_FOUND", message: "record not found" },
          }),
        );
        return;
      }
      const newFields = {
        ...existing.fields,
        ...((parsed.fields ?? {}) as Record<string, unknown>),
      };
      const updated: MockRecord = {
        id: recordId,
        fields: newFields,
        createdTime: existing.createdTime,
      };
      state.records.set(key, updated);
      state.calls.records.push({
        method: "PATCH",
        authorization: req.headers.authorization,
        baseId,
        tableIdOrName,
        recordId,
        url: req.url ?? "",
        body: parsed,
        responseRecordId: recordId,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(updated));
      return;
    }

    if (req.method === "DELETE") {
      const existed = state.records.has(key);
      state.records.delete(key);
      state.calls.records.push({
        method: "DELETE",
        authorization: req.headers.authorization,
        baseId,
        tableIdOrName,
        recordId,
        url: req.url ?? "",
        body: null,
        responseRecordId: recordId,
      });
      if (!existed) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { type: "NOT_FOUND", message: "record not found" },
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: recordId, deleted: true }));
      return;
    }
  }

  // ── Control plane ─────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/__injectRecordChange") {
    const bodyText = await readBody(req);
    let payload: {
      webhookId?: string;
      tableId?: string;
      recordId?: string;
      eventType?: "created" | "updated" | "deleted";
      fields?: Record<string, unknown>;
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const webhookId = payload.webhookId ?? state.lastWebhookId ?? "";
    const wh = state.webhooks.get(webhookId);
    if (!wh) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "webhook not found", webhookId }));
      return;
    }
    if (!payload.tableId || !payload.recordId || !payload.eventType) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "tableId / recordId / eventType required",
        }),
      );
      return;
    }
    state.baseTransactionCounter += 1;
    const baseTransactionNumber = state.baseTransactionCounter;
    // Build the Airtable webhook payload shape.
    const tableSection: Record<string, unknown> = {};
    if (payload.eventType === "created") {
      tableSection.createdRecordsById = {
        [payload.recordId]: {
          createdTime: new Date().toISOString(),
          cellValuesByFieldId: payload.fields ?? {},
        },
      };
    } else if (payload.eventType === "updated") {
      tableSection.changedRecordsById = {
        [payload.recordId]: {
          current: { cellValuesByFieldId: payload.fields ?? {} },
        },
      };
    } else {
      tableSection.destroyedRecordIds = [payload.recordId];
    }
    const builtPayload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      baseTransactionNumber,
      payloadFormat: "v0",
      changedTablesById: { [payload.tableId]: tableSection },
    };
    wh.payloads.push(builtPayload);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        webhookId,
        baseTransactionNumber,
        payloadCount: wh.payloads.length,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__sendWebhookPing") {
    const bodyText = await readBody(req);
    let payload: { webhookId?: string };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = {};
    }
    const webhookId = payload.webhookId ?? state.lastWebhookId ?? "";
    const wh = state.webhooks.get(webhookId);
    if (!wh) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "webhook not found", webhookId }));
      return;
    }
    const pingBody = JSON.stringify({
      base: { id: wh.baseId },
      webhook: { id: wh.id },
      timestamp: new Date().toISOString(),
    });
    const signature = `hmac-sha256=${createHmac("sha256", wh.macSecretBytes).update(pingBody, "utf8").digest("hex")}`;
    state.lastPing = { webhookId, body: pingBody, signature };
    const resp = await fetch(wh.notificationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-airtable-content-mac": signature,
      },
      body: pingBody,
    });
    const responseBody = await resp.text();
    state.calls.webhookPing.push({
      webhookId,
      url: wh.notificationUrl,
      status: resp.status,
      body: responseBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: resp.status,
        body: responseBody,
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__replayLastWebhookPing") {
    if (!state.lastPing) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "no prior ping to replay" }));
      return;
    }
    const wh = state.webhooks.get(state.lastPing.webhookId);
    if (!wh) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "webhook gone" }));
      return;
    }
    const resp = await fetch(wh.notificationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-airtable-content-mac": state.lastPing.signature,
      },
      body: state.lastPing.body,
    });
    const responseBody = await resp.text();
    state.calls.webhookPing.push({
      webhookId: state.lastPing.webhookId,
      url: wh.notificationUrl,
      status: resp.status,
      body: responseBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: resp.status, body: responseBody }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/__sendInvalidSignaturePing") {
    // Spoof path: send a ping with a deliberately wrong signature.
    // V2's receive route MUST 401 — exercises the security boundary.
    const bodyText = await readBody(req);
    let payload: { webhookId?: string };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = {};
    }
    const webhookId = payload.webhookId ?? state.lastWebhookId ?? "";
    const wh = state.webhooks.get(webhookId);
    if (!wh) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "webhook not found" }));
      return;
    }
    const pingBody = JSON.stringify({
      base: { id: wh.baseId },
      webhook: { id: wh.id },
      timestamp: new Date().toISOString(),
    });
    const resp = await fetch(wh.notificationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-airtable-content-mac": `hmac-sha256=${"f".repeat(64)}`,
      },
      body: pingBody,
    });
    const responseBody = await resp.text();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: resp.status,
        body: responseBody,
      }),
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
        webhooks: Array.from(state.webhooks.values()).map((w) => ({
          id: w.id,
          baseId: w.baseId,
          notificationUrl: w.notificationUrl,
          macSecretBase64: w.macSecretBase64,
          expirationTime: w.expirationTime,
          payloadCount: w.payloads.length,
        })),
        recordIds: Array.from(state.records.keys()),
      }),
    );
    return;
  }

  // 404 for anything else.
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-airtable: unhandled ${req.method} ${url.pathname}`);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseFormBody(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) {
      out[decodeURIComponent(pair)] = "";
    } else {
      const k = decodeURIComponent(pair.slice(0, eq));
      const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
      out[k] = v;
    }
  }
  return out;
}
