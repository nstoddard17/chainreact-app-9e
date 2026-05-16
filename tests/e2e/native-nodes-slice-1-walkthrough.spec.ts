import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createTestUser,
  deleteTestUser,
  getIntegrationsForUser,
  getWorkflowRunsForUser,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readMockState } from "./global-setup";

/**
 * Native-nodes Slice 1 — e2e walkthrough.
 *
 * Proves the three Tier A native handlers shipped in
 * docs/slices/parity/native-nodes-1-tier-a-plan.md run end-to-end inside
 * the dev server's workflow engine, with full variable threading across
 * provider ↔ native ↔ provider boundaries.
 *
 * Real surfaces exercised:
 *   - Slack OAuth (trigger source + final outgoing action — reused from
 *     Slice 1's mock infrastructure).
 *   - Workflow CRUD + activate.
 *   - Signed Slack webhook → dispatcher → engine → handler chain.
 *   - native:http_request handler — hits a spec-owned tiny echo server
 *     running on a random localhost port. No outbound internet.
 *   - native:format_transformer handler — converts the echo'd JSON body
 *     into HTML and into Slack-markdown text downstream.
 *   - native:delay handler — sleeps 1 second in-process.
 *   - workflow_runs.steps persistence: every node's output is asserted
 *     directly off the DB row.
 *
 * Data-passing coverage (per Slice 1 plan §9):
 *   - Provider trigger → native node config:
 *       native:http_request.queryParams[0].value = `{{trigger.payload.event.text}}`
 *   - Native node → native node config:
 *       native:format_transformer.content = `{{http-request.body}}`
 *   - Delay does not corrupt downstream variable resolution:
 *       native:delay is wired BETWEEN format_transformer and the final
 *       Slack action. The Slack message text references
 *       `{{format-transformer.transformedContent}}` — proves the
 *       upstream variable survives the 1s timer.
 *   - Native → provider: the resolved transformed content lands as the
 *     `text` body of Slack's chat.postMessage call.
 *
 * Schema-fail coverage:
 *   - Second test in the same describe builds a workflow with
 *     `native:delay.seconds = 60` (above the 30s cap). Asserts the run
 *     finalizes as `failed` with a HANDLER_FAILED step on the delay
 *     node — proves engine-layer error wrapping for native handlers.
 *
 * Echo server: stood up in `test.beforeAll` on a random port. Exposes
 *   - GET /echo/json → JSON `{ greeting, count }` with a content-type
 *     of application/json so the handler's bodyJson parsing fires.
 *   - GET /echo/plain → text/plain body.
 *   The dev server (port 3001) reaches this on the same loopback
 *   interface; the spec process owns the port. No global-setup or mock
 *   helper changes — keeps the surface area of this commit tight.
 */

interface EchoServerHandle {
  server: Server;
  port: number;
  baseUrl: string;
  reset(): void;
  recordedRequests(): ReadonlyArray<{
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  }>;
}

let echoServer: EchoServerHandle | null = null;
let testUser: TestUser | null = null;

test.describe("Native-nodes Slice 1 — Tier A walkthrough", () => {
  test.beforeAll(async () => {
    echoServer = await startEchoServer();
  });

  test.afterAll(async () => {
    if (echoServer) {
      await new Promise<void>((resolve, reject) =>
        echoServer!.server.close((err) => (err ? reject(err) : resolve())),
      );
      echoServer = null;
    }
  });

  test.beforeEach(async () => {
    testUser = await createTestUser();
    if (echoServer) echoServer.reset();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("chained success: slack trigger → http_request → format_transformer → delay → slack action with full variable threading", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    if (!echoServer) throw new Error("echo server not started");
    const user = testUser;
    const mock = await readMockState();

    await page.request.post(`${mock.baseUrl}/__reset`);

    await signIn(page, user);

    // Connect Slack via the existing mocked OAuth dance.
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack", exact: true }).click(),
    ]);
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);

    // Build the workflow via UI + PATCH the draft definition (V2 builder
    // doesn't have per-node config UI yet).
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E native nodes — chained success");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const echoUrl = `${echoServer.baseUrl}/echo/json`;
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.message.channel",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "http-request",
          kind: "action" as const,
          provider: "native",
          type: "http_request",
          config: {
            method: "GET",
            url: echoUrl,
            // Provider trigger → native config. The Slack message text
            // becomes part of the URL query string; the echo server
            // echoes it back inside the JSON body. Slack's normalizer
            // sets the TriggerEvent.payload to the inner Slack `event`
            // object verbatim, so `trigger.payload.text` is the right
            // path (NOT `trigger.payload.event.text`).
            queryParams: [
              { key: "from", value: "{{trigger.payload.text}}" },
            ],
            timeoutSeconds: 5,
          },
          position: { x: 0, y: 100 },
        },
        {
          id: "format-transformer",
          kind: "action" as const,
          provider: "native",
          type: "format_transformer",
          config: {
            // Native → native. http_request.body is a JSON string the
            // echo server emits; we treat it as markdown source and
            // convert to slack_markdown so the final Slack action gets
            // a Slack-shaped string.
            content: "Echoed payload: **{{http-request.body}}**",
            sourceFormat: "markdown",
            targetFormat: "slack_markdown",
          },
          position: { x: 0, y: 200 },
        },
        {
          id: "wait-a-sec",
          kind: "action" as const,
          provider: "native",
          type: "delay",
          config: { seconds: 1 },
          position: { x: 0, y: 300 },
        },
        {
          id: "slack-send",
          kind: "action" as const,
          provider: "slack",
          type: "send_channel_message",
          config: {
            channel: "C-MOCK-CHANNEL",
            // Native → provider. The transformed content survives the
            // 1s delay and resolves into the Slack handler's text.
            text: "{{format-transformer.transformedContent}}",
          },
          position: { x: 0, y: 400 },
        },
      ],
      edges: [
        { id: "e1", from: "trigger-node", to: "http-request" },
        { id: "e2", from: "http-request", to: "format-transformer" },
        { id: "e3", from: "format-transformer", to: "wait-a-sec" },
        { id: "e4", from: "wait-a-sec", to: "slack-send" },
      ],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    // Activate.
    await page.reload();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("[data-status-kind=active]")).toBeVisible({
      timeout: 10_000,
    });

    // Fire a signed Slack webhook with a message whose text becomes the
    // query param threaded through http_request.
    const triggerText = `e2e-native-${Date.now()}`;
    const webhookBody = buildSlackEventBody({
      teamId: "T-MOCK-TEAM",
      text: triggerText,
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = signSlackWebhook(
      ts,
      webhookBody,
      requireEnv("SLACK_SIGNING_SECRET"),
    );
    const webhookResp = await request.post("/api/webhooks/slack", {
      headers: {
        "x-slack-request-timestamp": ts,
        "x-slack-signature": signature,
        "content-type": "application/json",
      },
      data: webhookBody,
    });
    expect(webhookResp.status(), await webhookResp.text()).toBe(200);

    // Wait for the run row.
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      {
        description: "workflow_runs row for native chained walkthrough",
        timeoutMs: 20_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status, JSON.stringify(run, null, 2)).toBe("succeeded");
    expect(run.error_classification).toBeNull();

    // Per-step assertions — proves every native output landed in
    // workflow_runs.steps with the expected shape.
    const steps = run.steps as Array<{
      nodeId: string;
      status: string;
      output?: Record<string, unknown>;
    }>;

    expect(steps.map((s) => s.nodeId)).toEqual([
      "trigger-node",
      "http-request",
      "format-transformer",
      "wait-a-sec",
      "slack-send",
    ]);
    for (const step of steps) {
      expect(step.status).toBe("succeeded");
    }

    // ── native:http_request output ──
    const httpStep = steps.find((s) => s.nodeId === "http-request")!;
    expect(httpStep.output).toMatchObject({
      status: 200,
      ok: true,
      bodyTruncated: false,
    });
    const httpOut = httpStep.output as {
      status: number;
      body: string;
      bodyJson: { greeting: string; count: number; receivedFrom: string };
      urlHost: string;
      headers: Record<string, string>;
    };
    expect(httpOut.bodyJson.greeting).toBe("hello from echo");
    expect(httpOut.bodyJson.count).toBe(42);
    // Provider → native data-passing assertion: the trigger text reached
    // the echo server via the query string.
    expect(httpOut.bodyJson.receivedFrom).toBe(triggerText);
    expect(httpOut.urlHost).toMatch(/^127\.0\.0\.1:/);
    // No sensitive headers in projected response headers.
    expect(httpOut.headers["set-cookie"]).toBeUndefined();
    expect(httpOut.headers["authorization"]).toBeUndefined();

    // ── native:format_transformer output ──
    const fmtStep = steps.find((s) => s.nodeId === "format-transformer")!;
    const fmtOut = fmtStep.output as {
      transformedContent: string;
      sourceFormat: string;
      targetFormat: string;
    };
    expect(fmtOut.sourceFormat).toBe("markdown");
    expect(fmtOut.targetFormat).toBe("slack_markdown");
    // Markdown `**...**` → Slack `*...*`. The transformed text wraps the
    // upstream http_request.body inside Slack-bold.
    expect(fmtOut.transformedContent).toMatch(/^Echoed payload: \*/);
    expect(fmtOut.transformedContent).not.toMatch(/\*\*/);
    expect(fmtOut.transformedContent).toContain(httpOut.body);

    // ── native:delay output ──
    const delayStep = steps.find((s) => s.nodeId === "wait-a-sec")!;
    const delayOut = delayStep.output as {
      delayedSeconds: number;
      startedAt: string;
      completedAt: string;
    };
    expect(delayOut.delayedSeconds).toBe(1);
    expect(typeof delayOut.startedAt).toBe("string");
    expect(typeof delayOut.completedAt).toBe("string");
    const elapsedMs =
      Date.parse(delayOut.completedAt) - Date.parse(delayOut.startedAt);
    expect(elapsedMs).toBeGreaterThanOrEqual(1000);
    expect(elapsedMs).toBeLessThan(10_000); // sanity — no runaway delay.

    // ── slack:send_channel_message: native → provider data passing ──
    // The mock recorded exactly one chat.postMessage call. Its body
    // contains the value produced by format_transformer.
    const slackCalls = await fetchSlackCalls(request, mock.baseUrl);
    expect(slackCalls.chatPostMessage).toHaveLength(1);
    const sentMessage = slackCalls.chatPostMessage[0]!.body;
    expect(sentMessage.channel).toBe("C-MOCK-CHANNEL");
    expect(sentMessage.text).toBe(fmtOut.transformedContent);

    // Echo server saw exactly one request, with the trigger-derived
    // query param. Proves the native:http_request actually fired and
    // the query-param resolution ran end-to-end.
    const echoRequests = echoServer.recordedRequests();
    expect(echoRequests).toHaveLength(1);
    expect(echoRequests[0]!.path).toBe(
      `/echo/json?from=${encodeURIComponent(triggerText)}`,
    );
    expect(echoRequests[0]!.method).toBe("GET");
  });

  test("schema-fail path: native:delay seconds=60 fails the run with HANDLER_FAILED on the delay step", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    await signIn(page, user);

    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack", exact: true }).click(),
    ]);

    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E native nodes — delay over cap");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.message.channel",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "bad-delay",
          kind: "action" as const,
          provider: "native",
          type: "delay",
          // 60s — above the 30s schema cap. Schema parse throws inside
          // the handler; engine catches and converts to HANDLER_FAILED.
          config: { seconds: 60 },
          position: { x: 0, y: 100 },
        },
        {
          id: "should-not-run",
          kind: "action" as const,
          provider: "slack",
          type: "send_channel_message",
          config: { channel: "C-MOCK-CHANNEL", text: "never sent" },
          position: { x: 0, y: 200 },
        },
      ],
      edges: [
        { id: "e1", from: "trigger-node", to: "bad-delay" },
        { id: "e2", from: "bad-delay", to: "should-not-run" },
      ],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    await page.reload();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("[data-status-kind=active]")).toBeVisible({
      timeout: 10_000,
    });

    const webhookBody = buildSlackEventBody({
      teamId: "T-MOCK-TEAM",
      text: "trigger for schema-fail",
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = signSlackWebhook(
      ts,
      webhookBody,
      requireEnv("SLACK_SIGNING_SECRET"),
    );
    const webhookResp = await request.post("/api/webhooks/slack", {
      headers: {
        "x-slack-request-timestamp": ts,
        "x-slack-signature": signature,
        "content-type": "application/json",
      },
      data: webhookBody,
    });
    expect(webhookResp.status(), await webhookResp.text()).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      {
        description: "workflow_runs row for delay-over-cap walkthrough",
        timeoutMs: 15_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("failed");

    const steps = run.steps as Array<{
      nodeId: string;
      status: string;
      output?: Record<string, unknown>;
      error?: { code: string; message: string };
    }>;

    // Trigger succeeded; bad-delay failed; downstream Slack action
    // was never enqueued (engine stops on first failure).
    const triggerStep = steps.find((s) => s.nodeId === "trigger-node");
    expect(triggerStep?.status).toBe("succeeded");

    const badDelay = steps.find((s) => s.nodeId === "bad-delay");
    expect(badDelay).toBeTruthy();
    expect(badDelay!.status).toBe("failed");
    expect(badDelay!.error?.code).toBe("HANDLER_FAILED");
    // Zod's emitted message contains the offending field path.
    expect(badDelay!.error?.message.toLowerCase()).toMatch(/seconds/);

    const downstream = steps.find((s) => s.nodeId === "should-not-run");
    expect(downstream).toBeUndefined();

    // No outbound Slack call was made — schema rejection short-circuits
    // BEFORE any provider side effect.
    const slackCalls = await fetchSlackCalls(request, mock.baseUrl);
    expect(slackCalls.chatPostMessage).toHaveLength(0);
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/auth/sign-in");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await Promise.all([
    page.waitForURL(
      (url) => !/\/auth\/sign-in/.test(url.toString()),
      { timeout: 15_000 },
    ),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

function buildSlackEventBody(opts: {
  teamId: string;
  text: string;
}): string {
  return JSON.stringify({
    type: "event_callback",
    team_id: opts.teamId,
    event_id: `Ev${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event_time: Math.floor(Date.now() / 1000),
    event: {
      type: "message",
      channel: "C-MOCK-CHANNEL",
      user: "U-MOCK-SENDER",
      text: opts.text,
      ts: `${Date.now() / 1000}`,
    },
  });
}

function signSlackWebhook(
  ts: string,
  rawBody: string,
  signingSecret: string,
): string {
  const base = `v0:${ts}:${rawBody}`;
  const hex = createHmac("sha256", signingSecret).update(base).digest("hex");
  return `v0=${hex}`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`e2e: ${name} env var is required`);
  return v;
}

interface SlackMockInspect {
  chatPostMessage: ReadonlyArray<{
    authorization?: string;
    body: { channel: string; text: string };
  }>;
}

async function fetchSlackCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<SlackMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as SlackMockInspect;
}

/**
 * Spec-owned tiny HTTP echo server. Stays inside the spec file so the
 * commit doesn't touch tests/e2e/helpers/* (which several Outlook
 * walkthroughs are concurrently modifying) and doesn't extend
 * global-setup (which is shared by every other walkthrough).
 *
 * Endpoints:
 *   - GET /echo/json → application/json. Body echoes the `?from=`
 *     query param plus a stable greeting + count so the response is
 *     deterministic across runs.
 *   - GET /echo/plain → text/plain. Useful for content-type variant
 *     coverage (not exercised in Slice 1 e2e but kept for symmetry).
 */
async function startEchoServer(): Promise<EchoServerHandle> {
  const recorded: Array<{
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  }> = [];

  const server = createServer((req, res) => {
    const method = req.method ?? "GET";
    const path = req.url ?? "/";
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers[k.toLowerCase()] = v;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      recorded.push({ method, path, headers, body });

      const url = new URL(path, "http://127.0.0.1");
      if (method === "GET" && url.pathname === "/echo/json") {
        const from = url.searchParams.get("from") ?? "";
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            greeting: "hello from echo",
            count: 42,
            receivedFrom: from,
          }),
        );
        return;
      }
      if (method === "GET" && url.pathname === "/echo/plain") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("plain text body");
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    server,
    port: addr.port,
    baseUrl,
    reset(): void {
      recorded.length = 0;
    },
    recordedRequests(): ReadonlyArray<{
      method: string;
      path: string;
      headers: Record<string, string>;
      body: string;
    }> {
      return recorded;
    },
  };
}
