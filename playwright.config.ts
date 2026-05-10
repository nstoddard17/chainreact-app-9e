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
 * Notion mock server runs on this port (started by global-setup.ts). The
 * dev server inherits NOTION_AUTHORIZE_BASE / NOTION_API_BASE pointing
 * here for the Slice 9 Notion walkthrough — OAuth callback token
 * exchange + /v1/users/me + /v1/pages CRUD + databases query + blocks
 * append + search.
 */
const NOTION_MOCK_PORT = Number(process.env.NOTION_MOCK_PORT ?? "9879");
const NOTION_MOCK_BASE = `http://127.0.0.1:${NOTION_MOCK_PORT}`;

/**
 * Airtable mock server runs on this port (started by global-setup.ts).
 * The dev server inherits AIRTABLE_AUTHORIZE_BASE / AIRTABLE_TOKEN_BASE /
 * AIRTABLE_API_BASE pointing here for the Slice 10 walkthrough — OAuth
 * callback token exchange + /v0/meta/whoami + records CRUD + schema +
 * webhook create/refresh/delete + payload listing.
 */
const AIRTABLE_MOCK_PORT = Number(process.env.AIRTABLE_MOCK_PORT ?? "9880");
const AIRTABLE_MOCK_BASE = `http://127.0.0.1:${AIRTABLE_MOCK_PORT}`;

/**
 * Stripe mock server runs on this port (started by global-setup.ts).
 * The dev server inherits STRIPE_AUTHORIZE_BASE / STRIPE_TOKEN_BASE /
 * STRIPE_API_BASE pointing here for the Slice 11 walkthrough — Stripe
 * Connect OAuth (body-auth, no PKCE) + REST customers + webhook
 * endpoint lifecycle + signed-event delivery for the event_received
 * trigger.
 */
const STRIPE_MOCK_PORT = Number(process.env.STRIPE_MOCK_PORT ?? "9881");
const STRIPE_MOCK_BASE = `http://127.0.0.1:${STRIPE_MOCK_PORT}`;

/**
 * Shopify mock server runs on this port (started by global-setup.ts).
 * The dev server inherits SHOPIFY_API_BASE_OVERRIDE pointing here for
 * the Slice 12 walkthrough — Shopify's per-shop OAuth (JSON body, no
 * PKCE) + Admin REST customers + webhook lifecycle + signed-event
 * delivery for the webhook_received trigger. Unlike every other V2
 * provider, Shopify URLs are per-shop (`https://{shop}/...`) — the
 * override prepends a single mock origin so the mock can extract the
 * shop from the path's first segment.
 */
const SHOPIFY_MOCK_PORT = Number(process.env.SHOPIFY_MOCK_PORT ?? "9882");
const SHOPIFY_MOCK_BASE = `http://127.0.0.1:${SHOPIFY_MOCK_PORT}`;

/**
 * HubSpot mock server runs on this port (started by global-setup.ts).
 * The dev server inherits HUBSPOT_AUTHORIZE_BASE / HUBSPOT_TOKEN_BASE /
 * HUBSPOT_API_BASE pointing here for the Slice 13 walkthrough — OAuth
 * (body-auth, no PKCE) + CRM v3 contacts + webhook subscription v3
 * lifecycle + signed-event delivery for the consolidated
 * `webhook_received` trigger backed by shared-subscription tables.
 */
const HUBSPOT_MOCK_PORT = Number(process.env.HUBSPOT_MOCK_PORT ?? "9883");
const HUBSPOT_MOCK_BASE = `http://127.0.0.1:${HUBSPOT_MOCK_PORT}`;

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
      // Slice 9: route Notion OAuth + REST API calls through the mock.
      // integrations/notion/oauth.ts honors NOTION_AUTHORIZE_BASE and
      // NOTION_API_BASE; integrations/_shared/notion/api/_base.ts honors
      // NOTION_API_BASE. The mock owns /v1/oauth/{authorize,token},
      // /v1/pages (POST/GET/PATCH), /v1/databases/{id}/query,
      // /v1/blocks/{id}/children, /v1/search.
      NOTION_AUTHORIZE_BASE: NOTION_MOCK_BASE,
      NOTION_API_BASE: NOTION_MOCK_BASE,
      // Slice 9: e2e Notion client id/secret. Production uses values
      // from notion.so/my-integrations; the e2e value is throwaway.
      // The mock validates Basic auth header presence/format but doesn't
      // check the credential values themselves.
      NOTION_CLIENT_ID:
        process.env.NOTION_CLIENT_ID ?? "e2e-notion-client-id",
      NOTION_CLIENT_SECRET:
        process.env.NOTION_CLIENT_SECRET ?? "e2e-notion-client-secret",
      // Slice 10: route Airtable OAuth + REST + webhooks through the
      // mock. integrations/airtable/oauth.ts honors AIRTABLE_AUTHORIZE_BASE,
      // AIRTABLE_TOKEN_BASE, AIRTABLE_API_BASE; the API + webhook
      // wrappers honor AIRTABLE_API_BASE. The mock owns
      // /oauth2/v1/{authorize,token}, /v0/meta/whoami, /v0/meta/bases/.../tables,
      // /v0/{baseId}/{table}{,/recordId}, /v0/bases/.../webhooks{,/refresh,/payloads}.
      AIRTABLE_AUTHORIZE_BASE: AIRTABLE_MOCK_BASE,
      AIRTABLE_TOKEN_BASE: AIRTABLE_MOCK_BASE,
      AIRTABLE_API_BASE: AIRTABLE_MOCK_BASE,
      // Slice 10: e2e Airtable client id/secret. Production uses values
      // from the Airtable developer portal; the e2e value is throwaway.
      // The mock validates Basic auth header presence + format but
      // doesn't check the credential values.
      AIRTABLE_CLIENT_ID:
        process.env.AIRTABLE_CLIENT_ID ?? "e2e-airtable-client-id",
      AIRTABLE_CLIENT_SECRET:
        process.env.AIRTABLE_CLIENT_SECRET ?? "e2e-airtable-client-secret",
      // Slice 11: route Stripe Connect OAuth + REST + webhook endpoint
      // management through the mock. integrations/stripe/oauth.ts
      // honors STRIPE_AUTHORIZE_BASE and STRIPE_TOKEN_BASE;
      // _shared/stripe/api/_base.ts honors STRIPE_API_BASE (used by
      // both the action wrappers and the webhook_endpoints API
      // wrapper). The mock owns /oauth/{authorize,token},
      // /v1/customers, /v1/webhook_endpoints{,/id}.
      STRIPE_AUTHORIZE_BASE: STRIPE_MOCK_BASE,
      STRIPE_TOKEN_BASE: STRIPE_MOCK_BASE,
      STRIPE_API_BASE: STRIPE_MOCK_BASE,
      // Slice 11: e2e Stripe Connect platform credentials. Production
      // uses a `ca_xxx` client id + `sk_xxx` secret from the Stripe
      // dashboard; the e2e values are throwaway. The mock validates
      // body-auth (client_secret in body, no Basic auth header) but
      // doesn't check the credential values themselves. The same
      // STRIPE_CLIENT_SECRET is used for OAuth body-auth AND webhook
      // endpoint management on the platform account — Stripe
      // Connect's model.
      STRIPE_CLIENT_ID:
        process.env.STRIPE_CLIENT_ID ?? "ca_e2e_stripe_client_id",
      STRIPE_CLIENT_SECRET:
        process.env.STRIPE_CLIENT_SECRET ?? "sk_e2e_stripe_client_secret",
      // Slice 12: route Shopify per-shop OAuth + Admin REST + webhook
      // lifecycle through the mock. integrations/_shared/shopify/api/
      // _base.ts honors SHOPIFY_API_BASE_OVERRIDE — when set, every
      // `https://{shop}/...` URL becomes `${override}/{shop}/...` (oauth
      // authorize, oauth token, /admin/api/2024-10/* — same override for
      // every per-shop call site). The mock parses the shop from the
      // first path segment and routes accordingly.
      //
      // SHOPIFY_WEBHOOK_URL is set to the e2e dev server (the activate
      // hook reads it for the notification URL it sends Shopify). The
      // notification URL points at /api/webhooks/shopify on the V2 dev
      // server; the mock POSTs signed events to that URL.
      SHOPIFY_API_BASE_OVERRIDE: SHOPIFY_MOCK_BASE,
      SHOPIFY_WEBHOOK_URL: E2E_BASE_URL,
      // Slice 12: e2e Shopify Custom App credentials. Production uses
      // values from the Shopify Partner dashboard; the e2e values are
      // throwaway. The mock validates Content-Type (JSON body) and that
      // client_secret is present in the body but doesn't check the
      // credential values. SHOPIFY_CLIENT_SECRET ALSO doubles as the
      // single global webhook signing key — Shopify's design (one app
      // secret, two purposes). The mock signs deliveries with this
      // exact value so V2's verifyShopifySignature accepts them.
      SHOPIFY_CLIENT_ID:
        process.env.SHOPIFY_CLIENT_ID ?? "e2e-shopify-client-id",
      SHOPIFY_CLIENT_SECRET:
        process.env.SHOPIFY_CLIENT_SECRET ?? "e2e-shopify-client-secret",
      // Slice 13: route HubSpot OAuth + CRM v3 REST + webhooks v3
      // through the mock. integrations/hubspot/oauth.ts honors
      // HUBSPOT_AUTHORIZE_BASE + HUBSPOT_TOKEN_BASE;
      // integrations/_shared/hubspot/api/_base.ts honors HUBSPOT_API_BASE
      // (used by CRM wrappers, the account-info dual-endpoint helper,
      // and the webhook subscription wrappers). The mock owns
      // /oauth/{authorize,v1/token}, /oauth/v1/access-tokens/{token},
      // /integrations/v1/me, /crm/v3/objects/contacts, /webhooks/v3/{appId}/subscriptions{,/id}.
      HUBSPOT_AUTHORIZE_BASE: HUBSPOT_MOCK_BASE,
      HUBSPOT_TOKEN_BASE: HUBSPOT_MOCK_BASE,
      HUBSPOT_API_BASE: HUBSPOT_MOCK_BASE,
      // Slice 13: e2e HubSpot Public App credentials. Production uses
      // values from the HubSpot developer-portal app settings; the
      // e2e values are throwaway. HUBSPOT_CLIENT_SECRET ALSO doubles
      // as the global webhook signing key — HubSpot's design (one
      // app secret, both purposes). The mock signs deliveries with
      // this exact value so V2's verifyHubSpotSignature accepts them.
      HUBSPOT_CLIENT_ID:
        process.env.HUBSPOT_CLIENT_ID ?? "e2e-hubspot-client-id",
      HUBSPOT_CLIENT_SECRET:
        process.env.HUBSPOT_CLIENT_SECRET ?? "e2e-hubspot-client-secret",
      // Slice 13: the activate hook reads HUBSPOT_APP_ID for the
      // /webhooks/v3/{appId}/subscriptions URL. The receive route uses
      // it to look up `hubspot_app_subscriptions` rows by app id. The
      // e2e value is throwaway.
      HUBSPOT_APP_ID: process.env.HUBSPOT_APP_ID ?? "11223344",
      // Slice 13: the receive route uses this exact URL inside the
      // canonical signing string. The mock POSTs signed events to this
      // URL and the dev server's verifier reads this env. Both must
      // agree on the value.
      HUBSPOT_WEBHOOK_URL: `${E2E_BASE_URL}/api/webhooks/hubspot`,
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
