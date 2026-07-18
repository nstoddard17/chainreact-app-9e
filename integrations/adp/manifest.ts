import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * ADP (Automatic Data Processing) provider manifest.
 *
 * Payroll / HR / workforce platform (ADP Workforce Now · RUN · TotalSource, via
 * ADP Marketplace / API Central). Auth + transport model verified against ADP's
 * public developer docs (docs/providers/adp/research.md, 2026-07-17):
 *
 *   - `authFlow: "machine_credentials"` — OAuth 2.0 `client_credentials` grant at
 *     `https://accounts.adp.com/auth/oauth/v2/token`, PLUS a mandatory client
 *     certificate at the TLS layer (mutual TLS) on the token call AND every API
 *     call. Connect is a credential-entry form (client_id / client_secret / WS
 *     certificate / private key), handled by `services/machineCredentials/*`
 *     against the encrypted machine-credential store — NOT the OAuth redirect
 *     dispatcher. `capabilities.oauth` is therefore false.
 *
 * ── DISABLED ON PURPOSE ──────────────────────────────────────────────────────
 * `isEnabled: false`. ADP API access is gated behind ADP Marketplace partnership
 * / API Central purchase, an ADP-issued WS certificate, sandbox (IAT) credentials,
 * and a security certification — none of which exist yet (see
 * docs/providers/adp/owner-report.md). The connect route refuses a disabled
 * provider, so no ADP credential can be stored until Marcus completes owner setup
 * and flips this flag.
 *
 * ── CAPABILITIES: all false (honest) ─────────────────────────────────────────
 * The auth + transport + webhook-verification FOUNDATION is implemented and
 * tested (machine-auth config, mTLS API client, `adpx-messageauthentication`
 * verifier). Typed ACTIONS and TRIGGERS are NOT shipped yet: their exact ADP
 * request/response shapes cannot be verified without sandbox access, and shipping
 * guessed schemas would violate the no-fabrication rule. `actions` /
 * `webhookTrigger` / `pollingTrigger` stay false until the action/trigger catalog
 * is built against a verified sandbox (the documented next slice). Manifest
 * honesty (CLAUDE.md rule 15): nothing is claimed that isn't registered.
 *
 * accountIdField `organizationOID` reflects ADP's org-scoped data model; it is
 * inert for the machine flow (which is account+provider scoped in the machine-
 * credential store, not provider_account_id keyed).
 */
export const adpManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "adp",
  displayName: "ADP",
  isEnabled: false,
  apiVersion: "hr/v2",
  tokenScope: "workspace",
  oauthFlows: [],
  accountIdField: "organizationOID",
  authFlow: "machine_credentials",
  // ADP does not use OAuth user-consent scopes; access is governed by the
  // customer's product + the use cases enabled in API Central + the certificate.
  scopes: { required: [], optional: [], deprecated: [] },
  capabilities: {
    oauth: false,
    webhookTrigger: false,
    pollingTrigger: false,
    actions: false,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: false,
});
