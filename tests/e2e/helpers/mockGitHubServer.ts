import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { createHmac } from "node:crypto";

/**
 * Standalone mock GitHub (OAuth App + REST + per-repo webhook lifecycle)
 * server for the Slice 14b e2e walkthrough.
 *
 * V2's developer-tools provider — single-app-secret webhook
 * (`X-Hub-Signature-256: sha256=<hex>` HMAC-SHA256-hex over raw body,
 * keyed with `GITHUB_WEBHOOK_SECRET`).
 *
 * URL convention: V2's GitHub code targets two production hosts:
 *   - `https://github.com/login/oauth/{authorize,access_token}` — OAuth.
 *   - `https://api.github.com/...` — REST.
 *
 * The dev server overrides both via `GITHUB_AUTHORIZE_BASE` +
 * `GITHUB_API_BASE` (set in `playwright.config.ts`) pointing at this
 * mock. The mock distinguishes by path prefix:
 *   - `/login/oauth/...` → OAuth.
 *   - `/user`, `/repos/...`, `/gists`, `/repos/.../hooks` → REST.
 *
 * Routes:
 *   GET  /login/oauth/authorize           → 302 to redirect_uri with state +
 *                                           synthetic code. Records absence
 *                                           of PKCE params (anti-test).
 *   POST /login/oauth/access_token        → returns access_token + scope.
 *                                           BODY-AUTH (client_secret in
 *                                           form body, NOT Basic header)
 *                                           and Accept: application/json
 *                                           required. NO refresh_token
 *                                           issued (GitHub OAuth Apps).
 *   GET  /user                            → returns {login, id, name,
 *                                           avatar_url}. Requires
 *                                           Authorization: token <token>
 *                                           (NOT Bearer — V2 anti-test).
 *   GET  /repos/{owner}/{repo}            → reposGet, returns
 *                                           default_branch. Used by PR-G6
 *                                           auto-detect.
 *   POST /user/repos                      → userReposCreate.
 *   POST /repos/{owner}/{repo}/issues     → issuesCreate.
 *   POST /repos/{owner}/{repo}/pulls      → pullsCreate.
 *   POST /repos/{owner}/{repo}/git/refs   → gitRefsCreate (create_branch).
 *   GET  /repos/{owner}/{repo}/git/ref/heads/{branch} → gitRefGet
 *                                          (create_branch source SHA).
 *   POST /gists                           → gistsCreate.
 *   POST /repos/{owner}/{repo}/issues/{n}/comments → issueCommentsCreate.
 *   POST /repos/{owner}/{repo}/hooks      → repoHooksCreate (webhook
 *                                           lifecycle).
 *   DELETE /repos/{owner}/{repo}/hooks/{id} → repoHooksDelete.
 *
 * Control plane (test-only):
 *   POST /__sendPushEvent          — signs + POSTs a GitHub push event to
 *                                    a created repo webhook. Body:
 *                                    `{ hookId, body?, deliveryId? }`.
 *   POST /__replayLastPushEvent    — replay the last sent event with the
 *                                    SAME signed body, signature, AND
 *                                    X-GitHub-Delivery id. Tests dedup-
 *                                    by-delivery-id.
 *   POST /__sendInvalidSignaturePush — POSTs a push body with a
 *                                    deliberately wrong X-Hub-Signature-256.
 *                                    V2 must 401.
 *   POST /__sendUnsupportedEvent   — sign + POST an event whose X-GitHub-Event
 *                                    is NOT `push` (e.g. `pull_request`).
 *                                    V2 must 200-ack without dispatch.
 *   POST /__sendPingEvent          — sign + POST a GitHub `ping` handshake.
 *                                    V2 must 200 with `{ message: "pong" }`.
 *   POST /__sendBranchMismatchPush — sign + POST a push for a branch other
 *                                    than the trigger's configured branch.
 *                                    V2 must 200-ack without dispatch.
 *   POST /__reset                  — clear all state.
 *   GET  /__inspect                — dump calls + state.
 *
 * Listens on a fixed port (default 9884, override via GITHUB_MOCK_PORT).
 * Different port from Slack (9876), Google (9877), Microsoft (9878),
 * Notion (9879), Airtable (9880), Stripe (9881), Shopify (9882),
 * HubSpot (9883).
 */

export interface RecordedAuthorize {
  state: string;
  redirectUri: string | null;
  scope: string | null;
  clientId: string | null;
  /** PKCE absence proof — GitHub doesn't accept these. */
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

export interface RecordedTokenExchange {
  authorization: string | undefined;
  contentType: string | undefined;
  accept: string | undefined;
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedUserCall {
  authorization: string | undefined;
  accept: string | undefined;
  apiVersion: string | undefined;
}

export interface RecordedRestCall {
  method: string;
  path: string;
  authorization: string | undefined;
  accept: string | undefined;
  apiVersion: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
}

export interface RecordedWebhookCreate {
  owner: string;
  repo: string;
  authorization: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
  events: string[] | null;
  url: string | null;
  hasSecret: boolean;
  responseHookId: number;
}

export interface RecordedWebhookDelete {
  owner: string;
  repo: string;
  hookId: number;
  authorization: string | undefined;
}

export interface RecordedWebhookEvent {
  hookId: number;
  url: string;
  eventName: string;
  deliveryId: string;
  status: number;
  responseBody: string;
}

export interface MockGitHubHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    userCalls: RecordedUserCall[];
    reposGet: RecordedRestCall[];
    userReposCreate: RecordedRestCall[];
    issuesCreate: RecordedRestCall[];
    pullsCreate: RecordedRestCall[];
    gitRefsCreate: RecordedRestCall[];
    gitRefGet: RecordedRestCall[];
    gistsCreate: RecordedRestCall[];
    issueCommentsCreate: RecordedRestCall[];
    webhookCreate: RecordedWebhookCreate[];
    webhookDelete: RecordedWebhookDelete[];
    webhookEvent: RecordedWebhookEvent[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.GITHUB_MOCK_PORT ?? "9884");

interface MockHook {
  id: number;
  owner: string;
  repo: string;
  url: string;
  secret: string;
  events: string[];
}

interface LastPushEvent {
  hookId: number;
  rawBody: string;
  signature: string;
  deliveryId: string;
}

interface MutableState {
  calls: MockGitHubHandle["calls"];
  hooks: Map<number, MockHook>;
  lastHookId: number | null;
  hookCounter: number;
  issueCounter: number;
  prCounter: number;
  repoCounter: number;
  gistCounter: number;
  commentCounter: number;
  branchCounter: number;
  deliveryCounter: number;
  /** Most-recently-created repo's default_branch (for PR-G6 lookup). */
  lastCreatedDefaultBranch: string;
  lastEvent: LastPushEvent | null;
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      userCalls: [],
      reposGet: [],
      userReposCreate: [],
      issuesCreate: [],
      pullsCreate: [],
      gitRefsCreate: [],
      gitRefGet: [],
      gistsCreate: [],
      issueCommentsCreate: [],
      webhookCreate: [],
      webhookDelete: [],
      webhookEvent: [],
    },
    hooks: new Map(),
    lastHookId: null,
    hookCounter: 0,
    issueCounter: 0,
    prCounter: 0,
    repoCounter: 0,
    gistCounter: 0,
    commentCounter: 0,
    branchCounter: 0,
    deliveryCounter: 0,
    lastCreatedDefaultBranch: "main",
    lastEvent: null,
  };
}

export async function startMockGitHubServer(opts: {
  appBaseUrl: string;
  webhookSecret: string;
  port?: number;
}): Promise<MockGitHubHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, opts.webhookSecret, state).catch(
      (err) => {
        console.error("[mock-github] handler crashed", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end("mock-github handler crashed");
        }
      },
    );
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
  webhookSecret: string,
  state: MutableState,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://placeholder");

  // ── Control plane ──
  if (req.method === "POST" && url.pathname === "/__sendPushEvent") {
    return handleSendPushEvent(req, res, webhookSecret, state);
  }
  if (req.method === "POST" && url.pathname === "/__replayLastPushEvent") {
    return handleReplayLastPushEvent(res, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendInvalidSignaturePush") {
    return handleSendInvalidSigPush(req, res, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendUnsupportedEvent") {
    return handleSendUnsupportedEvent(req, res, webhookSecret, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendPingEvent") {
    return handleSendPingEvent(req, res, webhookSecret, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendBranchMismatchPush") {
    return handleSendBranchMismatchPush(req, res, webhookSecret, state);
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
        hooks: Array.from(state.hooks.values()),
      }),
    );
    return;
  }

  // ── OAuth ──
  if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
    return handleAuthorize(req, res, appBaseUrl, state, url);
  }
  if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
    return handleTokenExchange(req, res, state);
  }

  // ── REST: /user ──
  if (req.method === "GET" && url.pathname === "/user") {
    return handleUserMe(req, res, state);
  }

  // ── REST: repos ──
  // GET /repos/{owner}/{repo} — reposGet (PR-G6 lookup).
  const reposGetMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
  if (req.method === "GET" && reposGetMatch) {
    return handleReposGet(
      req,
      res,
      state,
      decodeURIComponent(reposGetMatch[1]!),
      decodeURIComponent(reposGetMatch[2]!),
    );
  }

  // POST /user/repos — userReposCreate.
  if (req.method === "POST" && url.pathname === "/user/repos") {
    return handleUserReposCreate(req, res, state);
  }

  // POST /repos/{owner}/{repo}/issues — issuesCreate.
  const issuesMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/issues$/);
  if (req.method === "POST" && issuesMatch) {
    return handleIssuesCreate(
      req,
      res,
      state,
      decodeURIComponent(issuesMatch[1]!),
      decodeURIComponent(issuesMatch[2]!),
    );
  }

  // POST /repos/{owner}/{repo}/pulls — pullsCreate.
  const pullsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls$/);
  if (req.method === "POST" && pullsMatch) {
    return handlePullsCreate(
      req,
      res,
      state,
      decodeURIComponent(pullsMatch[1]!),
      decodeURIComponent(pullsMatch[2]!),
    );
  }

  // GET /repos/{owner}/{repo}/git/ref/heads/{branch} — gitRefGet.
  const gitRefMatch = url.pathname.match(
    /^\/repos\/([^/]+)\/([^/]+)\/git\/ref\/heads\/(.+)$/,
  );
  if (req.method === "GET" && gitRefMatch) {
    return handleGitRefGet(
      req,
      res,
      state,
      decodeURIComponent(gitRefMatch[1]!),
      decodeURIComponent(gitRefMatch[2]!),
      decodeURIComponent(gitRefMatch[3]!),
    );
  }

  // POST /repos/{owner}/{repo}/git/refs — gitRefsCreate.
  const gitRefsMatch = url.pathname.match(
    /^\/repos\/([^/]+)\/([^/]+)\/git\/refs$/,
  );
  if (req.method === "POST" && gitRefsMatch) {
    return handleGitRefsCreate(
      req,
      res,
      state,
      decodeURIComponent(gitRefsMatch[1]!),
      decodeURIComponent(gitRefsMatch[2]!),
    );
  }

  // POST /gists — gistsCreate.
  if (req.method === "POST" && url.pathname === "/gists") {
    return handleGistsCreate(req, res, state);
  }

  // POST /repos/{owner}/{repo}/issues/{n}/comments — issueCommentsCreate.
  const commentMatch = url.pathname.match(
    /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/,
  );
  if (req.method === "POST" && commentMatch) {
    return handleIssueCommentsCreate(
      req,
      res,
      state,
      decodeURIComponent(commentMatch[1]!),
      decodeURIComponent(commentMatch[2]!),
      Number(commentMatch[3]!),
    );
  }

  // POST /repos/{owner}/{repo}/hooks — repoHooksCreate.
  const hooksCreateMatch = url.pathname.match(
    /^\/repos\/([^/]+)\/([^/]+)\/hooks$/,
  );
  if (req.method === "POST" && hooksCreateMatch) {
    return handleHooksCreate(
      req,
      res,
      state,
      decodeURIComponent(hooksCreateMatch[1]!),
      decodeURIComponent(hooksCreateMatch[2]!),
    );
  }

  // DELETE /repos/{owner}/{repo}/hooks/{id} — repoHooksDelete.
  const hooksDeleteMatch = url.pathname.match(
    /^\/repos\/([^/]+)\/([^/]+)\/hooks\/(\d+)$/,
  );
  if (req.method === "DELETE" && hooksDeleteMatch) {
    return handleHooksDelete(
      req,
      res,
      state,
      decodeURIComponent(hooksDeleteMatch[1]!),
      decodeURIComponent(hooksDeleteMatch[2]!),
      Number(hooksDeleteMatch[3]!),
    );
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-github: unhandled ${req.method} ${url.pathname}`);
}

// ── OAuth handlers ─────────────────────────────────────────────────────

async function handleAuthorize(
  _req: IncomingMessage,
  res: ServerResponse,
  appBaseUrl: string,
  state: MutableState,
  url: URL,
): Promise<void> {
  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("missing state");
    return;
  }
  state.calls.authorize.push({
    state: stateParam,
    redirectUri: url.searchParams.get("redirect_uri"),
    scope: url.searchParams.get("scope"),
    clientId: url.searchParams.get("client_id"),
    codeChallenge: url.searchParams.get("code_challenge"),
    codeChallengeMethod: url.searchParams.get("code_challenge_method"),
  });
  const callback = url.searchParams.get("redirect_uri")
    ? new URL(url.searchParams.get("redirect_uri")!)
    : new URL("/api/integrations/oauth/github/callback", appBaseUrl);
  callback.searchParams.set("code", `mock-github-code-${Date.now()}`);
  callback.searchParams.set("state", stateParam);
  res.writeHead(302, { location: callback.toString() });
  res.end();
}

async function handleTokenExchange(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const contentType = req.headers["content-type"] as string | undefined;
  const accept = req.headers.accept as string | undefined;
  const body = await readBody(req);
  // GitHub uses form-urlencoded body-auth (NOT Basic auth header, NOT
  // JSON body). The mock validates Content-Type and that client_secret
  // is present.
  const parsed = parseFormBody(body);

  state.calls.tokenExchange.push({
    authorization: authHeader,
    contentType,
    accept,
    body,
    parsedBody: parsed,
  });

  // Reject Basic auth header (anti-test — V2 must NOT regress into
  // Basic auth).
  if (authHeader && authHeader.startsWith("Basic ")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_client",
        error_description:
          "GitHub uses form-urlencoded body-auth (client_secret in body), not Basic auth header.",
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
  if (!parsed.client_secret) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_client",
        error_description: "client_secret required in body.",
      }),
    );
    return;
  }
  if (!parsed.code) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_grant",
        error_description: "code required in body.",
      }),
    );
    return;
  }

  // GitHub's OAuth-App token response has NO refresh_token, NO
  // expires_in. Returns access_token + scope (comma-separated, with
  // optional whitespace after the commas).
  // If the request set Accept: application/json (V2 does), respond JSON.
  // Otherwise GitHub defaults to form-encoded — V2 should never hit that
  // path so we don't bother modelling it.
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      access_token: "github-mock-e2e-access",
      token_type: "bearer",
      scope: "repo,read:org,gist",
    }),
  );
}

async function handleUserMe(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  state.calls.userCalls.push({
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      login: "octocat-e2e",
      id: 583231,
      name: "Octocat E2E",
      avatar_url: "https://example.test/avatar/octocat-e2e.png",
    }),
  );
}

// ── REST handlers ─────────────────────────────────────────────────────

async function handleReposGet(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
): Promise<void> {
  state.calls.reposGet.push({
    method: "GET",
    path: `/repos/${owner}/${repo}`,
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body: "",
    parsedBody: {},
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: 4242,
      name: repo,
      full_name: `${owner}/${repo}`,
      description: null,
      private: true,
      html_url: `https://github.example.test/${owner}/${repo}`,
      clone_url: `https://github.example.test/${owner}/${repo}.git`,
      ssh_url: `git@github.example.test:${owner}/${repo}.git`,
      default_branch: state.lastCreatedDefaultBranch,
      homepage: null,
    }),
  );
}

async function handleUserReposCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const body = await readBody(req);
  const parsed = jsonOrEmpty(body);
  state.repoCounter += 1;
  const repoId = state.repoCounter * 1000 + 1;
  const name = typeof parsed.name === "string" ? parsed.name : "mock-repo";

  state.calls.userReposCreate.push({
    method: "POST",
    path: "/user/repos",
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body,
    parsedBody: parsed,
  });

  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: repoId,
      name,
      full_name: `octocat-e2e/${name}`,
      description: parsed.description ?? null,
      private: parsed.private ?? false,
      html_url: `https://github.example.test/octocat-e2e/${name}`,
      clone_url: `https://github.example.test/octocat-e2e/${name}.git`,
      ssh_url: `git@github.example.test:octocat-e2e/${name}.git`,
      default_branch: "main",
      homepage: parsed.homepage ?? null,
    }),
  );
}

async function handleIssuesCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
): Promise<void> {
  const body = await readBody(req);
  const parsed = jsonOrEmpty(body);
  state.issueCounter += 1;
  const number = state.issueCounter;
  const id = 10000 + number;

  state.calls.issuesCreate.push({
    method: "POST",
    path: `/repos/${owner}/${repo}/issues`,
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body,
    parsedBody: parsed,
  });

  const labels = Array.isArray(parsed.labels)
    ? (parsed.labels as string[]).map((name) => ({ name }))
    : [];
  const assignees = Array.isArray(parsed.assignees)
    ? (parsed.assignees as string[]).map((login) => ({ login, id: 1 }))
    : [];

  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id,
      number,
      title: parsed.title ?? "Mock Issue",
      body: parsed.body ?? null,
      state: "open",
      html_url: `https://github.example.test/${owner}/${repo}/issues/${number}`,
      labels,
      assignees,
      user: { login: "octocat-e2e", id: 583231 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      closed_at: null,
    }),
  );
}

async function handlePullsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
): Promise<void> {
  const body = await readBody(req);
  const parsed = jsonOrEmpty(body);
  state.prCounter += 1;
  const number = state.prCounter;
  const id = 20000 + number;

  state.calls.pullsCreate.push({
    method: "POST",
    path: `/repos/${owner}/${repo}/pulls`,
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body,
    parsedBody: parsed,
  });

  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id,
      number,
      title: parsed.title ?? "Mock PR",
      body: parsed.body ?? null,
      state: "open",
      draft: parsed.draft ?? false,
      html_url: `https://github.example.test/${owner}/${repo}/pull/${number}`,
      head: { ref: parsed.head ?? "feature", sha: "headsha000" },
      base: { ref: parsed.base ?? "main", sha: "basesha000" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      merged: false,
      mergeable: null,
    }),
  );
}

async function handleGitRefGet(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  state.calls.gitRefGet.push({
    method: "GET",
    path: `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body: "",
    parsedBody: { branch },
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      ref: `refs/heads/${branch}`,
      url: `https://github.example.test/api/v3/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      object: {
        sha: `srcsha-${branch}`,
        type: "commit",
        url: `https://github.example.test/api/v3/repos/${owner}/${repo}/git/commits/srcsha-${branch}`,
      },
    }),
  );
}

async function handleGitRefsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
): Promise<void> {
  const body = await readBody(req);
  const parsed = jsonOrEmpty(body);
  state.branchCounter += 1;
  state.calls.gitRefsCreate.push({
    method: "POST",
    path: `/repos/${owner}/${repo}/git/refs`,
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body,
    parsedBody: parsed,
  });
  const ref =
    typeof parsed.ref === "string" ? parsed.ref : `refs/heads/branch-${state.branchCounter}`;
  const sha = typeof parsed.sha === "string" ? parsed.sha : `newsha-${state.branchCounter}`;
  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      ref,
      url: `https://github.example.test/api/v3/repos/${owner}/${repo}/git/refs/${ref.replace("refs/", "")}`,
      object: { sha, type: "commit" },
    }),
  );
}

async function handleGistsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const body = await readBody(req);
  const parsed = jsonOrEmpty(body);
  state.gistCounter += 1;
  const id = `mock-gist-${state.gistCounter}`;

  state.calls.gistsCreate.push({
    method: "POST",
    path: "/gists",
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body,
    parsedBody: parsed,
  });

  // Echo back the files map. V2 sends `{ filename: { content } }`; we
  // echo the filenames so the handler's `Object.keys(gist.files)`
  // extraction works.
  const filesIn = (parsed.files ?? {}) as Record<string, Record<string, string>>;
  const files: Record<string, unknown> = {};
  for (const [name, val] of Object.entries(filesIn)) {
    files[name] = {
      filename: name,
      type: "text/plain",
      language: null,
      raw_url: `https://gist.example.test/${id}/raw/${encodeURIComponent(name)}`,
      size: typeof val.content === "string" ? val.content.length : 0,
      content: val.content,
    };
  }

  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id,
      description: parsed.description ?? null,
      public: parsed.public ?? false,
      html_url: `https://gist.example.test/${id}`,
      url: `https://api.github.example.test/gists/${id}`,
      files,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  );
}

async function handleIssueCommentsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<void> {
  const body = await readBody(req);
  const parsed = jsonOrEmpty(body);
  state.commentCounter += 1;
  const id = 30000 + state.commentCounter;

  state.calls.issueCommentsCreate.push({
    method: "POST",
    path: `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    authorization: req.headers.authorization,
    accept: req.headers.accept as string | undefined,
    apiVersion: req.headers["x-github-api-version"] as string | undefined,
    body,
    parsedBody: parsed,
  });

  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id,
      body: parsed.body ?? "",
      html_url: `https://github.example.test/${owner}/${repo}/issues/${issueNumber}#issuecomment-${id}`,
      user: { login: "octocat-e2e", id: 583231 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  );
}

// ── Webhook lifecycle handlers ─────────────────────────────────────────

async function handleHooksCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
): Promise<void> {
  const body = await readBody(req);
  const parsed = jsonOrEmpty(body);
  const config = (parsed.config ?? {}) as Record<string, unknown>;
  const events = Array.isArray(parsed.events)
    ? (parsed.events as string[])
    : null;
  const url = typeof config.url === "string" ? config.url : null;
  const secret = typeof config.secret === "string" ? config.secret : "";

  state.hookCounter += 1;
  const hookId = state.hookCounter * 100 + 1;
  if (url) {
    state.hooks.set(hookId, {
      id: hookId,
      owner,
      repo,
      url,
      secret,
      events: events ?? ["push"],
    });
    state.lastHookId = hookId;
  }

  state.calls.webhookCreate.push({
    owner,
    repo,
    authorization: req.headers.authorization,
    body,
    parsedBody: parsed,
    events,
    url,
    hasSecret: secret.length > 0,
    responseHookId: hookId,
  });

  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: hookId,
      type: "Repository",
      name: "web",
      active: parsed.active ?? true,
      events: events ?? ["push"],
      config: {
        url,
        content_type: config.content_type ?? "json",
        insecure_ssl: config.insecure_ssl ?? "0",
        // Don't echo the secret back — GitHub doesn't, and tests
        // shouldn't depend on it.
      },
      url: `https://api.github.example.test/repos/${owner}/${repo}/hooks/${hookId}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  );
}

async function handleHooksDelete(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  owner: string,
  repo: string,
  hookId: number,
): Promise<void> {
  state.calls.webhookDelete.push({
    owner,
    repo,
    hookId,
    authorization: req.headers.authorization,
  });
  state.hooks.delete(hookId);
  // GitHub returns 204 No Content on success.
  res.writeHead(204);
  res.end();
}

// ── Control-plane handlers ─────────────────────────────────────────────

interface SendPushPayload {
  hookId?: number;
  deliveryId?: string;
  body?: Record<string, unknown>;
}

async function handleSendPushEvent(
  req: IncomingMessage,
  res: ServerResponse,
  webhookSecret: string,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendPushPayload = {};
  try {
    payload = JSON.parse(bodyText) as SendPushPayload;
  } catch {
    // empty payload OK
  }
  const hookId = payload.hookId ?? state.lastHookId ?? 0;
  const hook = state.hooks.get(hookId);
  if (!hook) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "hook not found", hookId }));
    return;
  }

  state.deliveryCounter += 1;
  const eventBody = JSON.stringify(payload.body ?? defaultPushBody(hook));
  const signature = `sha256=${createHmac("sha256", hook.secret).update(eventBody, "utf8").digest("hex")}`;
  const deliveryId =
    payload.deliveryId ?? `mock-gh-delivery-${state.deliveryCounter}`;

  state.lastEvent = {
    hookId,
    rawBody: eventBody,
    signature,
    deliveryId,
  };

  const resp = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
      "x-github-event": "push",
      "x-github-delivery": deliveryId,
      "x-github-hook-id": String(hookId),
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    hookId,
    url: hook.url,
    eventName: "push",
    deliveryId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      status: resp.status,
      body: responseBody,
      deliveryId,
    }),
  );
  // Defensive: assert that the secret the mock signs with matches the
  // dev-server secret. If they diverge, signature verification fails
  // and the receive route returns 401 — the spec catches this. We
  // intentionally don't enforce equality at this layer; the mismatch
  // surfaces as a clear test failure.
  void webhookSecret;
}

async function handleReplayLastPushEvent(
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  if (!state.lastEvent) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no prior event to replay" }));
    return;
  }
  const hook = state.hooks.get(state.lastEvent.hookId);
  if (!hook) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "hook gone" }));
    return;
  }
  const last = state.lastEvent;
  const resp = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": last.signature,
      "x-github-event": "push",
      "x-github-delivery": last.deliveryId,
      "x-github-hook-id": String(last.hookId),
    },
    body: last.rawBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    hookId: last.hookId,
    url: hook.url,
    eventName: "push",
    deliveryId: last.deliveryId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ status: resp.status, body: responseBody }),
  );
}

interface SendInvalidSigPayload {
  hookId?: number;
}

async function handleSendInvalidSigPush(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendInvalidSigPayload = {};
  try {
    payload = JSON.parse(bodyText) as SendInvalidSigPayload;
  } catch {
    // empty
  }
  const hookId = payload.hookId ?? state.lastHookId ?? 0;
  const hook = state.hooks.get(hookId);
  if (!hook) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "hook not found" }));
    return;
  }
  const eventBody = JSON.stringify(defaultPushBody(hook));
  // Deliberately wrong signature — 64 zero hex chars.
  const wrongSig = `sha256=${"0".repeat(64)}`;
  const resp = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": wrongSig,
      "x-github-event": "push",
      "x-github-delivery": `mock-gh-bad-sig-${Date.now()}`,
      "x-github-hook-id": String(hookId),
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

interface SendUnsupportedEventPayload {
  hookId?: number;
  eventName?: string;
}

async function handleSendUnsupportedEvent(
  req: IncomingMessage,
  res: ServerResponse,
  _webhookSecret: string,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendUnsupportedEventPayload = {};
  try {
    payload = JSON.parse(bodyText) as SendUnsupportedEventPayload;
  } catch {
    // empty
  }
  const hookId = payload.hookId ?? state.lastHookId ?? 0;
  const hook = state.hooks.get(hookId);
  if (!hook) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "hook not found" }));
    return;
  }
  const eventName = payload.eventName ?? "pull_request";
  const eventBody = JSON.stringify({ action: "opened", number: 42 });
  // SIGN it correctly — V2 must still see this as a valid signature and
  // then 200-ack on unsupported_event.
  const signature = `sha256=${createHmac("sha256", hook.secret).update(eventBody, "utf8").digest("hex")}`;
  state.deliveryCounter += 1;
  const deliveryId = `mock-gh-unsupported-${state.deliveryCounter}`;
  const resp = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
      "x-github-event": eventName,
      "x-github-delivery": deliveryId,
      "x-github-hook-id": String(hookId),
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    hookId,
    url: hook.url,
    eventName,
    deliveryId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ status: resp.status, body: responseBody, eventName }),
  );
}

interface SendPingPayload {
  hookId?: number;
}

async function handleSendPingEvent(
  req: IncomingMessage,
  res: ServerResponse,
  _webhookSecret: string,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendPingPayload = {};
  try {
    payload = JSON.parse(bodyText) as SendPingPayload;
  } catch {
    // empty
  }
  const hookId = payload.hookId ?? state.lastHookId ?? 0;
  const hook = state.hooks.get(hookId);
  if (!hook) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "hook not found" }));
    return;
  }
  // GitHub's ping body shape: { zen, hook_id, hook }. Signed.
  const eventBody = JSON.stringify({
    zen: "Speak like a human.",
    hook_id: hookId,
    hook: { id: hookId, type: "Repository", name: "web" },
  });
  const signature = `sha256=${createHmac("sha256", hook.secret).update(eventBody, "utf8").digest("hex")}`;
  state.deliveryCounter += 1;
  const deliveryId = `mock-gh-ping-${state.deliveryCounter}`;
  const resp = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
      "x-github-event": "ping",
      "x-github-delivery": deliveryId,
      "x-github-hook-id": String(hookId),
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    hookId,
    url: hook.url,
    eventName: "ping",
    deliveryId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

interface SendBranchMismatchPayload {
  hookId?: number;
  branch?: string;
}

async function handleSendBranchMismatchPush(
  req: IncomingMessage,
  res: ServerResponse,
  _webhookSecret: string,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendBranchMismatchPayload = {};
  try {
    payload = JSON.parse(bodyText) as SendBranchMismatchPayload;
  } catch {
    // empty
  }
  const hookId = payload.hookId ?? state.lastHookId ?? 0;
  const hook = state.hooks.get(hookId);
  if (!hook) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "hook not found" }));
    return;
  }
  const branch = payload.branch ?? "feature/different";
  const eventBody = JSON.stringify({
    ref: `refs/heads/${branch}`,
    before: "old",
    after: "new",
    repository: {
      full_name: `${hook.owner}/${hook.repo}`,
      name: hook.repo,
      owner: { login: hook.owner },
    },
    head_commit: { id: "newsha", message: "mismatched branch push", timestamp: new Date().toISOString() },
    commits: [{ id: "newsha", message: "mismatched branch push" }],
    pusher: { name: "octocat" },
  });
  const signature = `sha256=${createHmac("sha256", hook.secret).update(eventBody, "utf8").digest("hex")}`;
  state.deliveryCounter += 1;
  const deliveryId = `mock-gh-mismatch-${state.deliveryCounter}`;
  const resp = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
      "x-github-event": "push",
      "x-github-delivery": deliveryId,
      "x-github-hook-id": String(hookId),
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    hookId,
    url: hook.url,
    eventName: "push",
    deliveryId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ status: resp.status, body: responseBody, branch }),
  );
}

// ── helpers ────────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

function jsonOrEmpty(body: string): Record<string, unknown> {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function defaultPushBody(hook: MockHook): Record<string, unknown> {
  return {
    ref: "refs/heads/main",
    before: "oldsha000",
    after: "newsha000",
    repository: {
      id: 4242,
      name: hook.repo,
      full_name: `${hook.owner}/${hook.repo}`,
      owner: { login: hook.owner, id: 583231 },
      private: true,
    },
    pusher: { name: "octocat-e2e", email: "octocat-e2e@example.test" },
    sender: { login: "octocat-e2e", id: 583231 },
    head_commit: {
      id: "newsha000",
      message: "E2E push commit",
      timestamp: new Date().toISOString(),
      author: {
        name: "Octocat E2E",
        email: "octocat-e2e@example.test",
        username: "octocat-e2e",
      },
      url: `https://github.example.test/${hook.owner}/${hook.repo}/commit/newsha000`,
      added: ["a.txt"],
      modified: ["b.txt"],
      removed: [],
    },
    commits: [
      {
        id: "newsha000",
        message: "E2E push commit",
        author: { name: "Octocat E2E" },
      },
    ],
    compare: `https://github.example.test/${hook.owner}/${hook.repo}/compare/oldsha000...newsha000`,
    created: false,
    deleted: false,
    forced: false,
  };
}
