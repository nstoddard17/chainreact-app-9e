import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Fleetio provider manifest (FLEETIO-1 — Slice 1: auth + connection shell).
 *
 * Fleetio (`fleetio.com`) is a fleet maintenance management system (FMMS) for
 * small-to-medium fleets — work orders, DVIR inspections, service reminders,
 * fuel/meter entries, parts. The maintenance-side counterpart to Motive.
 * Research + catalog: docs/providers/fleetio/research.md; plan:
 * docs/slices/phase-5/fleetio-integration-plan.md.
 *
 * Auth model:
 *   - `authFlow: "credential_paste"` — Fleetio has NO OAuth. The user enters
 *     two credentials from Fleetio → Settings → Manage API Keys into the
 *     shared V2 credential form: an API key (`Authorization: Token <key>`)
 *     and the Account-Token header value. Verified at connect via
 *     `GET /accounts` (proves the key AND matches the entered Account-Token
 *     against `records[].token`). See integrations/fleetio/auth.ts.
 *   - `refreshable: false` — API keys are long-lived; a 401 surfaces reconnect.
 *   - `scopes.required: []` — honest: Fleetio has no scope negotiation; the
 *     key inherits its Fleetio user's ROLE (the credentialGuide tells owners
 *     to use a dedicated least-privilege integration user).
 *   - `tokenScope: "user"` + `accountIdField: "id"` — rows are keyed by the
 *     durable numeric Fleetio account id (QuickBooks-realm posture); one V2
 *     account may connect multiple Fleetio accounts.
 *   - Credential-sharing class: "account" (core/integrations/credentialSharing.ts)
 *     — a fleet is a shared company resource, so connect/disconnect are
 *     owner/admin actions (same posture as Motive / QuickBooks).
 *
 * Capability honesty (rule 15): ONLY `oauth` (a real connect dance exists —
 * the credential form IS the connect). `actions` / triggers stay `false`
 * until Slice 2+ registers real handlers.
 *
 * `isExperimental: true` — hidden from the production Apps catalog until the
 * post-owner-setup live certification pass (same arc Linear/Eden followed).
 * API version pinned to 2025-05-05 (X-Api-Version on every call).
 */
export const fleetioManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "fleetio",
  displayName: "Fleetio",
  isEnabled: true,
  isExperimental: true,
  apiVersion: "2025-05-05",
  tokenScope: "user",
  oauthFlows: ["api_key"],
  scopes: { required: [], optional: [], deprecated: [] },
  capabilities: {
    oauth: true,
    webhookTrigger: false,
    pollingTrigger: false,
    actions: false,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: false,
  authFlow: "credential_paste",
  accountIdField: "id",
  credentialFields: [
    {
      id: "apiKey",
      label: "API key",
      secret: true,
      required: true,
      placeholder: "Paste your Fleetio API key",
      help: "In Fleetio: Account menu → Settings → Manage API Keys → “+ Add API Key”. Label it “ChainReact” and copy the key.",
    },
    {
      id: "accountToken",
      label: "Account token",
      secret: true,
      required: true,
      placeholder: "Paste your Account Token",
      help: "Shown at the bottom of the same Manage API Keys page. It's also the short code in every Fleetio page address (secure.fleetio.com/<account-token>/…).",
    },
  ],
  credentialGuide: {
    intro:
      "Fleetio connects with an API key instead of a sign-in window. Both values below come from one Fleetio settings page.",
    steps: [
      "In Fleetio, open the Account menu → Settings → Manage API Keys.",
      "Click “+ Add API Key”, name it (e.g. “ChainReact”), and copy the key.",
      "Copy the Account Token shown at the bottom of that same page.",
    ],
    note:
      "ChainReact can only do what this Fleetio user's role allows — we recommend creating a dedicated Fleetio user with least-privilege access for integrations. Fleetio API access requires a Professional or Premium plan.",
  },
});
