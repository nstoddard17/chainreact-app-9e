import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Linear provider manifest — CS-1 MCP-AUTH (first MCP-catalog app; connect
 * flow only). See docs/slices/phase-5/mcp-integration-layer-architecture-plan.md
 * and docs/providers/linear/owner-setup.md.
 *
 * Linear (linear.app) is an issue-tracking / product-planning platform. Its
 * automation surface for the MCP catalog tier is the official remote MCP
 * server (`https://mcp.linear.app/mcp`, Streamable HTTP); auth is Linear's
 * REGULAR OAuth (static workspace app) whose Bearer tokens the MCP server
 * accepts directly — the vendor-documented path for existing server-side
 * OAuth apps (docs/providers/linear/research.md).
 *
 * Auth model:
 *   - `authFlow: "code_callback"` through the shared MCP OAuth helper in
 *     static-endpoint mode (integrations/linear/oauth.ts).
 *   - `refreshable: true` — MANDATORY: since 2026-04-01 Linear issues 24-hour
 *     access tokens with rotating refresh tokens for ALL OAuth apps.
 *   - `tokenScope: "user"` — the token acts as the connecting human (their
 *     issues, their comment authorship) → `personal` credential class in
 *     `core/integrations/credentialSharing.ts`.
 *
 * Capability honesty (CLAUDE.md rule 15):
 *   - `oauth: true` — the connect path ships in this slice.
 *   - `actions/webhookTrigger/pollingTrigger: false` — NO handlers/triggers
 *     are registered yet. Typed actions arrive with the schema compiler +
 *     executor slices (CS-2/CS-3); flip `actions` only when they register.
 *   - `isExperimental: true` — hidden from the default Apps catalog until the
 *     catalog app is code-complete AND live-certified (CS-6), then flip.
 */
export const linearManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "linear",
  displayName: "Linear",
  isEnabled: true,
  isExperimental: true,
  apiVersion: "mcp",
  tokenScope: "user",
  oauthFlows: ["authorization_code"],
  scopes: {
    // `read` is Linear's baseline scope; `write` covers issue/comment/project
    // mutations the future action catalog needs. Both requested at connect so
    // certified actions never hit a scope wall mid-workflow.
    required: ["read", "write"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: false,
    pollingTrigger: false,
    actions: false,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000,
  refreshable: true,
  authFlow: "code_callback",
});
