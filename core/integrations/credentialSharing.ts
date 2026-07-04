/**
 * Provider credential-sharing policy (Slice 4.ACCOUNT-MODEL-22A).
 *
 * Audit reference: docs/slices/phase-4/team-integration-credential-access-audit.md
 *
 * Classifies whether a provider's OAuth credential is a PERSONAL credential
 * (acts as the connecting human — their mailbox / drive / chat identity) or an
 * ACCOUNT/service credential (a shared workspace / store / portal / business the
 * whole team jointly operates).
 *
 *   - `personal` → in a Team account this credential must NOT be silently usable
 *     by every member. Provenance (`connected_by_user_id`) matters. Default for
 *     unknown providers (fail-safe).
 *   - `account`  → account-shared use matches the provider's own semantics (the
 *     token represents a shared org resource, not one person).
 *
 * **This is NOT `tokenScope`.** `tokenScope` ("user" | "workspace") only tells
 * the OAuth layer how to KEY a credential for multi-account discrimination — it
 * is not a sharing policy. Many `tokenScope: "user"` providers (Stripe, Shopify,
 * HubSpot, Mailchimp) are genuinely account/service resources, and conversely a
 * `"user"`-keyed Gmail is deeply personal. Do not derive sharing from tokenScope.
 *
 * CLASSIFICATION-ONLY SLICE: this module introduces the policy + helpers and
 * changes NO runtime behavior. Execution / options / AI / offboarding continue
 * to ignore it until later slices (22B+) wire it in.
 */

export type CredentialSharing = "personal" | "account";

/**
 * Unknown / unlisted providers are treated as PERSONAL — the conservative,
 * fail-safe default (never auto-share a credential we haven't deliberately
 * marked shareable).
 */
export const DEFAULT_CREDENTIAL_SHARING: CredentialSharing = "personal";

/**
 * Explicit per-provider policy. Every provider in the registry
 * (`integrations/_registry.ts` ALL_MANIFESTS) MUST have an entry here — the
 * coverage test fails the build if a registered provider is missing, so a
 * newly-added provider can't silently fall through to the default.
 *
 * "Needs decision" providers from the audit (github / facebook / airtable /
 * trello / monday) are intentionally classified `personal` for launch safety
 * until a product decision says otherwise.
 */
const POLICY: Readonly<Record<string, CredentialSharing>> = Object.freeze({
  // ── Account / service: a shared org resource; account-sharing is correct. ──
  slack: "account", // workspace bot token
  notion: "account", // workspace grant
  stripe: "account", // business account
  shopify: "account", // store
  hubspot: "account", // portal
  mailchimp: "account", // account

  // ── Personal: acts AS the connecting human; must not auto-share in a Team. ──
  gmail: "personal",
  "microsoft-outlook": "personal",
  "microsoft-outlook-calendar": "personal",
  "google-calendar": "personal",
  "google-drive": "personal",
  "google-sheets": "personal",
  "google-docs": "personal",
  "google-analytics": "personal",
  "microsoft-onedrive": "personal",
  "microsoft-onenote": "personal",
  "microsoft-excel": "personal",
  "microsoft-teams": "personal",
  dropbox: "personal",
  discord: "personal",
  // Asana (Slice 5.ASANA-1): the OAuth token acts AS the connecting human —
  // their task assignments, their comment authorship. Same posture as
  // Trello / Monday.
  asana: "personal",
  // Typeform (Slice 5.TYPEFORM-1): the OAuth token acts AS the connecting
  // human — their forms, their workspaces. Same posture as Trello /
  // Monday / Asana, and the launch-safe default.
  typeform: "personal",

  // ── Needs product decision → default personal for launch safety. ──
  github: "personal",
  facebook: "personal",
  airtable: "personal",
  trello: "personal",
  monday: "personal",
});

/** The credential-sharing class for a provider (default `personal`). */
export function credentialSharingForProvider(provider: string): CredentialSharing {
  return POLICY[provider] ?? DEFAULT_CREDENTIAL_SHARING;
}

/** True when the provider's credential acts as the connecting human. */
export function isPersonalCredentialProvider(provider: string): boolean {
  return credentialSharingForProvider(provider) === "personal";
}

/** True when the provider's credential is a shared account/service resource. */
export function isAccountCredentialProvider(provider: string): boolean {
  return credentialSharingForProvider(provider) === "account";
}

/**
 * Whether the provider has an EXPLICIT policy entry (vs. falling back to the
 * default). The coverage test uses this to require every registered provider to
 * be deliberately classified.
 */
export function hasExplicitCredentialSharing(provider: string): boolean {
  return Object.prototype.hasOwnProperty.call(POLICY, provider);
}
