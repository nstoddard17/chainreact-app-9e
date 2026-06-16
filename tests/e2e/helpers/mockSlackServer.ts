import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

/**
 * Standalone mock Slack server for the Slice 1 e2e walkthrough.
 *
 * Routes (all are sized to V2's actual call patterns — nothing more):
 *   GET  /oauth/v2/authorize   → 302 redirect to V2's callback with the
 *                                preserved state and a synthetic code.
 *                                Replaces the real Slack consent screen so
 *                                Playwright never has to drive a slack.com
 *                                page (which would 1. require credentials
 *                                and 2. fight Slack's CSP/WAF).
 *   POST /api/oauth.v2.access  → returns a canned token-exchange response
 *                                with a recognizable bot token.
 *   POST /api/chat.postMessage → returns a canned success response and
 *                                records the request body for assertions.
 *
 * Listens on a fixed port (default 9876, override via env). Fixed port keeps
 * the env vars Playwright passes to the dev server static across the run —
 * no inter-process URL discovery dance. If the port is in use, fail loud at
 * start so the test runner reports it cleanly.
 */

export interface RecordedTokenExchange {
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedChatPostMessage {
  authorization: string | undefined;
  body: { channel: string; text: string };
}

/**
 * Generic recorder shape used for the Slack 2.3 endpoints (channel
 * admin + user lookups). Body is the parsed JSON the handler received.
 */
export interface RecordedSlackApiCall {
  authorization: string | undefined;
  body: Record<string, unknown>;
}

/**
 * Slack 2.4 — recorder for the raw bytes POST to the Slack-issued
 * `upload_url`. The handler in `_uploadBytesToSlack.ts` sends a
 * direct `application/octet-stream` body (NOT a Slack Web API JSON
 * call) — distinct shape from `RecordedSlackApiCall`.
 *
 * `bytesBase64` is the full payload base64-encoded so specs can
 * round-trip the byte stream they staged. `byteLength` is the
 * unmodified raw length; assertions usually only need this.
 */
export interface RecordedRawUpload {
  /** Path segment after `/upload/` — the per-upload token Slack returns. */
  uploadToken: string;
  /** Authorization header (should be UNDEFINED — the URL is pre-signed). */
  authorization: string | undefined;
  /** Content-Type the wrapper attached. */
  contentType: string | undefined;
  byteLength: number;
  bytesBase64: string;
}

/**
 * Slack 2.4 — recorder for the bot-bearered GET against the mock's
 * stand-in for `url_private_download`. The Slack-side bytes endpoint
 * is NOT a Web API JSON call; the V2 download_file handler does a
 * plain `fetch(url, { headers: { authorization: Bearer <bot> }})`.
 */
export interface RecordedFileDownload {
  /** Full path on the mock origin (`/files-pri/...`). */
  path: string;
  /** Authorization header — `Bearer <bot>`. */
  authorization: string | undefined;
}

export interface MockSlackHandle {
  port: number;
  baseUrl: string;
  /** All calls observed by the mock server. Reset via reset(). */
  calls: {
    authorize: number;
    tokenExchange: RecordedTokenExchange[];
    chatPostMessage: RecordedChatPostMessage[];
    // Slack 2.3 — channel admin
    conversationsList: RecordedSlackApiCall[];
    conversationsInfo: RecordedSlackApiCall[];
    conversationsCreate: RecordedSlackApiCall[];
    conversationsArchive: RecordedSlackApiCall[];
    conversationsUnarchive: RecordedSlackApiCall[];
    conversationsRename: RecordedSlackApiCall[];
    conversationsJoin: RecordedSlackApiCall[];
    conversationsLeave: RecordedSlackApiCall[];
    conversationsInvite: RecordedSlackApiCall[];
    conversationsKick: RecordedSlackApiCall[];
    conversationsSetTopic: RecordedSlackApiCall[];
    conversationsSetPurpose: RecordedSlackApiCall[];
    // Slack 2.3 — user lookups
    usersInfo: RecordedSlackApiCall[];
    usersList: RecordedSlackApiCall[];
    // Slack 2.4 — file actions
    filesGetUploadURLExternal: RecordedSlackApiCall[];
    filesUpload: RecordedRawUpload[];
    filesCompleteUploadExternal: RecordedSlackApiCall[];
    filesInfo: RecordedSlackApiCall[];
    urlPrivateDownload: RecordedFileDownload[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.SLACK_MOCK_PORT ?? "9876");

/**
 * Start the mock server. The base URL of V2 (where the OAuth callback
 * redirects land) comes from the appBaseUrl param so the mock has zero
 * coupling to V2's host config.
 */
export async function startMockSlackServer(opts: {
  appBaseUrl: string;
  port?: number;
}): Promise<MockSlackHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const calls: MockSlackHandle["calls"] = {
    authorize: 0,
    tokenExchange: [],
    chatPostMessage: [],
    conversationsList: [],
    conversationsInfo: [],
    conversationsCreate: [],
    conversationsArchive: [],
    conversationsUnarchive: [],
    conversationsRename: [],
    conversationsJoin: [],
    conversationsLeave: [],
    conversationsInvite: [],
    conversationsKick: [],
    conversationsSetTopic: [],
    conversationsSetPurpose: [],
    usersInfo: [],
    usersList: [],
    filesGetUploadURLExternal: [],
    filesUpload: [],
    filesCompleteUploadExternal: [],
    filesInfo: [],
    urlPrivateDownload: [],
  };

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, calls).catch((err) => {
      console.error("[mock-slack] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-slack handler crashed");
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
    calls,
    reset: () => {
      calls.authorize = 0;
      calls.tokenExchange.length = 0;
      calls.chatPostMessage.length = 0;
      calls.conversationsList.length = 0;
      calls.conversationsInfo.length = 0;
      calls.conversationsCreate.length = 0;
      calls.conversationsArchive.length = 0;
      calls.conversationsUnarchive.length = 0;
      calls.conversationsRename.length = 0;
      calls.conversationsJoin.length = 0;
      calls.conversationsLeave.length = 0;
      calls.conversationsInvite.length = 0;
      calls.conversationsKick.length = 0;
      calls.conversationsSetTopic.length = 0;
      calls.conversationsSetPurpose.length = 0;
      calls.usersInfo.length = 0;
      calls.usersList.length = 0;
      calls.filesGetUploadURLExternal.length = 0;
      calls.filesUpload.length = 0;
      calls.filesCompleteUploadExternal.length = 0;
      calls.filesInfo.length = 0;
      calls.urlPrivateDownload.length = 0;
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
  calls: MockSlackHandle["calls"],
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://placeholder");

  if (req.method === "GET" && url.pathname === "/oauth/v2/authorize") {
    calls.authorize += 1;
    const state = url.searchParams.get("state");
    if (!state) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("missing state");
      return;
    }
    const callback = new URL(
      "/api/integrations/oauth/slack/callback",
      appBaseUrl,
    );
    callback.searchParams.set("code", `mock-code-${Date.now()}`);
    callback.searchParams.set("state", state);
    res.writeHead(302, { location: callback.toString() });
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/oauth.v2.access") {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const parsed: Record<string, string> = {};
    for (const [k, v] of params.entries()) parsed[k] = v;
    calls.tokenExchange.push({ body, parsedBody: parsed });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        access_token: SLACK_TOKEN_PLACEHOLDER,
        scope: "channels:history,channels:read,chat:write,users:read",
        team: { id: "T-MOCK-TEAM", name: "Mock Workspace" },
        bot_user_id: "U-MOCK-BOT",
        app_id: "A-MOCK-APP",
        authed_user: { id: "U-MOCK-USER" },
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/__inspect") {
    // Inspect endpoint for cross-process spec assertions. Playwright workers
    // run in separate processes from globalSetup, so the in-memory `calls`
    // object isn't reachable directly — fetching this endpoint is the seam.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(calls));
    return;
  }

  if (req.method === "POST" && url.pathname === "/__reset") {
    // Spec-driven reset between phases of the same test (rare; included for
    // completeness so a spec that's about to assert "exactly N" can ensure
    // the counter started at 0).
    calls.authorize = 0;
    calls.tokenExchange.length = 0;
    calls.chatPostMessage.length = 0;
    calls.conversationsList.length = 0;
    calls.conversationsInfo.length = 0;
    calls.conversationsCreate.length = 0;
    calls.conversationsArchive.length = 0;
    calls.conversationsUnarchive.length = 0;
    calls.conversationsRename.length = 0;
    calls.conversationsJoin.length = 0;
    calls.conversationsLeave.length = 0;
    calls.conversationsInvite.length = 0;
    calls.conversationsKick.length = 0;
    calls.conversationsSetTopic.length = 0;
    calls.conversationsSetPurpose.length = 0;
    calls.usersInfo.length = 0;
    calls.usersList.length = 0;
    calls.filesGetUploadURLExternal.length = 0;
    calls.filesUpload.length = 0;
    calls.filesCompleteUploadExternal.length = 0;
    calls.filesInfo.length = 0;
    calls.urlPrivateDownload.length = 0;
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat.postMessage") {
    const body = await readBody(req);
    let parsedBody: { channel: string; text: string };
    try {
      parsedBody = JSON.parse(body) as { channel: string; text: string };
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("malformed json");
      return;
    }
    calls.chatPostMessage.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        ts: `${Date.now() / 1000}`,
        channel: parsedBody.channel,
        message: { text: parsedBody.text, user: "U-MOCK-BOT" },
      }),
    );
    return;
  }

  // Slack 2.3 — channel admin endpoints.
  if (req.method === "POST" && url.pathname === "/api/conversations.list") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsList.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channels: [
          { id: "C0PUBLIC1", name: "general", is_private: false, is_archived: false },
          { id: "CPRIV001", name: "secret-room", is_private: true, is_archived: false },
        ],
        // No next_cursor → wrapper resolves nextCursor=null, hasMore=false.
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.info") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsInfo.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    const channelId = String(parsedBody.channel ?? "C0PUBLIC1");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channel: {
          id: channelId,
          name: "general",
          is_private: false,
          is_archived: false,
          num_members: 42,
          topic: { value: "Topic" },
          purpose: { value: "Purpose" },
          created: 1730000000,
        },
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.create") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsCreate.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channel: {
          id: "C0NEWCHANNEL",
          name: String(parsedBody.name ?? "new-channel"),
          is_private: Boolean(parsedBody.is_private ?? false),
        },
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.archive") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsArchive.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.unarchive") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsUnarchive.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.rename") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsRename.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channel: {
          id: String(parsedBody.channel ?? "C0PUBLIC1"),
          name: String(parsedBody.name ?? "renamed"),
        },
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.join") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsJoin.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channel: {
          id: String(parsedBody.channel ?? "C0PUBLIC1"),
          name: "general",
        },
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.leave") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsLeave.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.invite") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsInvite.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channel: {
          id: String(parsedBody.channel ?? "C0PUBLIC1"),
          name: "general",
        },
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.kick") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsKick.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.setTopic") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsSetTopic.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channel: {
          id: String(parsedBody.channel ?? "C0PUBLIC1"),
          topic: { value: String(parsedBody.topic ?? "") },
        },
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations.setPurpose") {
    const parsedBody = await readJsonBody(req);
    calls.conversationsSetPurpose.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        channel: {
          id: String(parsedBody.channel ?? "C0PUBLIC1"),
          purpose: { value: String(parsedBody.purpose ?? "") },
        },
      }),
    );
    return;
  }

  // Slack 2.3 — user lookups.
  if (req.method === "POST" && url.pathname === "/api/users.info") {
    const parsedBody = await readJsonBody(req);
    calls.usersInfo.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    const userId = String(parsedBody.user ?? "U0ALICE");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        user: {
          id: userId,
          name: "alice",
          real_name: "Alice Anderson",
          is_admin: false,
          is_owner: false,
          is_bot: false,
          tz: "America/Los_Angeles",
          profile: {
            display_name: "Alice",
            image_192: "https://example.com/avatar.png",
          },
        },
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/users.list") {
    const parsedBody = await readJsonBody(req);
    calls.usersList.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        members: [
          { id: "U0ALICE", name: "alice", real_name: "Alice" },
          { id: "U0BOB", name: "bob", real_name: "Bob" },
        ],
      }),
    );
    return;
  }

  // ── Slack 2.4 — file actions ────────────────────────────────────────
  //
  // Slack's two-step file upload:
  //   1. POST /api/files.getUploadURLExternal → returns an upload_url
  //      and a file_id. The upload_url points at THIS mock origin
  //      so the bytes POST below lands on us.
  //   2. POST /upload/<token> → captures raw bytes.
  //   3. POST /api/files.completeUploadExternal → finalizes the share.
  // Plus:
  //   - POST /api/files.info → file metadata used by download_file +
  //     get_file_info.
  //   - GET  /files-pri/<rest> → the mock's stand-in for
  //     `url_private_download`. Returns canned bytes when a Bearer
  //     header is attached; refuses without it.

  if (
    req.method === "POST" &&
    url.pathname === "/api/files.getUploadURLExternal"
  ) {
    const parsedBody = await readJsonBody(req);
    calls.filesGetUploadURLExternal.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    const token = `tok-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        upload_url: `${publicMockBase(req)}/upload/${token}`,
        file_id: "F-MOCK-NEW",
      }),
    );
    return;
  }

  if (
    req.method === "POST" &&
    /^\/upload\/[^/]+$/.test(url.pathname)
  ) {
    const token = url.pathname.replace(/^\/upload\//, "");
    const raw = await readRawBody(req);
    calls.filesUpload.push({
      uploadToken: token,
      authorization: req.headers.authorization,
      contentType: req.headers["content-type"] as string | undefined,
      byteLength: raw.byteLength,
      bytesBase64: raw.toString("base64"),
    });
    // Slack-S3 returns plain HTTP — no body expected.
    res.writeHead(200);
    res.end();
    return;
  }

  if (
    req.method === "POST" &&
    url.pathname === "/api/files.completeUploadExternal"
  ) {
    const parsedBody = await readJsonBody(req);
    calls.filesCompleteUploadExternal.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    const inputFiles = Array.isArray(parsedBody.files)
      ? (parsedBody.files as Array<Record<string, unknown>>)
      : [];
    const fileEntry = inputFiles[0] ?? {};
    const fileId =
      typeof fileEntry.id === "string" ? fileEntry.id : "F-MOCK-NEW";
    const title =
      typeof fileEntry.title === "string"
        ? fileEntry.title
        : "mock-upload.bin";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        files: [
          {
            id: fileId,
            name: title,
            title,
            mimetype: "application/octet-stream",
            filetype: "binary",
            size: 0, // not reflected by mock; consumer trusts its own byteLength
            url_private: `${publicMockBase(req)}/files-pri/${fileId}/${encodeURIComponent(
              title,
            )}`,
            url_private_download: `${publicMockBase(req)}/files-pri/${fileId}/download/${encodeURIComponent(
              title,
            )}`,
            permalink: `https://acme.slack.com/files/U-MOCK-BOT/${fileId}/${encodeURIComponent(
              title,
            )}`,
            channels: [parsedBody.channel_id ?? "C-MOCK-CHANNEL"],
          },
        ],
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/files.info") {
    const parsedBody = await readJsonBody(req);
    calls.filesInfo.push({
      authorization: req.headers.authorization,
      body: parsedBody,
    });
    const fileId =
      typeof parsedBody.file === "string" ? parsedBody.file : "F-MOCK-DL";
    const fileName = `${fileId}-content.bin`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        file: {
          id: fileId,
          name: fileName,
          title: `Title for ${fileId}`,
          mimetype: "application/octet-stream",
          filetype: "binary",
          size: MOCK_FILE_BYTES.byteLength,
          url_private: `${publicMockBase(req)}/files-pri/${fileId}/${encodeURIComponent(
            fileName,
          )}`,
          url_private_download: `${publicMockBase(req)}/files-pri/${fileId}/download/${encodeURIComponent(
            fileName,
          )}`,
          permalink: `https://acme.slack.com/files/U0ALICE/${fileId}/${encodeURIComponent(
            fileName,
          )}`,
          permalink_public: `https://slack-files.com/${fileId}-public`,
          user: "U0ALICE",
          channels: ["C0SHARED", "C0PUBLIC1"],
          is_public: false,
          is_external: false,
          created: 1762848000,
          num_comments: 0,
        },
        comments: [],
      }),
    );
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/files-pri/")) {
    calls.urlPrivateDownload.push({
      path: url.pathname,
      authorization: req.headers.authorization,
    });
    // Defense — require a Bearer header. Without it, Slack would
    // 302 to a login page; we 401 so the V2 handler surfaces an
    // http_401 SlackApiError (and we can write a regression test
    // around that path if needed).
    if (
      !req.headers.authorization ||
      !req.headers.authorization.toLowerCase().startsWith("bearer ")
    ) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("unauthorized");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(MOCK_FILE_BYTES.byteLength),
    });
    res.end(MOCK_FILE_BYTES);
    return;
  }

  // Anything else is unexpected — fail loud so the test surfaces it.
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-slack: no route for ${req.method} ${url.pathname}`);
}

/**
 * Fixed byte payload the mock serves at `url_private_download`.
 * Distinctive sentinel (0xDE 0xAD 0xBE 0xEF + ASCII "MOCK_SLACK_FILE")
 * so the spec can detect the byte stream when it appears in
 * workflow-files storage.
 */
const MOCK_FILE_BYTES = Buffer.from([
  0xde, 0xad, 0xbe, 0xef,
  ...Buffer.from("MOCK_SLACK_FILE", "ascii"),
]);

/**
 * Compute the externally-addressable origin for URLs the mock embeds
 * in responses. Using `req.headers.host` keeps the embedded URLs in
 * lock-step with however the caller reached us (localhost vs 127.0.0.1
 * vs an alternate port via env override). Falls back to the
 * Node-bound 127.0.0.1:PORT pair when the header is missing.
 */
function publicMockBase(req: IncomingMessage): string {
  const host = req.headers.host;
  if (host) return `http://${host}`;
  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(req);
  if (!body) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
