import { defineConfig, devices } from "@playwright/test";

/**
 * Slack mock server runs on this port (started by global-setup.ts). The
 * dev server inherits SLACK_API_BASE / SLACK_AUTHORIZE_BASE pointing here,
 * so all of V2's Slack outbound calls land on the mock.
 *
 * Fixed port: keeps the dev-server env vars stable across the run. If the
 * port collides with something else local, fail loud at globalSetup time.
 */
const SLACK_MOCK_PORT = Number(process.env.SLACK_MOCK_PORT ?? "9876");
const MOCK_BASE = `http://127.0.0.1:${SLACK_MOCK_PORT}`;

/**
 * Google mock server runs on this port (started by global-setup.ts). The
 * dev server inherits GMAIL_API_BASE / GOOGLE_AUTHORIZE_BASE /
 * GOOGLE_TOKEN_BASE pointing here, so all of V2's server-side Google
 * outbound calls land on the mock — including the OAuth callback's
 * token exchange + getProfile, the Slice 2e activation hook, and the
 * polling cycle's history.list / messages.get / messages.send.
 */
const GMAIL_MOCK_PORT = Number(process.env.GMAIL_MOCK_PORT ?? "9877");
const GOOGLE_MOCK_BASE = `http://127.0.0.1:${GMAIL_MOCK_PORT}`;

/**
 * Microsoft mock server runs on this port (started by global-setup.ts). The
 * dev server inherits MICROSOFT_AUTHORIZE_BASE / MICROSOFT_TOKEN_BASE /
 * MICROSOFT_GRAPH_API_BASE pointing here for the Slice 6 Outlook
 * walkthrough — OAuth callback token exchange + Graph /me + sendMail +
 * getMessage + subscriptions create/renew/delete.
 */
const MICROSOFT_MOCK_PORT = Number(process.env.MICROSOFT_MOCK_PORT ?? "9878");
const MICROSOFT_MOCK_BASE = `http://127.0.0.1:${MICROSOFT_MOCK_PORT}`;

/**
 * E2e dev server port. Default 3001 — separate from the typical dev port
 * (3000) so a developer keeping a dev server running for manual testing
 * doesn't collide with the e2e dev server, and so the e2e dev server
 * doesn't accidentally inherit a manual setup's env. Overridable via
 * E2E_PORT.
 */
const E2E_PORT = Number(process.env.E2E_PORT ?? "3001");
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    // E2e baseURL is hardcoded to the dev server Playwright starts.
    // .env.local's NEXT_PUBLIC_APP_URL may point at an ngrok tunnel for
    // manual OAuth testing — that's irrelevant here. The webServer below
    // also explicitly overrides NEXT_PUBLIC_APP_URL so the app's OAuth
    // callback redirects stay on localhost.
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Different port from the typical dev server (3000) so a developer
      // can keep a dev server running for manual testing without colliding.
      PORT: String(E2E_PORT),
      // Route V2's Slack OAuth + chat.postMessage calls through the mock.
      // Production never sets these; the override is e2e-only.
      SLACK_API_BASE: MOCK_BASE,
      SLACK_AUTHORIZE_BASE: MOCK_BASE,
      // Slice 2f: route Google OAuth + Gmail API calls through the
      // Google mock. Same e2e-only override pattern. integrations/gmail/
      // oauth.ts already supports all three env vars (Slice 2c shipped
      // them); the cron route + activation hook + polling handler all
      // read GMAIL_API_BASE, so all four code paths land on the mock.
      GMAIL_API_BASE: GOOGLE_MOCK_BASE,
      GOOGLE_AUTHORIZE_BASE: GOOGLE_MOCK_BASE,
      GOOGLE_TOKEN_BASE: GOOGLE_MOCK_BASE,
      // Slice 3b: route Calendar API calls + the OIDC userinfo lookup
      // through the same mock server. The mock owns the Calendar v3 paths
      // and the /v1/userinfo path alongside the Gmail paths.
      GOOGLE_CALENDAR_API_BASE: GOOGLE_MOCK_BASE,
      GOOGLE_USERINFO_BASE: GOOGLE_MOCK_BASE,
      // Slice 4b: route Drive metadata + upload calls through the same
      // mock server. integrations/google-drive/api/_base.ts honors both
      // GOOGLE_DRIVE_API_BASE (drive/v3 paths) and GOOGLE_DRIVE_UPLOAD_BASE
      // (upload/drive/v3). Both point to the same mock; the multipart
      // upload path is exercised in unit tests, not in the Slice 4b
      // walkthrough (which uses create_folder for its action proof).
      GOOGLE_DRIVE_API_BASE: GOOGLE_MOCK_BASE,
      GOOGLE_DRIVE_UPLOAD_BASE: GOOGLE_MOCK_BASE,
      // Slice 5b: route Sheets API calls through the same mock server.
      // integrations/google-sheets/api/_base.ts honors GOOGLE_SHEETS_API_BASE.
      // Sheets ALSO uses Drive's files.watch + changes.getStartPageToken
      // for its watch transport — those calls are already mocked under
      // the Drive routes (no extra env var needed).
      GOOGLE_SHEETS_API_BASE: GOOGLE_MOCK_BASE,
      // Slice 6: route Microsoft Outlook OAuth + Graph calls through the
      // mock. integrations/microsoft-outlook/oauth.ts honors AUTHORIZE
      // and TOKEN bases; api/_base.ts honors GRAPH_API_BASE. The mock
      // owns /common/oauth2/v2.0/{authorize,token}, /v1.0/me,
      // /v1.0/me/sendMail, /v1.0/me/messages/{id}, and
      // /v1.0/subscriptions{,/id}.
      MICROSOFT_AUTHORIZE_BASE: MICROSOFT_MOCK_BASE,
      MICROSOFT_TOKEN_BASE: MICROSOFT_MOCK_BASE,
      MICROSOFT_GRAPH_API_BASE: MICROSOFT_MOCK_BASE,
      // Slice 6: e2e Microsoft client id/secret. Production uses Azure
      // AD app values; the e2e value is throwaway. The mock doesn't
      // validate them, but oauth.ts's `getClientId()` / `getClientSecret()`
      // throw when these env vars are unset — so we set them here.
      MICROSOFT_CLIENT_ID:
        process.env.MICROSOFT_CLIENT_ID ?? "e2e-microsoft-client-id",
      MICROSOFT_CLIENT_SECRET:
        process.env.MICROSOFT_CLIENT_SECRET ?? "e2e-microsoft-client-secret",
      // Slice 3b: fixed test value so the spec process and the dev server
      // produce/verify the same channel token. Production sets the real
      // secret via Vercel; the e2e value is throwaway. Falling back to
      // .env.local would require the user to set this manually — overriding
      // here keeps the e2e self-contained.
      WATCH_CHANNEL_SECRET:
        process.env.WATCH_CHANNEL_SECRET ?? "e2e-watch-channel-secret",
      // Force the dev server to use the e2e port as its public URL even
      // when .env.local sets NEXT_PUBLIC_APP_URL to something else (e.g.
      // an ngrok tunnel for manual testing). The OAuth dispatcher reads
      // this for redirect_uri construction.
      NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
    },
  },
});
