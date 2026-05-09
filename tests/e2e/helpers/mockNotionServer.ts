import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";

/**
 * Standalone mock Notion (OAuth + REST API) server for the Slice 9
 * Notion e2e walkthrough.
 *
 * V2's first non-Google / non-Microsoft mock server. Notion's OAuth +
 * API contracts are simpler than Microsoft Graph: no PKCE, no
 * subscription validation handshake, no per-action scope grants. The
 * scope of this mock is correspondingly tight — only the routes
 * Slice 9 Batch 1 actually hits.
 *
 * Routes (sized to V2's actual call patterns):
 *   GET  /v1/oauth/authorize  → 302 to redirect_uri with state +
 *                               synthetic code. Honors redirect_uri so
 *                               the dispatcher's standard callback path
 *                               works. Notion's authorize URL takes NO
 *                               scope param — the mock asserts on this
 *                               via the recorded calls (the spec
 *                               verifies the dispatcher didn't add one).
 *   POST /v1/oauth/token      → access_token + refresh_token + bot_id +
 *                               workspace_id + workspace_name. JSON
 *                               request body, HTTP Basic auth required
 *                               (mock validates Authorization header
 *                               format — fails with 401 on missing/
 *                               malformed Basic auth so the spec
 *                               confirms V2 sent it).
 *   POST /v1/pages            → Records body + Authorization header +
 *                               Notion-Version header, returns a
 *                               synthetic page id. Validates the
 *                               Notion-Version header is "2022-06-28"
 *                               (Slice 9 pin) — fails 400 otherwise so
 *                               the spec confirms V2 sent it.
 *   GET  /v1/pages/{id}       → Returns injected page resource by id;
 *                               404 when not injected.
 *   PATCH /v1/pages/{id}      → Records body, returns a stub updated
 *                               page object.
 *   POST /v1/databases/{id}/query → Records body, returns the configured
 *                               results array (defaults to []).
 *   PATCH /v1/blocks/{id}/children → Records body, returns synthetic
 *                               block ids matching the input children
 *                               count.
 *   POST /v1/search           → Records body, returns the configured
 *                               results array (defaults to []).
 *
 * Control plane (test-only):
 *   POST /__injectPage   — inject a Notion page resource. Body: full
 *                          NotionPage shape. The next /v1/pages/{id}
 *                          GET returns it.
 *   POST /__reset        — clear all state.
 *   GET  /__inspect      — dump calls + injected resources; cross-process
 *                          seam.
 *
 * Listens on a fixed port (default 9879, override via NOTION_MOCK_PORT).
 * Different port from Slack (9876), Google (9877), Microsoft (9878) so
 * all four can run simultaneously under one global-setup. If the port is
 * busy, fail loud at start.
 */

export interface RecordedAuthorize {
  state: string;
  /**
   * Recorded so the spec can assert Notion's authorize URL has NO scope
   * param (Notion-specific — capabilities are integration-level).
   */
  scope: string | null;
  redirectUri: string | null;
  responseType: string | null;
  owner: string | null;
}

export interface RecordedTokenExchange {
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
}

export interface RecordedPagesCreate {
  authorization: string | undefined;
  notionVersion: string | undefined;
  contentType: string | undefined;
  body: Record<string, unknown>;
  responsePageId: string;
}

export interface RecordedPagesGet {
  authorization: string | undefined;
  notionVersion: string | undefined;
  url: string;
  pageId: string;
}

export interface RecordedPagesUpdate {
  authorization: string | undefined;
  notionVersion: string | undefined;
  pageId: string;
  body: Record<string, unknown>;
}

export interface RecordedDatabasesQuery {
  authorization: string | undefined;
  notionVersion: string | undefined;
  databaseId: string;
  body: Record<string, unknown>;
}

export interface RecordedBlocksAppend {
  authorization: string | undefined;
  notionVersion: string | undefined;
  blockId: string;
  body: Record<string, unknown>;
}

export interface RecordedSearch {
  authorization: string | undefined;
  notionVersion: string | undefined;
  body: Record<string, unknown>;
}

export interface InjectedPage {
  id: string;
  resource: Record<string, unknown>;
}

export interface MockNotionHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    pagesCreate: RecordedPagesCreate[];
    pagesGet: RecordedPagesGet[];
    pagesUpdate: RecordedPagesUpdate[];
    databasesQuery: RecordedDatabasesQuery[];
    blocksAppend: RecordedBlocksAppend[];
    search: RecordedSearch[];
  };
  pages: Map<string, InjectedPage>;
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.NOTION_MOCK_PORT ?? "9879");

interface MutableState {
  calls: MockNotionHandle["calls"];
  pages: Map<string, InjectedPage>;
  pageCounter: number;
  blockCounter: number;
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      pagesCreate: [],
      pagesGet: [],
      pagesUpdate: [],
      databasesQuery: [],
      blocksAppend: [],
      search: [],
    },
    pages: new Map(),
    pageCounter: 0,
    blockCounter: 0,
  };
}

export async function startMockNotionServer(opts: {
  appBaseUrl: string;
  port?: number;
}): Promise<MockNotionHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, state).catch((err) => {
      console.error("[mock-notion] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-notion handler crashed");
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
    get pages() {
      return state.pages;
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
  if (req.method === "GET" && url.pathname === "/v1/oauth/authorize") {
    const stateParam = url.searchParams.get("state");
    const scope = url.searchParams.get("scope"); // Notion: should be null
    const redirectUri = url.searchParams.get("redirect_uri");
    const responseType = url.searchParams.get("response_type");
    const owner = url.searchParams.get("owner");
    if (!stateParam) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing state");
      return;
    }
    state.calls.authorize.push({
      state: stateParam,
      scope,
      redirectUri,
      responseType,
      owner,
    });
    const callback = redirectUri
      ? new URL(redirectUri)
      : new URL("/api/integrations/oauth/notion/callback", appBaseUrl);
    callback.searchParams.set("code", `mock-notion-code-${Date.now()}`);
    callback.searchParams.set("state", stateParam);
    res.writeHead(302, { location: callback.toString() });
    res.end();
    return;
  }

  // ── Token exchange ──
  if (req.method === "POST" && url.pathname === "/v1/oauth/token") {
    const authHeader = req.headers.authorization;
    const contentType = req.headers["content-type"] as string | undefined;
    const body = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      // Notion expects JSON; record empty body for the spec to assert on.
    }
    state.calls.tokenExchange.push({
      authorization: authHeader,
      contentType,
      body,
      parsedBody: parsed,
    });

    // Validate Basic auth — Notion requires it. Fail loud so the spec
    // catches a missing-header regression.
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "error",
          status: 401,
          code: "unauthorized",
          message: "Authorization Basic credentials required.",
        }),
      );
      return;
    }
    if (parsed.grant_type !== "authorization_code") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "error",
          status: 400,
          code: "validation_error",
          message: "grant_type must be authorization_code.",
        }),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        access_token: "secret_notion-mock-e2e-access",
        token_type: "bearer",
        bot_id: "bot-mock-e2e-id",
        workspace_id: "ws-mock-e2e-id",
        workspace_name: "E2E Acme Workspace",
        workspace_icon: "https://example.test/icon.png",
        // Notion DOES return a refresh_token per current docs; Slice 9
        // intentionally drops it on the floor. The spec asserts
        // refresh_token is NOT stored.
        refresh_token: "secret_notion-mock-e2e-refresh",
        owner: {
          type: "user",
          user: { object: "user", id: "u-owner-mock-e2e" },
        },
        duplicated_template_id: null,
      }),
    );
    return;
  }

  // ── Notion-Version header validation helper ──
  // All /v1/* API calls MUST send Notion-Version: 2022-06-28 (Slice 9
  // pin). Routes below use this to fail loud on a regression.
  function requireNotionVersion(): boolean {
    const v = req.headers["notion-version"] as string | undefined;
    if (v !== "2022-06-28") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "error",
          status: 400,
          code: "validation_error",
          message: `Notion-Version header must be "2022-06-28" (Slice 9 pin); got ${JSON.stringify(v)}.`,
        }),
      );
      return false;
    }
    return true;
  }

  // ── /v1/pages (create) ──
  if (req.method === "POST" && url.pathname === "/v1/pages") {
    if (!requireNotionVersion()) return;
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore — record empty body
    }
    state.pageCounter += 1;
    const pageId = `mock-notion-page-${state.pageCounter}`;
    state.calls.pagesCreate.push({
      authorization: req.headers.authorization,
      notionVersion: req.headers["notion-version"] as string | undefined,
      contentType: req.headers["content-type"] as string | undefined,
      body: parsed,
      responsePageId: pageId,
    });

    // Echo a Notion page response with the new id + url + timestamps.
    const echoed = {
      object: "page",
      id: pageId,
      url: `https://www.notion.so/${pageId.replace(/-/g, "")}`,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      archived: false,
      parent: parsed.parent ?? null,
      properties: parsed.properties ?? {},
      icon: parsed.icon ?? null,
      cover: parsed.cover ?? null,
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(echoed));
    return;
  }

  // ── /v1/pages/{id} GET / PATCH ──
  const pageMatch = url.pathname.match(/^\/v1\/pages\/([^/]+)$/);
  if (pageMatch) {
    const pageId = decodeURIComponent(pageMatch[1]!);
    if (req.method === "GET") {
      if (!requireNotionVersion()) return;
      state.calls.pagesGet.push({
        authorization: req.headers.authorization,
        notionVersion: req.headers["notion-version"] as string | undefined,
        url: req.url ?? "",
        pageId,
      });
      const stored = state.pages.get(pageId);
      if (!stored) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            object: "error",
            status: 404,
            code: "object_not_found",
            message: `Could not find page with ID: ${pageId}.`,
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(stored.resource));
      return;
    }
    if (req.method === "PATCH") {
      if (!requireNotionVersion()) return;
      const bodyText = await readBody(req);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        // ignore
      }
      state.calls.pagesUpdate.push({
        authorization: req.headers.authorization,
        notionVersion: req.headers["notion-version"] as string | undefined,
        pageId,
        body: parsed,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "page",
          id: pageId,
          url: `https://www.notion.so/${pageId.replace(/-/g, "")}`,
          archived: parsed.archived ?? false,
          last_edited_time: new Date().toISOString(),
          properties: parsed.properties ?? {},
        }),
      );
      return;
    }
  }

  // ── /v1/databases/{id}/query (POST) ──
  const dbQueryMatch = url.pathname.match(
    /^\/v1\/databases\/([^/]+)\/query$/,
  );
  if (dbQueryMatch && req.method === "POST") {
    if (!requireNotionVersion()) return;
    const databaseId = decodeURIComponent(dbQueryMatch[1]!);
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore
    }
    state.calls.databasesQuery.push({
      authorization: req.headers.authorization,
      notionVersion: req.headers["notion-version"] as string | undefined,
      databaseId,
      body: parsed,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        results: [],
        has_more: false,
        next_cursor: null,
      }),
    );
    return;
  }

  // ── /v1/blocks/{id}/children (PATCH — append children) ──
  const blocksMatch = url.pathname.match(
    /^\/v1\/blocks\/([^/]+)\/children$/,
  );
  if (blocksMatch && req.method === "PATCH") {
    if (!requireNotionVersion()) return;
    const blockId = decodeURIComponent(blocksMatch[1]!);
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore
    }
    state.calls.blocksAppend.push({
      authorization: req.headers.authorization,
      notionVersion: req.headers["notion-version"] as string | undefined,
      blockId,
      body: parsed,
    });
    const childrenIn = (parsed.children as unknown[]) ?? [];
    const results = childrenIn.map((c) => {
      state.blockCounter += 1;
      const child = c as { type?: string };
      return {
        object: "block",
        id: `mock-notion-block-${state.blockCounter}`,
        type: child.type ?? "paragraph",
      };
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", results }));
    return;
  }

  // ── /v1/search ──
  if (req.method === "POST" && url.pathname === "/v1/search") {
    if (!requireNotionVersion()) return;
    const bodyText = await readBody(req);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // ignore
    }
    state.calls.search.push({
      authorization: req.headers.authorization,
      notionVersion: req.headers["notion-version"] as string | undefined,
      body: parsed,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        results: [],
        has_more: false,
        next_cursor: null,
      }),
    );
    return;
  }

  // ── Control plane ──
  if (req.method === "POST" && url.pathname === "/__injectPage") {
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
    state.pages.set(id, { id, resource: payload });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, id }));
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
        pageIds: Array.from(state.pages.keys()),
      }),
    );
    return;
  }

  // 404 for anything else.
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-notion: unhandled ${req.method} ${url.pathname}`);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
