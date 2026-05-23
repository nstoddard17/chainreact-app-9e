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
 * Scopes — Docs read+write + Drive (for share/export/folder
 * placement) + OIDC userinfo:
 *   - `documents` (read/write) — required for the V2 surface
 *     (create + update via documents.batchUpdate; get reads
 *     documents.get). `documents.readonly` is too narrow for the
 *     write actions; the first time real users complain about consent
 *     breadth we can split into a read-only mode, but Batch 1 needs
 *     full read/write.
 *   - `drive` — required for share_document's permissions.create,
 *     export_document's files.export, create_document's folder
 *     placement (files.update parents patch), and the future
 *     trigger surface's files.watch. The narrower scopes
 *     (drive.file, drive.metadata.readonly) don't cover sharing or
 *     export.
 *   - `userinfo.email` is the OIDC scope that lets us identify the
 *     connected account at callback time via the OIDC userinfo
 *     endpoint (`openidconnect.googleapis.com`). Docs' own API
 *     doesn't expose a getProfile-like endpoint that works with
 *     `documents` alone, so userinfo is the cleanest source of the
 *     user's email — same pattern Gmail / Calendar / Drive / Sheets
 *     use.
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
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // False until GDOCS-5 ships the Drive files.watch triggers.
      webhookTrigger: false,
      // False — both Google Docs triggers go through Drive watch per
      // the GDOCS-5 architecture. No polling-shape trigger planned.
      pollingTrigger: false,
      // True — 5 action handlers ship in this slice.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000,
    refreshable: true,
  });
