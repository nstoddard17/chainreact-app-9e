/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — Phase 9 read-only provider identity
 * probes.
 *
 * Each probe performs the NARROWEST identity/read endpoint the provider
 * offers (the same endpoints the connect flows already use — see the audit
 * doc), sends nothing but the credential, creates/modifies nothing, and
 * returns ONLY:
 *   - ok (token accepted),
 *   - identity (the provider-account discriminator, for an in-memory match
 *     against the source row's provider_account_id — redacted before any
 *     report), and
 *   - identitySupported (false = acceptance-only probe, e.g. Power BI whose
 *     token audience cannot call Graph /me).
 *
 * Probes NEVER throw on provider rejection — they map it to a typed failure
 * so the orchestrator can report and roll back. Network errors are typed
 * `network`. Every response body is discarded after identity extraction.
 */
import type { CredentialPlaintext, ProbeResult, VerificationProbe } from "./types";

const TIMEOUT_MS = 15_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

async function probeFetch(
  url: string,
  init: FetchInit,
  extract: (body: unknown, status: number) => ProbeResult,
): Promise<ProbeResult> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { ok: false, identity: null, identitySupported: true, failure: "network" };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, identity: null, identitySupported: true, failure: "unauthorized" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) {
      return { ok: false, identity: null, identitySupported: true, failure: "unauthorized" };
    }
    return { ok: false, identity: null, identitySupported: true, failure: "malformed_response" };
  }
  return extract(body, res.status);
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function identityFrom(
  ok: boolean,
  identity: unknown,
): ProbeResult {
  if (!ok) {
    return { ok: false, identity: null, identitySupported: true, failure: "unauthorized" };
  }
  if (typeof identity !== "string" && typeof identity !== "number") {
    return { ok: false, identity: null, identitySupported: true, failure: "malformed_response" };
  }
  return { ok: true, identity: String(identity), identitySupported: true };
}

// ── Google family ────────────────────────────────────────────────────────────

const googleUserinfo: VerificationProbe = (creds) =>
  probeFetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { email?: unknown }).email),
  );

const gmailProfile: VerificationProbe = (creds) =>
  probeFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { emailAddress?: unknown }).emailAddress),
  );

// ── Microsoft family ─────────────────────────────────────────────────────────

const graphMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id",
    { headers: bearer(creds.accessToken) },
    (b, s) => {
      const body = b as { mail?: unknown; userPrincipalName?: unknown };
      return identityFrom(s < 400, body.mail ?? body.userPrincipalName);
    },
  );

/** Power BI tokens cannot call Graph — acceptance-only probe (list groups). */
const powerbiTokenOnly: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.powerbi.com/v1.0/myorg/groups?$top=1",
    { headers: bearer(creds.accessToken) },
    (_b, s) =>
      s < 400
        ? { ok: true, identity: null, identitySupported: false }
        : { ok: false, identity: null, identitySupported: false, failure: "unauthorized" },
  );

// ── Everyone else ────────────────────────────────────────────────────────────

const slackAuthTest: VerificationProbe = (creds) =>
  probeFetch(
    "https://slack.com/api/auth.test",
    { method: "POST", headers: bearer(creds.accessToken) },
    (b) => {
      const body = b as { ok?: unknown; team_id?: unknown };
      return identityFrom(body.ok === true, body.team_id);
    },
  );

const githubUser: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.github.com/user",
    { headers: { ...bearer(creds.accessToken), "User-Agent": "chainreact-transplant" } },
    (b, s) => identityFrom(s < 400, (b as { login?: unknown }).login),
  );

const notionMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.notion.com/v1/users/me",
    { headers: { ...bearer(creds.accessToken), "Notion-Version": "2022-06-28" } },
    (b, s) => {
      const bot = (b as { bot?: unknown }).bot;
      // providerAccountId for notion is the bot_id.
      return identityFrom(s < 400 && !!bot, (b as { id?: unknown }).id);
    },
  );

const airtableWhoami: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.airtable.com/v0/meta/whoami",
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { id?: unknown }).id),
  );

const hubspotIntrospect: VerificationProbe = (creds) =>
  probeFetch(
    // HubSpot's official access-token introspection endpoint (already used by
    // the connect flow) — the token appears in the PATH by HubSpot's design.
    `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(creds.accessToken)}`,
    {},
    (b, s) => identityFrom(s < 400, (b as { hub_id?: unknown }).hub_id),
  );

const mailchimpMetadata: VerificationProbe = async (creds) => {
  const meta = await probeFetch(
    "https://login.mailchimp.com/oauth2/metadata",
    { headers: { Authorization: `OAuth ${creds.accessToken}` } },
    (b, s) => identityFrom(s < 400, (b as { dc?: unknown }).dc),
  );
  if (!meta.ok || !meta.identity) return meta;
  return probeFetch(
    `https://${meta.identity}.api.mailchimp.com/3.0/`,
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { account_id?: unknown }).account_id),
  );
};

const stripeAccount: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.stripe.com/v1/account",
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { id?: unknown }).id),
  );

const shopifyShop: VerificationProbe = (creds) =>
  probeFetch(
    `https://${creds.providerAccountId}/admin/api/2024-10/shop.json`,
    { headers: { "X-Shopify-Access-Token": creds.accessToken } },
    (b, s) => {
      const shop = (b as { shop?: { myshopify_domain?: unknown } }).shop;
      return identityFrom(s < 400, shop?.myshopify_domain);
    },
  );

const mondayMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.monday.com/v2",
    {
      method: "POST",
      headers: { Authorization: creds.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query { me { email } }" }),
    },
    (b, s) => {
      const me = (b as { data?: { me?: { email?: unknown } } }).data?.me;
      return identityFrom(s < 400 && !!me, me?.email);
    },
  );

const discordMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://discord.com/api/v10/users/@me",
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { id?: unknown }).id),
  );

const dropboxCurrentAccount: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.dropboxapi.com/2/users/get_current_account",
    { method: "POST", headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { account_id?: unknown }).account_id),
  );

const facebookMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://graph.facebook.com/v19.0/me?fields=id",
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { id?: unknown }).id),
  );

const asanaMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://app.asana.com/api/1.0/users/me?opt_fields=email",
    { headers: bearer(creds.accessToken) },
    (b, s) => {
      const data = (b as { data?: { email?: unknown } }).data;
      return identityFrom(s < 400 && !!data, data?.email);
    },
  );

const typeformMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.typeform.com/me",
    { headers: bearer(creds.accessToken) },
    (b, s) => identityFrom(s < 400, (b as { email?: unknown }).email),
  );

const calendlyMe: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.calendly.com/users/me",
    { headers: bearer(creds.accessToken) },
    (b, s) => {
      const resource = (b as { resource?: { email?: unknown } }).resource;
      return identityFrom(s < 400 && !!resource, resource?.email);
    },
  );

const quickbooksCompanyInfo: VerificationProbe = (creds) => {
  const realm = encodeURIComponent(creds.providerAccountId);
  return probeFetch(
    `https://quickbooks.api.intuit.com/v3/company/${realm}/companyinfo/${realm}?minorversion=70`,
    { headers: { ...bearer(creds.accessToken), Accept: "application/json" } },
    (b, s) =>
      // A 200 on the realm-scoped endpoint proves both token AND realm.
      identityFrom(s < 400 && !!(b as { CompanyInfo?: unknown }).CompanyInfo, creds.providerAccountId),
  );
};

const motiveCompanies: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.gomotive.com/v1/companies",
    { headers: bearer(creds.accessToken) },
    (b, s) => {
      if (s >= 400) {
        return { ok: false, identity: null, identitySupported: true, failure: "unauthorized" };
      }
      const companies = (b as { companies?: Array<{ company?: { company_id?: unknown; id?: unknown } }> })
        .companies;
      if (!Array.isArray(companies)) {
        return { ok: false, identity: null, identitySupported: true, failure: "malformed_response" };
      }
      const ids = companies
        .map((c) => c.company?.company_id ?? c.company?.id)
        .filter((x): x is string | number => typeof x === "string" || typeof x === "number")
        .map(String);
      const match = ids.find((id) => id === creds.providerAccountId);
      return identityFrom(true, match ?? ids[0] ?? null);
    },
  );

const linearViewer: VerificationProbe = (creds) =>
  probeFetch(
    "https://api.linear.app/graphql",
    {
      method: "POST",
      headers: { ...bearer(creds.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query { viewer { id } }" }),
    },
    (b, s) => {
      const viewer = (b as { data?: { viewer?: { id?: unknown } } }).data?.viewer;
      return identityFrom(s < 400 && !!viewer, viewer?.id);
    },
  );

const trelloMe: VerificationProbe = (creds) => {
  // Trello auth is a (deployment API key, user token) PAIR — the probe needs
  // the same TRELLO_CLIENT_ID the dev runtime will use.
  const key = process.env.TRELLO_CLIENT_ID;
  if (!key) {
    return Promise.resolve<ProbeResult>({
      ok: false,
      identity: null,
      identitySupported: true,
      failure: "malformed_response",
    });
  }
  const qs = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(creds.accessToken)}&fields=id`;
  return probeFetch(
    `https://api.trello.com/1/members/me?${qs}`,
    {},
    (b, s) => identityFrom(s < 400, (b as { id?: unknown }).id),
  );
};

const fleetioAccounts: VerificationProbe = (creds) =>
  probeFetch(
    "https://secure.fleetio.com/api/v1/accounts",
    {
      headers: {
        Authorization: `Token ${creds.accessToken}`,
        Accept: "application/json",
      },
    },
    (b, s) => {
      if (s >= 400) {
        return { ok: false, identity: null, identitySupported: true, failure: "unauthorized" };
      }
      const records = Array.isArray(b)
        ? (b as Array<{ id?: unknown; token?: unknown }>)
        : ((b as { records?: Array<{ id?: unknown; token?: unknown }> }).records ?? []);
      const accountToken = creds.extras?.accountToken;
      const match = accountToken
        ? records.find((r) => r.token === accountToken)
        : undefined;
      return identityFrom(!!match, match?.id ?? null);
    },
  );

// ── Registry ─────────────────────────────────────────────────────────────────

export const VERIFICATION_PROBES: Record<string, VerificationProbe> = {
  gmail: gmailProfile,
  "google-calendar": googleUserinfo,
  "google-docs": googleUserinfo,
  "google-drive": googleUserinfo,
  "google-sheets": googleUserinfo,
  "google-analytics": googleUserinfo,
  "microsoft-outlook": graphMe,
  "microsoft-outlook-calendar": graphMe,
  "microsoft-onedrive": graphMe,
  "microsoft-onenote": graphMe,
  "microsoft-excel": graphMe,
  "microsoft-teams": graphMe,
  "microsoft-powerbi": powerbiTokenOnly,
  slack: slackAuthTest,
  github: githubUser,
  notion: notionMe,
  airtable: airtableWhoami,
  hubspot: hubspotIntrospect,
  mailchimp: mailchimpMetadata,
  stripe: stripeAccount,
  shopify: shopifyShop,
  monday: mondayMe,
  discord: discordMe,
  dropbox: dropboxCurrentAccount,
  facebook: facebookMe,
  asana: asanaMe,
  typeform: typeformMe,
  calendly: calendlyMe,
  quickbooks: quickbooksCompanyInfo,
  motive: motiveCompanies,
  linear: linearViewer,
  trello: trelloMe,
  fleetio: fleetioAccounts,
  // eden / adp: no probe — classification marks them accordingly.
};

export function getProbe(provider: string): VerificationProbe | null {
  return VERIFICATION_PROBES[provider] ?? null;
}

export type { CredentialPlaintext };
