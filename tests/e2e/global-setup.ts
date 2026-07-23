import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadTestEnv } from "./helpers/testEnv";
import {
  startMockSlackServer,
  type MockSlackHandle,
} from "./helpers/mockSlackServer";
import {
  startMockGoogleServer,
  type MockGoogleHandle,
} from "./helpers/mockGoogleServer";
import {
  startMockMicrosoftServer,
  type MockMicrosoftHandle,
} from "./helpers/mockMicrosoftServer";
import {
  startMockNotionServer,
  type MockNotionHandle,
} from "./helpers/mockNotionServer";
import {
  startMockAirtableServer,
  type MockAirtableHandle,
} from "./helpers/mockAirtableServer";
import {
  startMockStripeServer,
  type MockStripeHandle,
} from "./helpers/mockStripeServer";
import {
  startMockShopifyServer,
  type MockShopifyHandle,
} from "./helpers/mockShopifyServer";
import {
  startMockHubSpotServer,
  type MockHubSpotHandle,
} from "./helpers/mockHubSpotServer";
import {
  startMockGitHubServer,
  type MockGitHubHandle,
} from "./helpers/mockGitHubServer";
import {
  startMockMailchimpServer,
  type MockMailchimpHandle,
} from "./helpers/mockMailchimpServer";
import {
  startMockTrelloServer,
  type MockTrelloHandle,
} from "./helpers/mockTrelloServer";

/**
 * Playwright global setup.
 *
 * Boots the mock Slack + Google servers before any tests run. Writes each
 * resolved base URL to its own state file so individual specs can read
 * them without cross-process plumbing (Playwright's globalSetup return
 * value isn't accessible from spec files in the same way).
 *
 * The dev server (started via webServer in playwright.config.ts) has
 * SLACK_API_BASE / SLACK_AUTHORIZE_BASE / GMAIL_API_BASE /
 * GOOGLE_AUTHORIZE_BASE / GOOGLE_TOKEN_BASE env vars pointing at these
 * same mock URLs — that's what makes V2's server-side calls land on the
 * mocks.
 *
 * Module-level handles: held in module-scoped variables for
 * global-teardown to reach. Playwright invokes both setup + teardown in
 * the same Node process, so module state survives.
 */

let slackHandle: MockSlackHandle | null = null;
let googleHandle: MockGoogleHandle | null = null;
let microsoftHandle: MockMicrosoftHandle | null = null;
let notionHandle: MockNotionHandle | null = null;
let airtableHandle: MockAirtableHandle | null = null;
let stripeHandle: MockStripeHandle | null = null;
let shopifyHandle: MockShopifyHandle | null = null;
let hubspotHandle: MockHubSpotHandle | null = null;
let githubHandle: MockGitHubHandle | null = null;
let mailchimpHandle: MockMailchimpHandle | null = null;
let trelloHandle: MockTrelloHandle | null = null;

export const STATE_FILE = resolve(__dirname, ".state/mock-slack.json");
export const GOOGLE_STATE_FILE = resolve(
  __dirname,
  ".state/mock-google.json",
);
export const MICROSOFT_STATE_FILE = resolve(
  __dirname,
  ".state/mock-microsoft.json",
);
export const NOTION_STATE_FILE = resolve(
  __dirname,
  ".state/mock-notion.json",
);
export const AIRTABLE_STATE_FILE = resolve(
  __dirname,
  ".state/mock-airtable.json",
);
export const STRIPE_STATE_FILE = resolve(
  __dirname,
  ".state/mock-stripe.json",
);
export const SHOPIFY_STATE_FILE = resolve(
  __dirname,
  ".state/mock-shopify.json",
);
export const HUBSPOT_STATE_FILE = resolve(
  __dirname,
  ".state/mock-hubspot.json",
);
export const GITHUB_STATE_FILE = resolve(
  __dirname,
  ".state/mock-github.json",
);
export const MAILCHIMP_STATE_FILE = resolve(
  __dirname,
  ".state/mock-mailchimp.json",
);
export const TRELLO_STATE_FILE = resolve(
  __dirname,
  ".state/mock-trello.json",
);

export function getMockHandle(): MockSlackHandle | null {
  return slackHandle;
}

export function getGoogleMockHandle(): MockGoogleHandle | null {
  return googleHandle;
}

export function getMicrosoftMockHandle(): MockMicrosoftHandle | null {
  return microsoftHandle;
}

export function getNotionMockHandle(): MockNotionHandle | null {
  return notionHandle;
}

export function getAirtableMockHandle(): MockAirtableHandle | null {
  return airtableHandle;
}

export function getStripeMockHandle(): MockStripeHandle | null {
  return stripeHandle;
}

export function getShopifyMockHandle(): MockShopifyHandle | null {
  return shopifyHandle;
}

export function getHubSpotMockHandle(): MockHubSpotHandle | null {
  return hubspotHandle;
}

export function getGitHubMockHandle(): MockGitHubHandle | null {
  return githubHandle;
}

export function getMailchimpMockHandle(): MockMailchimpHandle | null {
  return mailchimpHandle;
}

export function getTrelloMockHandle(): MockTrelloHandle | null {
  return trelloHandle;
}

/**
 * Minimal .env.local loader for the Playwright spec process.
 *
 * Next.js auto-loads .env.local for the dev server but Playwright workers
 * don't share that environment. Without this, the spec process is missing
 * SLACK_SIGNING_SECRET (needed to sign the webhook POST) and
 * SUPABASE_SERVICE_ROLE_KEY (needed for createTestUser cleanup helpers),
 * and the test fails with confusing missing-env errors.
 *
 * Lifts variables from .env.local into process.env. Existing values aren't
 * overwritten so a CI environment can still override.
 */
/**
 * Slice 12: Shopify webhook signing key. The mock server signs webhook
 * deliveries with this exact secret so V2's `verifyShopifySignature` (which
 * reads `SHOPIFY_CLIENT_SECRET` from the dev server env) accepts them.
 * Spec process and dev server must agree on the value — playwright.config.ts
 * sets the same default for the webServer when the env is unset, and we
 * mirror that fallback here so the spec process always boots the mock with
 * the matching secret.
 */
const SHOPIFY_E2E_CLIENT_SECRET_DEFAULT = "e2e-shopify-client-secret";

/**
 * Slice 13: HubSpot webhook signing key. The mock server signs webhook
 * deliveries with this exact secret so V2's `verifyHubSpotSignature` (which
 * reads `HUBSPOT_CLIENT_SECRET` from the dev server env) accepts them.
 * Spec process and dev server must agree on the value — playwright.config.ts
 * sets the same default for the webServer when the env is unset, and we
 * mirror that fallback here so the spec process always boots the mock with
 * the matching secret.
 */
const HUBSPOT_E2E_CLIENT_SECRET_DEFAULT = "e2e-hubspot-client-secret";

/**
 * Slice 14b: GitHub webhook signing key. The mock signs deliveries
 * with this exact secret so V2's `verifyGitHubSignature` (which reads
 * `GITHUB_WEBHOOK_SECRET` from the dev server env) accepts them.
 * Distinct from `GITHUB_CLIENT_SECRET` per Slice 14b plan §"V1 bugs
 * to fix" #3 — V1 silently fell back to the OAuth client secret;
 * V2 requires a dedicated webhook secret.
 */
const GITHUB_E2E_WEBHOOK_SECRET_DEFAULT = "e2e-github-webhook-secret";

/**
 * Slice 17 Commit 6: Trello OAuth client secret. Same secret doubles
 * as the webhook HMAC key — Trello signs webhooks with the OAuth
 * client secret (the global app secret, not the user token). The mock
 * must use the same value the dev server's `verifyTrelloSignature`
 * reads.
 */
const TRELLO_E2E_CLIENT_SECRET_DEFAULT = "e2e-trello-client-secret";

export default async function globalSetup(): Promise<void> {
  // CS-7D — the Playwright spec/worker process gets its Supabase + secret env
  // from `.env.test.local` (loopback local Supabase), NEVER from `.env.local`.
  // Fail-closed if the required local vars are missing (see loadTestEnv).
  loadTestEnv();
  // Slice 3b: if neither process.env nor .env.local set WATCH_CHANNEL_SECRET,
  // fall back to the fixed test value the playwright.config.ts webServer.env
  // also defaults to. Keeps the spec process and the dev server in sync
  // without forcing the user to edit .env.local.
  if (!process.env.WATCH_CHANNEL_SECRET) {
    process.env.WATCH_CHANNEL_SECRET = "e2e-watch-channel-secret";
  }
  // Mock callbacks land on the e2e dev server, not the dev/manual server.
  // Match playwright.config.ts E2E_PORT default.
  const e2ePort = Number(process.env.E2E_PORT ?? "3001");
  const appBaseUrl = `http://localhost:${e2ePort}`;

  const slackPort = Number(process.env.SLACK_MOCK_PORT ?? "9876");
  slackHandle = await startMockSlackServer({ appBaseUrl, port: slackPort });
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(
    STATE_FILE,
    JSON.stringify({
      port: slackPort,
      baseUrl: slackHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Slack listening at ${slackHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  const googlePort = Number(process.env.GMAIL_MOCK_PORT ?? "9877");
  googleHandle = await startMockGoogleServer({
    appBaseUrl,
    port: googlePort,
  });
  await writeFile(
    GOOGLE_STATE_FILE,
    JSON.stringify({
      port: googlePort,
      baseUrl: googleHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Google listening at ${googleHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 6: mock Microsoft (Azure AD + Graph) for the Outlook mail
  // walkthrough. Different port (9878) so Slack + Google + Microsoft
  // can all run simultaneously under one global-setup.
  const microsoftPort = Number(process.env.MICROSOFT_MOCK_PORT ?? "9878");
  microsoftHandle = await startMockMicrosoftServer({
    appBaseUrl,
    port: microsoftPort,
  });
  await writeFile(
    MICROSOFT_STATE_FILE,
    JSON.stringify({
      port: microsoftPort,
      baseUrl: microsoftHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Microsoft listening at ${microsoftHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 9: mock Notion for the Notion walkthrough. Different port
  // (9879) so all four mock servers can run simultaneously.
  const notionPort = Number(process.env.NOTION_MOCK_PORT ?? "9879");
  notionHandle = await startMockNotionServer({
    appBaseUrl,
    port: notionPort,
  });
  await writeFile(
    NOTION_STATE_FILE,
    JSON.stringify({
      port: notionPort,
      baseUrl: notionHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Notion listening at ${notionHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 10: mock Airtable for the Airtable walkthrough. Different
  // port (9880) so all five mock servers can run simultaneously.
  const airtablePort = Number(process.env.AIRTABLE_MOCK_PORT ?? "9880");
  airtableHandle = await startMockAirtableServer({
    appBaseUrl,
    port: airtablePort,
  });
  await writeFile(
    AIRTABLE_STATE_FILE,
    JSON.stringify({
      port: airtablePort,
      baseUrl: airtableHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Airtable listening at ${airtableHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 11: mock Stripe for the Stripe Connect walkthrough.
  // Different port (9881) so all six mock servers can run
  // simultaneously.
  const stripePort = Number(process.env.STRIPE_MOCK_PORT ?? "9881");
  stripeHandle = await startMockStripeServer({
    appBaseUrl,
    port: stripePort,
  });
  await writeFile(
    STRIPE_STATE_FILE,
    JSON.stringify({
      port: stripePort,
      baseUrl: stripeHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Stripe listening at ${stripeHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 12: mock Shopify for the per-shop OAuth + webhook walkthrough.
  // Different port (9882) so all seven mock servers can run
  // simultaneously. The mock signs webhook deliveries with
  // SHOPIFY_CLIENT_SECRET — must match what the dev server reads.
  const shopifyPort = Number(process.env.SHOPIFY_MOCK_PORT ?? "9882");
  const shopifySecret =
    process.env.SHOPIFY_CLIENT_SECRET ?? SHOPIFY_E2E_CLIENT_SECRET_DEFAULT;
  shopifyHandle = await startMockShopifyServer({
    appBaseUrl,
    appSecret: shopifySecret,
    port: shopifyPort,
  });
  await writeFile(
    SHOPIFY_STATE_FILE,
    JSON.stringify({
      port: shopifyPort,
      baseUrl: shopifyHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Shopify listening at ${shopifyHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 13: mock HubSpot for the CRM + shared-subscription webhook
  // walkthrough. Different port (9883) so all eight mock servers can
  // run simultaneously. The mock signs webhook deliveries with
  // HUBSPOT_CLIENT_SECRET — must match what the dev server reads. The
  // webhook URL embedded in the canonical signing string must match
  // HUBSPOT_WEBHOOK_URL on the dev server.
  const hubspotPort = Number(process.env.HUBSPOT_MOCK_PORT ?? "9883");
  const hubspotSecret =
    process.env.HUBSPOT_CLIENT_SECRET ?? HUBSPOT_E2E_CLIENT_SECRET_DEFAULT;
  const hubspotWebhookUrl = `${appBaseUrl}/api/webhooks/hubspot`;
  hubspotHandle = await startMockHubSpotServer({
    appBaseUrl,
    appSecret: hubspotSecret,
    webhookUrl: hubspotWebhookUrl,
    port: hubspotPort,
  });
  await writeFile(
    HUBSPOT_STATE_FILE,
    JSON.stringify({
      port: hubspotPort,
      baseUrl: hubspotHandle.baseUrl,
      appBaseUrl,
      webhookUrl: hubspotWebhookUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock HubSpot listening at ${hubspotHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 14b: mock GitHub for the OAuth + REST + per-repo webhook
  // walkthrough. Different port (9884) so all nine mock servers can
  // run simultaneously. The mock signs webhook deliveries with
  // GITHUB_WEBHOOK_SECRET — must match what the dev server reads.
  const githubPort = Number(process.env.GITHUB_MOCK_PORT ?? "9884");
  const githubSecret =
    process.env.GITHUB_WEBHOOK_SECRET ?? GITHUB_E2E_WEBHOOK_SECRET_DEFAULT;
  githubHandle = await startMockGitHubServer({
    appBaseUrl,
    webhookSecret: githubSecret,
    port: githubPort,
  });
  await writeFile(
    GITHUB_STATE_FILE,
    JSON.stringify({
      port: githubPort,
      baseUrl: githubHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock GitHub listening at ${githubHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 14: mock Mailchimp for the OAuth + dc-routed REST + per-audience
  // webhook + polling walkthrough. Different port (9885) so all ten mock
  // servers can run simultaneously. Mailchimp doesn't sign webhooks —
  // no shared signing key plumbing needed.
  const mailchimpPort = Number(process.env.MAILCHIMP_MOCK_PORT ?? "9885");
  mailchimpHandle = await startMockMailchimpServer({
    appBaseUrl,
    port: mailchimpPort,
  });
  await writeFile(
    MAILCHIMP_STATE_FILE,
    JSON.stringify({
      port: mailchimpPort,
      baseUrl: mailchimpHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Mailchimp listening at ${mailchimpHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );

  // Slice 17 Commit 6: mock Trello for the token-ingest + per-board
  // webhook walkthrough. Different port (9886) so all eleven mock
  // servers can run simultaneously. The mock signs webhook deliveries
  // with TRELLO_CLIENT_SECRET — must match what the dev server reads
  // (Trello reuses the OAuth client secret as the webhook signing key).
  const trelloPort = Number(process.env.TRELLO_MOCK_PORT ?? "9886");
  const trelloSecret =
    process.env.TRELLO_CLIENT_SECRET ?? TRELLO_E2E_CLIENT_SECRET_DEFAULT;
  trelloHandle = await startMockTrelloServer({
    appBaseUrl,
    appSecret: trelloSecret,
    port: trelloPort,
  });
  await writeFile(
    TRELLO_STATE_FILE,
    JSON.stringify({
      port: trelloPort,
      baseUrl: trelloHandle.baseUrl,
      appBaseUrl,
    }),
    "utf8",
  );
  console.log(
    `[e2e] mock Trello listening at ${trelloHandle.baseUrl} (V2 callbacks land on ${appBaseUrl})`,
  );
}

/**
 * Spec-side helper to read the Slack mock URL written by global-setup.
 * Specs that need to assert on the mock's recorded calls go through the
 * shared `getMockHandle()` import — it's the same module instance because
 * Jest/Playwright isolates per-process, not per-import.
 */
export async function readMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readGoogleMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(GOOGLE_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readMicrosoftMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(MICROSOFT_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readNotionMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(NOTION_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readAirtableMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(AIRTABLE_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readStripeMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(STRIPE_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readShopifyMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(SHOPIFY_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readHubSpotMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
  webhookUrl: string;
}> {
  const raw = await readFile(HUBSPOT_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
    webhookUrl: string;
  };
}

export async function readGitHubMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(GITHUB_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readMailchimpMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(MAILCHIMP_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}

export async function readTrelloMockState(): Promise<{
  port: number;
  baseUrl: string;
  appBaseUrl: string;
}> {
  const raw = await readFile(TRELLO_STATE_FILE, "utf8");
  return JSON.parse(raw) as {
    port: number;
    baseUrl: string;
    appBaseUrl: string;
  };
}
