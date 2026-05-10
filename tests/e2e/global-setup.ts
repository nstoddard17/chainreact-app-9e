import { mkdir, writeFile, readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
 * Vars that the test spec / helpers explicitly need from .env.local but
 * that aren't picked up automatically (Playwright workers don't share the
 * Next.js dev-server env). Listed here so we don't blindly lift everything
 * from .env.local — most importantly, NEXT_PUBLIC_APP_URL stays whatever
 * it was (or undefined), because the user may have it pointing at an ngrok
 * tunnel for manual testing and we don't want that URL leaking into the
 * spec process.
 */
const SPEC_PROCESS_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SLACK_SIGNING_SECRET",
  // Slice 2f: the spec POSTs to /api/cron/poll-triggers with
  // `Authorization: Bearer $CRON_SECRET`. The dev server reads
  // CRON_SECRET from .env.local automatically; the spec process needs
  // it lifted explicitly.
  "CRON_SECRET",
  // Slice 3b: the Calendar walkthrough hand-crafts the inbound webhook
  // POST to /api/webhooks/google-calendar with an X-Goog-Channel-Token
  // computed via buildChannelToken (HMAC-SHA256 over channelId, keyed
  // on WATCH_CHANNEL_SECRET). The dev server has it from .env.local;
  // the spec needs the same secret to produce a token the receive
  // route's verifyChannelToken accepts.
  "WATCH_CHANNEL_SECRET",
];

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

function loadDotEnvLocal(): void {
  const envPath = resolve(__dirname, "../../.env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (!SPEC_PROCESS_ENV_KEYS.includes(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = m[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export default async function globalSetup(): Promise<void> {
  loadDotEnvLocal();
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
