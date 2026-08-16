import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Google Docs provider manifest — Slice 3.GDOCS-2 (runtime port).
 *
 * Per the GDOCS-1 audit decision (V1 → V2 §3.3):
 *   - Single scope set for the entire surface — no read-only mode in
 *     v1. Write scopes are needed for create / update / share /
 *     export, and the read-only narrow split is a future product call
 *     if customers ask for narrower consent.
 *
 * Capability flags follow the V2 honest-state convention — they flip
 * true only when a real handler/trigger lands. As of GDOCS-2:
 *   - `oauth`: true (this slice — OAuth callback + dispatcher
 *     registration wired).
 *   - `actions`: true (5 handlers ship in this slice — see
 *     `services/execution/handlers/_registry.ts`).
 *   - `webhookTrigger`: false (flips when GDOCS-5 ships the
 *     `new_document` + `document_updated` Drive `files.watch` push
 *     triggers).
 *   - `pollingTrigger`: false (no polling trigger planned — both
 *     triggers go through Drive watch per GDOCS-1 §3.5 D-GD2).
 *
 * Scopes — Drive + OIDC userinfo. `documents` was RETIRED by
 * GOOGLE-OAUTH-SCOPE-DISCREPANCY-CLOSEOUT-1 (least-privilege audit):
 *   - `drive` — authorizes the ENTIRE current Docs surface. Google's
 *     documented authorization for every Docs API method we call
 *     (documents.create, documents.get, documents.batchUpdate) accepts
 *     `drive`, and `drive` is independently required anyway for
 *     share_document's permissions.create, export_document's
 *     files.export, create_document's folder placement (files.update
 *     parents patch), the `google-docs:documents` picker (Drive
 *     files.list filtered to the Docs mimeType), and both triggers'
 *     Drive watch transport. The narrower scopes (drive.file,
 *     drive.metadata.readonly) don't cover sharing, export, or the
 *     whole-Drive picker/trigger surface.
 *   - `documents` (RETIRED — do not re-add): it authorized only the
 *     three Docs-API methods above, every one of which `drive`
 *     already authorizes, so it granted no capability and only
 *     widened the consent screen. Existing connections that hold the
 *     historical `documents` grant stay healthy (required ⊆ granted
 *     still holds after the narrowing). Pinned by the union guard
 *     (tests/unit/integrations/googleScopeUnion.test.ts).
 *   - `userinfo.email` is the OIDC scope that lets us identify the
 *     connected account at callback time via the OIDC userinfo
 *     endpoint (`openidconnect.googleapis.com`). Docs' own API
 *     doesn't expose a getProfile-like endpoint, so userinfo is the
 *     cleanest source of the user's email — same pattern Gmail /
 *     Calendar / Drive / Sheets use.
 *
 * tokenScope: "user" matches Gmail / Calendar / Drive / Sheets — one
 * Docs integration per (user, email). A user with all five Google
 * providers connected has five separate integration rows under the
 * same Google identity.
 *
 * Health-check interval: 6h matches Gmail / Calendar / Drive / Sheets
 * (CLAUDE.md "Google/Microsoft: 6h").
 */
export const googleDocsManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "google-docs",
    displayName: "Google Docs",
    isEnabled: true,
    apiVersion: "v1",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // True — Slice 3.GDOCS-5 ships `new_document` + `document_updated`
      // via Drive's `files.watch` push channel (filtered to Docs
      // mimeType in normalize). Webhook receive route lives at
      // `/api/webhooks/google-docs`.
      webhookTrigger: true,
      // False — both Google Docs triggers go through Drive watch per
      // the GDOCS-5 architecture. No polling-shape trigger planned.
      pollingTrigger: false,
      // True — 5 action handlers ship in GDOCS-2.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000,
    refreshable: true,
  });
