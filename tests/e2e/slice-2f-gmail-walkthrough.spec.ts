import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  cleanupWorkflowFilesForUser,
  createTestUser,
  deleteTestUser,
  ensureWorkflowFilesBucket,
  getDedupRow,
  getIntegrationsForUser,
  getNotificationsForUser,
  getOAuthStateRowCount,
  getTriggerResourcesForUser,
  getWorkflowFilesForUser,
  getWorkflowRunsForUser,
  readWorkflowFileObject,
  rewindTriggerPollingTimestamp,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readGoogleMockState } from "./global-setup";

/**
 * Slice 2f end-to-end walkthrough — Gmail polling trigger.
 *
 * Mirrors the shape of Slice 1's Slack walkthrough: real auth, real OAuth
 * dispatcher (PKCE state row + atomic consume), real integration row with
 * AES-encrypted tokens, real workflow create + activate, real polling
 * scheduler, real trigger handler. The Google network boundary is the
 * only thing mocked (authorize, token, profile, history.list, messages.get,
 * messages.send).
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in)
 *   - OAuth dispatcher + signed state + atomic consume + PKCE S256
 *   - Token endpoint POST (form-urlencoded with code_verifier)
 *   - Service-role integration insert + token encryption (AES-256-GCM)
 *   - Workflow CRUD + lifecycle preconditions + activate transition
 *   - Activation hook seam (Slice 2e): registerWorkflowTriggers consults
 *     activationRegistry, calls Gmail's activate which fetches getProfile
 *     and snapshots the historyId BEFORE upserting trigger_resources
 *   - Polling cron auth (CRON_SECRET bearer)
 *   - Polling scheduler iteration with concurrency/timeout
 *   - Gmail polling handler: history.list (V1 port), messages.get
 *     (format=metadata), filter matching (default INBOX), DB-backed
 *     dedup via webhook_event_dedup, checkpoint advancement
 *   - Engine + canonical resolver + Gmail send_email handler
 *   - refreshAndRetry token decryption on the send call
 *
 * Mocked surfaces (Google network boundary only):
 *   - accounts.google.com/o/oauth2/v2/auth → 302 to V2's gmail callback
 *   - oauth2.googleapis.com/token → canned access + refresh token
 *   - gmail.googleapis.com/gmail/v1/users/me/profile
 *   - gmail.googleapis.com/gmail/v1/users/me/history
 *   - gmail.googleapis.com/gmail/v1/users/me/messages/{id}
 *   - gmail.googleapis.com/gmail/v1/users/me/messages/send
 *
 * UI shortcut: V2's builder UI doesn't have per-node configuration yet
 * (Slice 1I.2 was minimum picker + list + save). The test patches the
 * workflow draft via the API at step "configure nodes" so the trigger
 * + action have valid `type` + `config` for execution. When per-node
 * configuration UI ships, this step becomes a UI walkthrough — same
 * comment as the Slice 1 spec.
 *
 * Two-run stability: every test run uses a fresh `msg-e2e-${randomUUID()}`
 * gmail message id, so the `webhook_event_dedup` row written by the first
 * run never collides with a second run. All other tables are cleaned via
 * `deleteTestUser`'s FK cascade.
 */

let testUser: TestUser | null = null;

test.describe("Slice 2f — full Gmail walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Gmail → build + activate → poll cycle → succeeded run → dedup blocks duplicate", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    // Per-run unique gmail message id so the webhook_event_dedup row
    // never collides across consecutive runs (the table is system-wide,
    // no user FK, so user-delete cascades don't clean it).
    const messageId = `msg-e2e-${randomUUID()}`;

    // Reset Google mock counters + email store so per-test assertions
    // are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Gmail (UI → mocked authorize → V2 callback → land) ──
    // The dynamic [provider]/callback route handles all providers; for
    // gmail it lands at /api/integrations/oauth/gmail/callback. After the
    // callback redirects, we land on /?integration=connected&provider=gmail.
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=gmail/),
      page.getByRole("button", { name: "Connect Gmail" }).click(),
    ]);

    // After OAuth: navigate to integrations page; Gmail row shows connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(user.id, "gmail");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;
    expect(integration.provider_account_id).toBe("alice@e2e.test");
    expect(integration.access_token_encrypted).toBeTruthy();
    // Encryption invariant: ciphertext must NOT equal plaintext mock value.
    expect(integration.access_token_encrypted).not.toBe("ya29.mock-e2e-access");
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe("1//mock-e2e-refresh");
    // Scopes: exactly the manifest's required quad (Gmail 2.1 added
    // gmail.modify + gmail.compose for label / draft / lifecycle
    // actions — pre-Gmail-2.1 the manifest required only readonly +
    // send).
    const scopes = integration.scopes as readonly string[];
    expect([...scopes].sort()).toEqual([
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ]);

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: exactly one authorize, one token exchange,
    // one profile call (the OAuth callback's accountId lookup).
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.profile).toHaveLength(1);
    expect(callsAfterOAuth.calls.send).toHaveLength(0);
    // Token exchange used PKCE: code_verifier was sent.
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.code_verifier,
    ).toBeTruthy();

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Gmail Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // V2's builder UI cannot configure node `type` + `config` yet
    // (Slice 1I.2 was minimum picker + list + save). When per-node
    // configuration UI ships, replace this with UI interaction.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "gmail",
          type: "new_email",
          // labelIds defaults to ["INBOX"] in the schema; we make it
          // explicit so the test reads the same way as the V2 schema.
          config: { labelIds: ["INBOX"] },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "gmail",
          type: "send_email",
          // Hardcoded recipient/subject/body — variable resolution from
          // trigger event is unit-tested elsewhere; this e2e exercises the
          // poll → enqueue → handler chain, not variable plumbing.
          // Both textBody + htmlBody set so the handler sends
          // `multipart/alternative` (Slice 2d Decision 2d-1, Option C).
          config: {
            to: "alice@e2e.test",
            subject: "Hello back",
            textBody: "Hello from e2e",
            htmlBody: "<p>Hello from e2e</p>",
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

    // Reload so the server-rendered builder picks up the patched definition.
    await page.reload();
    const nodeList = page.locator('ol[aria-label="Workflow nodes"]');
    await expect(nodeList.getByText(/trigger/i).first()).toBeVisible();
    await expect(nodeList.getByText(/action/i).first()).toBeVisible();

    // ── 6. Activate workflow via UI ──
    // This triggers the Slice 2e activation hook: registerWorkflowTriggers
    // consults activationRegistry, calls Gmail's activate function, which
    // fetches users.getProfile against the mock and stamps
    // config.snapshot.historyId BEFORE upsert.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // DB: trigger_resources row has the snapshot from the mock's
    // currentHistoryId (seed = "100000").
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("gmail");
    expect(triggerAfterActivate.event_type).toBe("new_email");
    const configAfterActivate = triggerAfterActivate.config as {
      pollingEnabled?: boolean;
      snapshot?: { historyId?: string; capturedAt?: string };
    };
    expect(configAfterActivate.pollingEnabled).toBe(true);
    expect(configAfterActivate.snapshot?.historyId).toBe("100000");
    expect(configAfterActivate.snapshot?.capturedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    // Mock saw a second profile call (one from OAuth callback, one from
    // activation hook). No history.list / messages.get yet.
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.profile).toHaveLength(2);
    expect(callsAfterActivate.calls.historyList).toHaveLength(0);
    expect(callsAfterActivate.calls.send).toHaveLength(0);

    // ── 7. Inject a new email via the mock control plane ──
    // Bumps mock currentHistoryId from "100000" to "100001" and queues
    // a `messageAdded` entry for the next history.list call.
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectEmail`,
      {
        data: {
          id: messageId,
          headers: {
            From: "Bob <bob@e2e.test>",
            To: "alice@e2e.test",
            Subject: "Hello",
            Date: new Date().toUTCString(),
          },
          mimeType: "multipart/alternative",
          snippet: "Test inbound message",
        },
      },
    );
    expect(injectResp.status()).toBe(200);

    // ── 8. Trigger a poll cycle ──
    const pollResp = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp.status(), await pollResp.text()).toBe(200);

    // ── 9. Wait for workflow_run → assert succeeded ──
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

    // ── 10. Mock saw exactly the expected Gmail calls ──
    const callsAfterPoll = await fetchMockCalls(request, mock.baseUrl);
    // history.list called once with the activation snapshot as start cursor.
    expect(callsAfterPoll.calls.historyList).toHaveLength(1);
    const historyCall = callsAfterPoll.calls.historyList[0]!;
    expect(historyCall.startHistoryId).toBe("100000");
    // V1-port behavior: BOTH messageAdded and labelAdded queried.
    expect(historyCall.historyTypes.sort()).toEqual([
      "labelAdded",
      "messageAdded",
    ]);
    // No labelId param — multi-label is filtered client-side (V1 parity).
    expect(historyCall.url).not.toMatch(/labelId=/);

    // messages.get called once for the injected message, format=metadata.
    expect(callsAfterPoll.calls.messagesGet).toHaveLength(1);
    expect(callsAfterPoll.calls.messagesGet[0]!.messageId).toBe(messageId);
    expect(callsAfterPoll.calls.messagesGet[0]!.format).toBe("metadata");

    // messages.send called exactly once with the right multipart body.
    expect(callsAfterPoll.calls.send).toHaveLength(1);
    const send = callsAfterPoll.calls.send[0]!;
    expect(send.parsed.mimeType).toBe("multipart/alternative");
    expect(send.parsed.headers.to).toBe("alice@e2e.test");
    expect(send.parsed.headers.subject).toBe("Hello back");
    expect(send.parsed.partsByMimeType["text/plain"] ?? "").toContain(
      "Hello from e2e",
    );
    // Authorization header carries the (decrypted) access token — proves
    // the encryption round-trip + refreshAndRetry plumbing.
    expect(send.authorization).toBe("Bearer ya29.mock-e2e-access");

    // ── 11. trigger_resources cursor advanced + dedup row written ──
    const triggerRowsAfterPoll = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterPoll).toHaveLength(1);
    const triggerAfterPoll = triggerRowsAfterPoll[0]! as Record<
      string,
      unknown
    >;
    const configAfterPoll = triggerAfterPoll.config as {
      snapshot?: { historyId?: string };
      polling?: { lastPolledAt?: string };
    };
    expect(configAfterPoll.snapshot?.historyId).toBe("100001");
    expect(configAfterPoll.polling?.lastPolledAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    // Dedup row written under (provider='gmail', event_id=messageId).
    const dedupRow = await getDedupRow("gmail", messageId);
    expect(dedupRow).not.toBeNull();

    // ── 12. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 13. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 14. Dedup probe — replay same email and re-poll ──
    // /__replayLastEmail re-queues the same gmail message id at its
    // original historyId (does NOT bump currentHistoryId). On the next
    // poll, history.list will surface the same message id; dedup must
    // catch it via webhook_event_dedup keyed on (gmail, messageId), and
    // no second workflow_run + no second send must occur.
    //
    // Rewind the polling cursor BEFORE the second poll so the
    // scheduler's 5-min interval gate doesn't skip this trigger. The
    // gate reads `config.polling.lastPolledAt`; setting it to 24h ago
    // simulates enough time elapsed.
    await rewindTriggerPollingTimestamp(triggerAfterPoll.id as string);
    const replayResp = await page.request.post(
      `${mock.baseUrl}/__replayLastEmail`,
    );
    expect(replayResp.status()).toBe(200);

    const pollResp2 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp2.status(), await pollResp2.text()).toBe(200);

    // Give the engine a moment to NOT execute a second run. We can't
    // wait-for-row (the row should not appear), so we busy-poll briefly
    // then assert the count stayed at 1.
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchMockCalls(request, mock.baseUrl);
    // The second poll DID hit history.list + messages.get (we don't
    // dedup at the API call boundary — we dedup at the enqueue boundary,
    // which is correct because the dedup table is the single source of
    // truth for "did this message already trigger a run").
    expect(callsAfterReplay.calls.historyList).toHaveLength(2);
    // messages.get may or may not have been called a second time —
    // it's called per-history-message before the dedup check in the
    // current Slice 2e implementation. The send count is the load-
    // bearing assertion: send must NOT have fired twice.
    expect(callsAfterReplay.calls.send).toHaveLength(1);
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

interface MockInspect {
  calls: {
    authorize: { state: string; scope: string; codeChallenge: string | null }[];
    tokenExchange: { body: string; parsedBody: Record<string, string> }[];
    profile: { authorization: string | undefined; responseHistoryId: string }[];
    historyList: {
      authorization: string | undefined;
      url: string;
      startHistoryId: string;
      pageToken: string | null;
      historyTypes: string[];
      responseEntries: number;
    }[];
    messagesGet: {
      authorization: string | undefined;
      url: string;
      messageId: string;
      format: string;
    }[];
    messagesAttachmentsGet: {
      authorization: string | undefined;
      url: string;
      messageId: string;
      attachmentId: string;
    }[];
    send: {
      authorization: string | undefined;
      raw: string;
      decoded: string;
      parsed: {
        headers: Record<string, string>;
        mimeType: string;
        partsByMimeType: Record<string, string>;
      };
    }[];
  };
  currentHistoryId: string;
  emailCount: number;
  pendingHistoryEntries: { historyId: string; messageId: string }[];
  lastInjectedMessageId: string | null;
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`e2e: ${name} env var is required`);
  return v;
}

// ───────────────────────────────────────────────────────────────────────
// Gmail 2.3 — triggers + attachments walkthrough extension
//
// Three triggers + one action added in Commits 3-5:
//   - new_labeled_email (Commit 3): polling trigger that fires when a
//     configured labelId is added to a message.
//   - new_attachment    (Commit 4): polling trigger that fires when a
//     message arrives with attachments; payload is metadata-only.
//   - get_attachment    (Commit 5): action that fetches Gmail attachment
//     bytes and stages them to the workflow-files bucket via P-S3.
//
// Mocked surfaces extended in this commit (Gmail 2.3 Commit 6):
//   - users.history.list now emits labelsAdded entries (queued by the
//     new /__injectLabelChange control-plane endpoint).
//   - users.messages.get accepts `format=full` and returns
//     `payload.parts` populated from the email's injected attachments.
//   - users.messages.attachments.get returns `{data, size}` where data
//     is the base64url-encoded fixture supplied at inject time.
//
// Workers note: all four scenarios use the shared Google mock server
// (single shared process). The repo-wide playwright.config.ts already
// runs e2e single-worker, so per-test cursor isolation comes from the
// per-test fresh test user + the /__reset call at scenario start.
// ───────────────────────────────────────────────────────────────────────

interface PatchedDraftDefinition {
  nodes: Array<{
    id: string;
    kind: "trigger" | "action";
    provider: string;
    type: string;
    config: Record<string, unknown>;
    position: { x: number; y: number };
  }>;
  edges: Array<{ id: string; from: string; to: string }>;
}

async function buildSignInAndConnectGmail(
  page: Page,
  user: TestUser,
): Promise<void> {
  await signIn(page, user);
  await page.goto("/integrations");
  await Promise.all([
    page.waitForURL(/\/\?integration=connected&provider=gmail/),
    page.getByRole("button", { name: "Connect Gmail" }).click(),
  ]);
}

async function createAndActivateWorkflow(
  page: Page,
  draft: PatchedDraftDefinition,
  workflowName: string,
): Promise<string> {
  const createResp = await page.request.post("/api/workflows", {
    data: { name: workflowName },
  });
  expect(createResp.status(), await createResp.text()).toBe(201);
  const wfId = ((await createResp.json()) as { id: string }).id;
  const patch = await page.request.patch(`/api/workflows/${wfId}`, {
    data: { draftDefinition: draft },
  });
  expect(patch.status(), await patch.text()).toBe(200);
  const activate = await page.request.post(
    `/api/workflows/${wfId}/activate`,
  );
  expect(activate.status(), await activate.text()).toBe(200);
  return wfId;
}

test.describe("Gmail 2.3 — triggers + get_attachment", () => {
  let gmail23User: TestUser | null = null;

  test.beforeEach(async () => {
    gmail23User = await createTestUser();
    await ensureWorkflowFilesBucket();
  });

  test.afterEach(async () => {
    if (gmail23User) {
      await cleanupWorkflowFilesForUser(gmail23User.id);
      await deleteTestUser(gmail23User.id);
      gmail23User = null;
    }
  });

  test("new_labeled_email fires for the configured labelId; non-matching labelsAdded does NOT fire", async ({
    page,
    request,
  }) => {
    if (!gmail23User) throw new Error("test user setup failed");
    const user = gmail23User;
    const mock = await readGoogleMockState();
    const cronSecret = requireEnv("CRON_SECRET");
    const messageId = `msg-labeled-${randomUUID()}`;

    await page.request.post(`${mock.baseUrl}/__reset`);
    await buildSignInAndConnectGmail(page, user);

    // Trigger needs no downstream action to assert payload — using a
    // gmail send_email action as a deterministic sink for the
    // workflow_run is the simplest way to read action input from the
    // run.steps log. The action's `subject` echoes the labelAppliedId
    // from the trigger payload via the resolver; if the trigger fires
    // for the configured label, the send will record that string.
    const wfId = await createAndActivateWorkflow(
      page,
      {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger",
            provider: "gmail",
            type: "new_labeled_email",
            config: { labelId: "Label_WORK" },
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action",
            provider: "gmail",
            type: "send_email",
            config: {
              to: "alice@e2e.test",
              subject: "Labeled: {{trigger.payload.labelAppliedId}}",
              textBody:
                "Labels in event: {{trigger.payload.labelsAdded}}; subject: {{trigger.payload.subject}}",
              htmlBody:
                "<p>Labels in event: {{trigger.payload.labelsAdded}}</p>",
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
      "WF Gmail 2.3 new_labeled_email",
    );

    // 1) Inject an email with no labelsAdded yet — its arrival event is
    //    a messagesAdded, which new_labeled_email MUST ignore (the
    //    trigger filters source === "labelsAdded" first).
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectEmail`,
      {
        data: {
          id: messageId,
          headers: {
            From: "Bob <bob@e2e.test>",
            To: "alice@e2e.test",
            Subject: "Work email",
            Date: new Date().toUTCString(),
          },
          snippet: "Pre-labeled work item",
        },
      },
    );
    expect(injectResp.status()).toBe(200);

    // 2) Inject a labelsAdded for a DIFFERENT label first — must NOT fire.
    const nonMatchingResp = await page.request.post(
      `${mock.baseUrl}/__injectLabelChange`,
      {
        data: { messageId, addedLabelIds: ["Label_NOISE"] },
      },
    );
    expect(nonMatchingResp.status()).toBe(200);

    // 3) Inject a labelsAdded for the CONFIGURED label — MUST fire.
    const matchingResp = await page.request.post(
      `${mock.baseUrl}/__injectLabelChange`,
      {
        data: { messageId, addedLabelIds: ["Label_WORK", "IMPORTANT"] },
      },
    );
    expect(matchingResp.status()).toBe(200);

    // 4) Poll cycle.
    const pollResp = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp.status(), await pollResp.text()).toBe(200);

    // 5) Exactly one run, succeeded. The trigger collapsed events to
    //    the configured label only — even though the same message id
    //    had two labelsAdded events queued.
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        const matchingRuns = rows.filter(
          (r) => (r as { workflow_id?: string }).workflow_id === wfId,
        );
        return matchingRuns.length > 0 ? matchingRuns : null;
      },
      {
        description: "workflow_runs row for new_labeled_email",
        timeoutMs: 15_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.status).toBe("succeeded");

    // 6) Mock-side: history.list called once for the polling tick;
    //    messages.get hydrated the message ONCE (the trigger collapses
    //    duplicate labelsAdded for the same messageId within a tick);
    //    send fired exactly once with the resolved labelAppliedId.
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.calls.historyList).toHaveLength(1);
    expect(calls.calls.messagesGet).toHaveLength(1);
    expect(calls.calls.send).toHaveLength(1);
    const send = calls.calls.send[0]!;
    // Variable resolver substituted the labelAppliedId into the
    // subject — proof the trigger payload carried the configured label.
    expect(send.parsed.headers.subject).toBe("Labeled: Label_WORK");
    // Body carries the labelsAdded list verbatim (rendered as a JSON
    // stringification or comma-join depending on resolver — assert it
    // contains both labels regardless of separator).
    const textBody = send.parsed.partsByMimeType["text/plain"] ?? "";
    expect(textBody).toContain("Label_WORK");
    expect(textBody).toContain("IMPORTANT");
    expect(textBody).toContain("Work email");

    // 7) Dedup row uses the labeled:<messageId> prefix (Commit 3 contract).
    const labeledDedup = await getDedupRow("gmail", `labeled:${messageId}`);
    expect(labeledDedup).not.toBeNull();
    // Cross-trigger isolation: no bare-key dedup row was written.
    const bareDedup = await getDedupRow("gmail", messageId);
    expect(bareDedup).toBeNull();
  });

  test("new_attachment fires only for messages with attachments; payload is metadata-only (no FileRef / bytes)", async ({
    page,
    request,
  }) => {
    if (!gmail23User) throw new Error("test user setup failed");
    const user = gmail23User;
    const mock = await readGoogleMockState();
    const cronSecret = requireEnv("CRON_SECRET");
    const withAttId = `msg-att-${randomUUID()}`;
    const noAttId = `msg-noatt-${randomUUID()}`;

    await page.request.post(`${mock.baseUrl}/__reset`);
    await buildSignInAndConnectGmail(page, user);

    // Action echoes the trigger's attachment-array length + filename
    // into the send subject + body so the run.steps record carries the
    // trigger payload fields. send_email is a deterministic sink that
    // doesn't add network round-trips beyond /messages/send.
    const wfId = await createAndActivateWorkflow(
      page,
      {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger",
            provider: "gmail",
            type: "new_attachment",
            config: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action",
            provider: "gmail",
            type: "send_email",
            config: {
              to: "alice@e2e.test",
              subject: "Attached: {{trigger.payload.attachmentCount}}",
              textBody:
                "filename={{trigger.payload.attachments[0].filename}} mime={{trigger.payload.attachments[0].mimeType}} size={{trigger.payload.attachments[0].sizeBytes}}",
              htmlBody:
                "<p>fid={{trigger.payload.attachments[0].attachmentId}}</p>",
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
      "WF Gmail 2.3 new_attachment",
    );

    // 1) Inject an attachment-less email FIRST. messagesAdded but no
    //    attachments — the trigger must NOT fire (extractAttachmentMetadata
    //    returns []).
    const noAttResp = await page.request.post(
      `${mock.baseUrl}/__injectEmail`,
      {
        data: {
          id: noAttId,
          headers: {
            From: "noatt@e2e.test",
            To: "alice@e2e.test",
            Subject: "No attachment",
            Date: new Date().toUTCString(),
          },
        },
      },
    );
    expect(noAttResp.status()).toBe(200);

    // 2) Inject an email WITH a single attachment. base64url of "REPORT"
    //    is "UkVQT1JU" — used by the get_attachment test below; here we
    //    just need the part to be enumerable.
    const attBytesB64 = Buffer.from("REPORT").toString("base64url");
    const withAttResp = await page.request.post(
      `${mock.baseUrl}/__injectEmail`,
      {
        data: {
          id: withAttId,
          headers: {
            From: "att@e2e.test",
            To: "alice@e2e.test",
            Subject: "Has attachment",
            Date: new Date().toUTCString(),
          },
          attachments: [
            {
              attachmentId: "att-meta-1",
              filename: "report.pdf",
              mimeType: "application/pdf",
              sizeBytes: 6,
              base64Data: attBytesB64,
            },
          ],
        },
      },
    );
    expect(withAttResp.status()).toBe(200);

    // 3) Poll cycle.
    const pollResp = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp.status(), await pollResp.text()).toBe(200);

    // 4) Exactly ONE run — only the attachment-bearing message fired.
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        const matchingRuns = rows.filter(
          (r) => (r as { workflow_id?: string }).workflow_id === wfId,
        );
        return matchingRuns.length > 0 ? matchingRuns : null;
      },
      {
        description: "workflow_runs row for new_attachment",
        timeoutMs: 15_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.status).toBe("succeeded");

    // 5) Mock-side: format=full was used for both messages (the trigger
    //    hydrates every messagesAdded id with format=full). The
    //    attachments endpoint was NOT hit — new_attachment trigger is
    //    metadata-only per Gmail 2.3 plan §13.2.
    const calls = await fetchMockCalls(request, mock.baseUrl);
    const fullFormatGets = calls.calls.messagesGet.filter(
      (g) => g.format === "full",
    );
    expect(fullFormatGets.map((g) => g.messageId).sort()).toEqual(
      [noAttId, withAttId].sort(),
    );
    expect(calls.calls.messagesAttachmentsGet).toHaveLength(0);
    expect(calls.calls.send).toHaveLength(1);

    // 6) Payload assertions — trigger payload carried the attachments
    //    array + count + filename, and NO bytes/base64/content.
    const send = calls.calls.send[0]!;
    expect(send.parsed.headers.subject).toBe("Attached: 1");
    const textBody = send.parsed.partsByMimeType["text/plain"] ?? "";
    expect(textBody).toContain("filename=report.pdf");
    expect(textBody).toContain("mime=application/pdf");
    expect(textBody).toContain("size=6");
    const htmlBody = send.parsed.partsByMimeType["text/html"] ?? "";
    expect(htmlBody).toContain("fid=att-meta-1");

    // 7) Dedup row uses attachment:<messageId>; bare key + labeled:
    //    key are NOT written (cross-trigger isolation).
    const attDedup = await getDedupRow("gmail", `attachment:${withAttId}`);
    expect(attDedup).not.toBeNull();
    const bareDedup = await getDedupRow("gmail", withAttId);
    expect(bareDedup).toBeNull();
    const labeledDedup = await getDedupRow("gmail", `labeled:${withAttId}`);
    expect(labeledDedup).toBeNull();

    // 8) Defense-in-depth: trigger payload reached the action with NO
    //    inline byte keys (data / content / base64 / bytes / file /
    //    fileRef). The action's resolved textBody / htmlBody / subject
    //    were the only resolver outputs — the body itself contains no
    //    base64url representation of "UkVQT1JU".
    expect(textBody).not.toContain(attBytesB64);
    expect(textBody).not.toContain("data");
    expect(textBody).not.toContain("base64");
    expect(textBody).not.toContain("fileRef");
    expect(htmlBody).not.toContain(attBytesB64);
  });

  test("new_attachment → get_attachment composed flow: stages bytes to v2_storage, output FileRef carries no bytes", async ({
    page,
    request,
  }) => {
    if (!gmail23User) throw new Error("test user setup failed");
    const user = gmail23User;
    const mock = await readGoogleMockState();
    const cronSecret = requireEnv("CRON_SECRET");
    const messageId = `msg-fetch-${randomUUID()}`;

    await page.request.post(`${mock.baseUrl}/__reset`);
    await buildSignInAndConnectGmail(page, user);

    // Sentinel bytes for round-trip assertion: 0xCA 0xFE 0xBA 0xBE +
    // "GMAIL_2_3_E2E". base64url-encoded for the wire shape; the handler
    // decodes back via decodeBase64Url before staging.
    const sentinelBytes = new Uint8Array([
      0xca,
      0xfe,
      0xba,
      0xbe,
      ...Buffer.from("GMAIL_2_3_E2E", "ascii"),
    ]);
    const sentinelB64 = Buffer.from(sentinelBytes).toString("base64url");

    // Composed flow: trigger payload's messageId + attachments[0].attachmentId
    // feed the get_attachment action's config via the resolver.
    const wfId = await createAndActivateWorkflow(
      page,
      {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger",
            provider: "gmail",
            type: "new_attachment",
            config: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action",
            provider: "gmail",
            type: "get_attachment",
            config: {
              messageId: "{{trigger.payload.id}}",
              attachmentId: "{{trigger.payload.attachments[0].attachmentId}}",
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
      "WF Gmail 2.3 composed get_attachment",
    );

    // Inject an attachment-bearing email. The handler will fetch the
    // attachment bytes via attachments.get, decode base64url, then
    // stageFileToStorage.
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectEmail`,
      {
        data: {
          id: messageId,
          headers: {
            From: "fetch@e2e.test",
            To: "alice@e2e.test",
            Subject: "Bytes please",
            Date: new Date().toUTCString(),
          },
          attachments: [
            {
              attachmentId: "att-fetch-1",
              filename: "compose.bin",
              mimeType: "application/octet-stream",
              sizeBytes: sentinelBytes.byteLength,
              base64Data: sentinelB64,
            },
          ],
        },
      },
    );
    expect(injectResp.status()).toBe(200);

    const pollResp = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp.status(), await pollResp.text()).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        const matchingRuns = rows.filter(
          (r) => (r as { workflow_id?: string }).workflow_id === wfId,
        );
        return matchingRuns.length > 0 ? matchingRuns : null;
      },
      {
        description: "workflow_runs row for get_attachment compose",
        timeoutMs: 20_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      id: string;
      status: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.status).toBe("succeeded");
    const runId = run.id;

    // Mock-side: get_attachment hydrated metadata with format=full AND
    // hit attachments.get exactly once. (The trigger ALSO hydrates with
    // format=full, so the spec accepts >=1 messagesGet entries with the
    // composed message id at format=full.)
    const calls = await fetchMockCalls(request, mock.baseUrl);
    const fullMessageGets = calls.calls.messagesGet.filter(
      (g) => g.format === "full" && g.messageId === messageId,
    );
    expect(fullMessageGets.length).toBeGreaterThanOrEqual(2); // trigger + action
    expect(calls.calls.messagesAttachmentsGet).toHaveLength(1);
    expect(calls.calls.messagesAttachmentsGet[0]).toMatchObject({
      messageId,
      attachmentId: "att-fetch-1",
    });
    // Authorization header on the attachments.get call — proves the
    // refreshAndRetry encryption round-trip.
    expect(calls.calls.messagesAttachmentsGet[0]!.authorization).toBe(
      "Bearer ya29.mock-e2e-access",
    );

    // DB-side: a workflow_files row was created for the staged bytes.
    const stagedRows = await getWorkflowFilesForUser(user.id);
    const stagedForWorkflow = stagedRows.filter(
      (r) => (r as { workflow_id?: string }).workflow_id === wfId,
    );
    expect(stagedForWorkflow).toHaveLength(1);
    const stagedRow = stagedForWorkflow[0]! as {
      storage_path: string;
      file_name: string;
      mime_type: string;
      size_bytes: number | null;
      metadata: Record<string, unknown>;
    };
    expect(stagedRow.file_name).toBe("compose.bin");
    expect(stagedRow.mime_type).toBe("application/octet-stream");
    expect(stagedRow.size_bytes).toBe(sentinelBytes.byteLength);
    expect(stagedRow.storage_path).toBe(
      `${user.id}/${wfId}/${runId}/action-node/${stagedRow.file_name}`,
    );
    // Metadata policy (Gmail 2.3 plan §9): ONLY messageId + attachmentId.
    // No email headers, no subject, no addresses, no tokens, no snippets.
    expect(stagedRow.metadata).toEqual({
      messageId,
      attachmentId: "att-fetch-1",
    });

    // Storage object exists; bytes round-trip the sentinel.
    const stagedBytes = await readWorkflowFileObject(stagedRow.storage_path);
    expect(Array.from(stagedBytes)).toEqual(Array.from(sentinelBytes));

    // Action output: FileRef(kind=v2_storage, provider="gmail").
    const actionStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as
      | { output?: Record<string, unknown>; status?: string }
      | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    const file = output.file as Record<string, unknown> | undefined;
    expect(file?.kind).toBe("v2_storage");
    expect(file?.provider).toBe("gmail");
    expect(file?.storagePath).toBe(stagedRow.storage_path);
    expect(file?.name).toBe("compose.bin");
    expect(file?.mimeType).toBe("application/octet-stream");
    expect(output.messageId).toBe(messageId);
    expect(output.attachmentId).toBe("att-fetch-1");
    expect(output.fileName).toBe("compose.bin");
    expect(output.mimeType).toBe("application/octet-stream");
    expect(output.sizeBytes).toBe(sentinelBytes.byteLength);

    // CLAUDE.md / Gmail 2.3 plan §9 — no inline byte keys in output.
    const outKeys = Object.keys(output);
    expect(outKeys).not.toContain("data");
    expect(outKeys).not.toContain("content");
    expect(outKeys).not.toContain("base64");
    expect(outKeys).not.toContain("bytes");
    // And no base64 representation of the sentinel appears anywhere
    // in the serialized output — defense in depth.
    const serializedOutput = JSON.stringify(output);
    expect(serializedOutput).not.toContain(sentinelB64);
    expect(serializedOutput).not.toContain("UkFFRkVCQUJF");
  });
});
