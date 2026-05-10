import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createTestUser,
  deleteTestUser,
  getDedupRow,
  getIntegrationsForUser,
  getNotificationsForUser,
  getOAuthStateRowCount,
  getTriggerResourcesForUser,
  getWorkflowRunsForUser,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readGitHubMockState } from "./global-setup";

/**
 * Slice 14b end-to-end walkthrough — GitHub.
 *
 * V2's developer-tools provider — non-refreshable OAuth App + REST
 * (issues / repos / PRs / branches / gists / comments) + per-repo
 * webhook lifecycle with X-Hub-Signature-256 HMAC verification +
 * X-GitHub-Delivery dedup.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in).
 *   - OAuth dispatcher / state / atomic consume against the standard
 *     `[provider]` route. GitHub uses NO PKCE + form-urlencoded
 *     body-auth (client_secret in body, NOT Basic header) + `Accept:
 *     application/json` (default GitHub returns form-encoded).
 *   - Token encryption (AES-256-GCM) — no refresh token stored
 *     (GitHub OAuth Apps issue non-expiring tokens with no refresh
 *     grant).
 *   - Auxiliary `GET /user` after token exchange to resolve `login`
 *     as `providerAccountId`. Uses `Authorization: token <token>` —
 *     NOT `Bearer` (V1 lifecycle inconsistency anti-test).
 *   - Workflow create + activate (`new_commit` trigger registration
 *     creating ONE per-repo webhook with `events: ["push"]`).
 *   - Trigger activation: trigger_resources row stores
 *     `repository` / `owner` / `repo` / `branch` / `hookId` /
 *     `events` / `webhookEnabled: true` / `notificationUrl`. NO
 *     `type: "subscription-watch"` marker — GitHub webhooks don't
 *     expire and runRenewals opts out via marker omission (same
 *     permanent-endpoint pattern as Stripe / Shopify).
 *   - Webhook receive: X-Hub-Signature-256 verify (HMAC-SHA256-hex
 *     over raw body keyed with `GITHUB_WEBHOOK_SECRET`) →
 *     strict-direct trigger lookup via `?workflowId=X&nodeId=Y` →
 *     push-only event filter → optional branch filter → normalize
 *     → dispatch.
 *   - Engine + create_issue action handler → POST
 *     `/repos/{owner}/{repo}/issues` with `Authorization: token <token>`
 *     (NOT `Bearer`) + `X-GitHub-Api-Version: 2022-11-28`.
 *   - DB-backed dedup (webhook_event_dedup) catches duplicate
 *     X-GitHub-Delivery deliveries.
 *
 * Mocked surfaces (GitHub network boundary only):
 *   - /login/oauth/{authorize,access_token}
 *   - /user
 *   - /repos/{owner}/{repo} (default branch lookup — PR-G6)
 *   - /repos/{owner}/{repo}/issues (action under test)
 *   - /repos/{owner}/{repo}/hooks{,/id} (webhook lifecycle)
 *
 * Key GitHub-specific assertions:
 *   - Authorize URL omits PKCE (GitHub rejects code_challenge).
 *   - Authorize URL uses space-separated scopes (GitHub canonical).
 *   - Token exchange uses `Content-Type: application/x-www-form-urlencoded`
 *     and `Accept: application/json` and NO Authorization header.
 *   - Token response carries NO refresh_token — V2 stores
 *     `refresh_token_encrypted = null`.
 *   - `/user` lookup uses `Authorization: token <token>` (NOT
 *     `Bearer`) + `X-GitHub-Api-Version: 2022-11-28`.
 *   - Action call uses `Authorization: token <token>` + API version
 *     header.
 *   - Webhook lifecycle uses the user's access token (not a global
 *     secret) and includes the webhook secret in the body's
 *     `config.secret` field.
 *   - V2-bug-fix `Authorization: token` everywhere — anti-test for
 *     V1 lifecycle's `Bearer`.
 *   - Trigger config does NOT carry `type: "subscription-watch"`.
 *   - Ping handshake → 200 with `{ message: "pong" }`.
 *   - Invalid signature → 401, no run.
 *   - Unsupported event (`pull_request`) → 200 ack, no run, no action.
 *   - Branch filter mismatch → 200 ack, no run, no action.
 *   - Replay of same signed event (same X-GitHub-Delivery) → no
 *     duplicate run (webhook_event_dedup catches).
 */

const OWNER = "octocat-e2e";
const REPO = "hello-world";
const REPOSITORY = `${OWNER}/${REPO}`;
const FILTER_BRANCH = "main";

let testUser: TestUser | null = null;

test.describe("Slice 14b — full GitHub walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect GitHub (OAuth App body-auth) → build + activate (creates 1 repo webhook) → ping pong → invalid-sig 401 → unsupported-event ack → branch-mismatch ack → signed push → succeeded run (create_issue) → replay deduped", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGitHubMockState();

    // Per-run unique title so two consecutive runs don't collide on
    // the mock's issue counter assertions.
    const runMarker = randomUUID();

    // Reset mock so per-test assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect GitHub ──
    // GitHub OAuth Apps don't require providerHint (unlike Shopify).
    // The default integrations page's ConnectButton would POST an
    // empty body; we POST directly so the spec stays explicit.
    const connectResp = await page.request.post(
      "/api/integrations/oauth/github/connect",
    );
    expect(connectResp.status(), await connectResp.text()).toBe(200);
    const { redirectUrl } = (await connectResp.json()) as {
      redirectUrl: string;
    };
    expect(redirectUrl).toContain("/login/oauth/authorize");

    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=github/),
      page.goto(redirectUrl),
    ]);

    // After OAuth: integrations page shows GitHub connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // ── 4. DB assertions: integration row exists with encrypted token ──
    const integrations = await getIntegrationsForUser(user.id, "github");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    // accountId is the GitHub `login` from `/user` (mock returns
    // "octocat-e2e").
    expect(integration.provider_account_id).toBe("octocat-e2e");

    // Access token IS encrypted (NOT plaintext mock value).
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe("github-mock-e2e-access");
    // Refresh token is NULL — GitHub OAuth Apps don't issue refresh
    // tokens (V2 anti-test for accidental refreshable regression).
    expect(integration.refresh_token_encrypted).toBeNull();
    // Access token expires_at is NULL — GitHub OAuth App tokens don't
    // expire.
    expect(integration.access_token_expires_at).toBeNull();

    // Scopes echoed by mock — exactly the 3 Slice 14b manifest scopes.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining(["repo", "read:org", "gist"]),
    );
    expect(scopes).toHaveLength(3);

    // OAuth state row was atomically consumed — count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // ── 5. Mock-call assertions: authorize + token + /user ──
    const callsAfterOAuth = await fetchGitHubCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.userCalls).toHaveLength(1);

    const authorizeCall = callsAfterOAuth.calls.authorize[0]!;
    // GitHub uses space-separated scopes (the canonical form).
    expect(authorizeCall.scope).toBe("repo read:org gist");
    expect(authorizeCall.clientId).toBe("Iv1.e2e_github_client_id");
    expect(authorizeCall.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/github\/callback$/,
    );
    // NO PKCE — GitHub rejects these. Anti-test for V2 accidentally
    // regressing into PKCE mode.
    expect(authorizeCall.codeChallenge).toBeNull();
    expect(authorizeCall.codeChallengeMethod).toBeNull();

    // Token exchange used form-urlencoded body-auth — NOT JSON, NOT
    // Basic auth header. The distinguishing wire-format mix for
    // GitHub.
    const tokenCall = callsAfterOAuth.calls.tokenExchange[0]!;
    expect(tokenCall.authorization).toBeUndefined();
    expect(tokenCall.contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(tokenCall.accept).toBe("application/json");
    expect(tokenCall.parsedBody.client_id).toBe("Iv1.e2e_github_client_id");
    expect(tokenCall.parsedBody.client_secret).toBe(
      "e2e-github-client-secret",
    );
    expect(typeof tokenCall.parsedBody.code).toBe("string");
    expect((tokenCall.parsedBody.code as string).length).toBeGreaterThan(0);
    expect(tokenCall.parsedBody.grant_type).toBe("authorization_code");

    // /user lookup used `Authorization: token <token>` (NOT Bearer) +
    // GitHub API version header.
    const userCall = callsAfterOAuth.calls.userCalls[0]!;
    expect(userCall.authorization).toBe("token github-mock-e2e-access");
    expect(userCall.authorization).not.toMatch(/^Bearer /);
    expect(userCall.apiVersion).toBe("2022-11-28");
    expect(userCall.accept).toBe("application/vnd.github+json");

    // ── 6. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E GitHub Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 7. Configure trigger + action via API patch ──
    // Trigger listens for push events on FILTER_BRANCH only. Action
    // creates a GitHub issue (the simplest customer-facing action —
    // exercises /repos/{owner}/{repo}/issues with the user access
    // token).
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "github",
          type: "new_commit",
          config: {
            repository: REPOSITORY,
            branch: FILTER_BRANCH,
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "github",
          type: "create_issue",
          config: {
            repository: REPOSITORY,
            title: `E2E Issue ${runMarker}`,
            body: "Created from the Slice 14b walkthrough.",
            labels: ["bug", "p1"],
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    await page.reload();
    const nodeList = page.locator('ol[aria-label="Workflow nodes"]');
    await expect(nodeList.getByText(/trigger/i).first()).toBeVisible();
    await expect(nodeList.getByText(/action/i).first()).toBeVisible();

    // ── 8. Activate workflow via UI ──
    // Triggers GitHub's activate hook: POST /repos/{owner}/{repo}/hooks
    // once, persists hookId in trigger_resources.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 9. trigger_resources row stores GitHub metadata ──
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("github");
    expect(triggerAfterActivate.event_type).toBe("new_commit");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      repository?: string;
      owner?: string;
      repo?: string;
      branch?: string | null;
      events?: string[];
      hookId?: number;
      notificationUrl?: string;
    };
    // Slice 14b design: NO `type: "subscription-watch"` — GitHub
    // webhooks don't expire and runRenewals filters on this marker
    // to skip GitHub rows.
    expect(configAfterActivate.type).toBeUndefined();
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.repository).toBe(REPOSITORY);
    expect(configAfterActivate.owner).toBe(OWNER);
    expect(configAfterActivate.repo).toBe(REPO);
    expect(configAfterActivate.branch).toBe(FILTER_BRANCH);
    expect(configAfterActivate.events).toEqual(["push"]);
    expect(typeof configAfterActivate.hookId).toBe("number");
    expect(configAfterActivate.hookId!).toBeGreaterThan(0);
    expect(configAfterActivate.notificationUrl).toMatch(
      /\/api\/webhooks\/github\?/,
    );
    expect(configAfterActivate.notificationUrl).toContain(
      `nodeId=trigger-node`,
    );

    // Mock saw exactly 1 webhook creation using the user's access
    // token (NOT Bearer-style auth) and the webhook secret was
    // forwarded.
    const callsAfterActivate = await fetchGitHubCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.webhookCreate).toHaveLength(1);
    const createCall = callsAfterActivate.calls.webhookCreate[0]!;
    expect(createCall.owner).toBe(OWNER);
    expect(createCall.repo).toBe(REPO);
    expect(createCall.authorization).toBe("token github-mock-e2e-access");
    expect(createCall.authorization).not.toMatch(/^Bearer /);
    expect(createCall.events).toEqual(["push"]);
    expect(createCall.url).toMatch(/\/api\/webhooks\/github\?/);
    expect(createCall.url).toContain("nodeId=trigger-node");
    expect(createCall.hasSecret).toBe(true);

    const firstHookId = configAfterActivate.hookId!;

    // ── 10. Ping handshake → 200 with "pong" ──
    const pingResp = await page.request.post(
      `${mock.baseUrl}/__sendPingEvent`,
      { data: { hookId: firstHookId } },
    );
    expect(pingResp.status()).toBe(200);
    const pingBody = (await pingResp.json()) as {
      status: number;
      body: string;
    };
    expect(pingBody.status).toBe(200);
    expect(pingBody.body).toContain("pong");

    // Brief wait then confirm NO run was enqueued from the ping.
    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);

    // ── 11. Invalid-signature push → 401, no run, no action ──
    const invalidResp = await page.request.post(
      `${mock.baseUrl}/__sendInvalidSignaturePush`,
      { data: { hookId: firstHookId } },
    );
    expect(invalidResp.status()).toBe(200);
    const invalidBody = (await invalidResp.json()) as {
      status: number;
      body: string;
    };
    expect(invalidBody.status).toBe(401);

    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterInvalid = await fetchGitHubCalls(request, mock.baseUrl);
    // No issues POST happened — signature gate runs first.
    expect(callsAfterInvalid.calls.issuesCreate).toHaveLength(0);

    // ── 12. Unsupported event (pull_request) → 200 ack, no run ──
    // Signature valid but X-GitHub-Event is NOT `push` — Batch 1 only
    // dispatches push.
    const unsupportedResp = await page.request.post(
      `${mock.baseUrl}/__sendUnsupportedEvent`,
      {
        data: {
          hookId: firstHookId,
          eventName: "pull_request",
        },
      },
    );
    expect(unsupportedResp.status()).toBe(200);
    const unsupportedBody = (await unsupportedResp.json()) as {
      status: number;
      body: string;
    };
    expect(unsupportedBody.status).toBe(200);
    expect(unsupportedBody.body).toContain("skipped");

    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterUnsupported = await fetchGitHubCalls(request, mock.baseUrl);
    expect(callsAfterUnsupported.calls.issuesCreate).toHaveLength(0);

    // ── 13. Branch-mismatch push → 200 ack, no run ──
    // Signature valid + push event, but ref is feature/different ≠
    // configured branch `main`.
    const mismatchResp = await page.request.post(
      `${mock.baseUrl}/__sendBranchMismatchPush`,
      {
        data: {
          hookId: firstHookId,
          branch: "feature/different",
        },
      },
    );
    expect(mismatchResp.status()).toBe(200);
    const mismatchBody = (await mismatchResp.json()) as {
      status: number;
      body: string;
    };
    expect(mismatchBody.status).toBe(200);
    expect(mismatchBody.body).toContain("skipped");

    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterMismatch = await fetchGitHubCalls(request, mock.baseUrl);
    expect(callsAfterMismatch.calls.issuesCreate).toHaveLength(0);

    // ── 14. Send a signed push event matching the configured branch ──
    const deliveryId = `delivery-${runMarker}`;
    const sendResp = await page.request.post(
      `${mock.baseUrl}/__sendPushEvent`,
      {
        data: {
          hookId: firstHookId,
          deliveryId,
        },
      },
    );
    expect(sendResp.status()).toBe(200);
    const sendBody = (await sendResp.json()) as {
      status: number;
      body: string;
      deliveryId: string;
    };
    expect(sendBody.status).toBe(200);
    expect(sendBody.deliveryId).toBe(deliveryId);

    // ── 15. workflow_run succeeds ──
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row to appear", timeoutMs: 15_000 },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");
    expect(run.error_classification).toBeNull();

    // ── 16. Mock saw exactly 1 issues POST (the action) ──
    const callsAfterRun = await fetchGitHubCalls(request, mock.baseUrl);
    expect(callsAfterRun.calls.issuesCreate).toHaveLength(1);
    const issueCall = callsAfterRun.calls.issuesCreate[0]!;
    expect(issueCall.path).toBe(`/repos/${OWNER}/${REPO}/issues`);
    // V2 standardization: `Authorization: token <token>` everywhere
    // (NOT Bearer — V1 lifecycle inconsistency was fixed during port).
    expect(issueCall.authorization).toBe("token github-mock-e2e-access");
    expect(issueCall.authorization).not.toMatch(/^Bearer /);
    // X-GitHub-Api-Version header pinned.
    expect(issueCall.apiVersion).toBe("2022-11-28");
    expect(issueCall.accept).toBe("application/vnd.github+json");
    expect(issueCall.parsedBody.title).toBe(`E2E Issue ${runMarker}`);
    expect(issueCall.parsedBody.body).toBe(
      "Created from the Slice 14b walkthrough.",
    );
    expect(issueCall.parsedBody.labels).toEqual(["bug", "p1"]);

    // ── 17. Dedup row written for X-GitHub-Delivery ──
    const dedupRow = await getDedupRow("github", deliveryId);
    expect(dedupRow).not.toBeNull();

    // ── 18. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 19. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 20. Replay: same signed body + same delivery id → dedup blocks ──
    // GitHub retries failed deliveries with the SAME X-GitHub-Delivery
    // header. webhook_event_dedup keyed on (provider, eventId) catches
    // the duplicate at dispatch time.
    const replayResp = await page.request.post(
      `${mock.baseUrl}/__replayLastPushEvent`,
    );
    expect(replayResp.status()).toBe(200);
    const replayBody = (await replayResp.json()) as {
      status: number;
      body: string;
    };
    expect(replayBody.status).toBe(200);

    await new Promise((r) => setTimeout(r, 1500));

    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    // Issue POST count stayed at 1 — load-bearing assertion that
    // dedup prevents replay.
    const callsAfterReplay = await fetchGitHubCalls(request, mock.baseUrl);
    expect(callsAfterReplay.calls.issuesCreate).toHaveLength(1);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/auth/sign-in");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await Promise.all([
    page.waitForURL((url) => !/\/auth\/sign-in/.test(url.toString()), {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

interface GitHubMockInspect {
  calls: {
    authorize: {
      state: string;
      redirectUri: string | null;
      scope: string | null;
      clientId: string | null;
      codeChallenge: string | null;
      codeChallengeMethod: string | null;
    }[];
    tokenExchange: {
      authorization: string | undefined;
      contentType: string | undefined;
      accept: string | undefined;
      body: string;
      parsedBody: Record<string, string>;
    }[];
    userCalls: {
      authorization: string | undefined;
      accept: string | undefined;
      apiVersion: string | undefined;
    }[];
    reposGet: RestCallShape[];
    userReposCreate: RestCallShape[];
    issuesCreate: RestCallShape[];
    pullsCreate: RestCallShape[];
    gitRefsCreate: RestCallShape[];
    gitRefGet: RestCallShape[];
    gistsCreate: RestCallShape[];
    issueCommentsCreate: RestCallShape[];
    webhookCreate: {
      owner: string;
      repo: string;
      authorization: string | undefined;
      body: string;
      parsedBody: Record<string, unknown>;
      events: string[] | null;
      url: string | null;
      hasSecret: boolean;
      responseHookId: number;
    }[];
    webhookDelete: {
      owner: string;
      repo: string;
      hookId: number;
      authorization: string | undefined;
    }[];
    webhookEvent: {
      hookId: number;
      url: string;
      eventName: string;
      deliveryId: string;
      status: number;
      responseBody: string;
    }[];
  };
  hooks: Array<{
    id: number;
    owner: string;
    repo: string;
    url: string;
    secret: string;
    events: string[];
  }>;
}

interface RestCallShape {
  method: string;
  path: string;
  authorization: string | undefined;
  accept: string | undefined;
  apiVersion: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
}

async function fetchGitHubCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<GitHubMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as GitHubMockInspect;
}
