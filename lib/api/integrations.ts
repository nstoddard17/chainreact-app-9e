/**
 * Typed client API for integration operations.
 *
 * Per project-structure-and-module-boundaries.md §5, this is the only bridge
 * client code uses to reach the server. Components and feature hooks call
 * these functions; never `fetch()` directly, never `repositories/` or
 * `services/` directly.
 */

export interface StartOAuthResult {
  redirectUrl: string;
}

/**
 * Options for {@link startOAuth}. `reconnect` (Slice 4.APPS-RECONNECT) starts the
 * flow in per-account reconnect mode — the client passes ONLY the opaque
 * integration row id + the owning account id; the server resolves, authorizes,
 * and steers/verifies the provider identity. No identity is ever sent or received.
 */
export interface StartOAuthOptions {
  reconnect?: { integrationId: string; accountId: string };
  /**
   * Per-tenant connect-time hint (e.g. `{ shop: "store.myshopify.com" }` for
   * Shopify). Sent verbatim as the connect route's `providerHint`. Only set
   * this for providers whose manifest declares `connectInput` — the server
   * rejects a `providerHint` sent to a provider without `validateProviderHint`.
   */
  providerHint?: Record<string, string>;
  /**
   * REACT-AGENT-GUIDED-BUILD-1 — allow-listed popup return context, sent as the
   * connect route's `return` field. `nonce` is client-generated attempt
   * randomness (not a secret); the surface is the fixed `builder_popup`
   * discriminator. The server 400s any other shape.
   */
  returnContext?: { surface: "builder_popup"; nonce: string };
}

export async function startOAuth(
  provider: string,
  opts?: StartOAuthOptions,
): Promise<StartOAuthResult> {
  // Build the POST body from whichever options are present. A plain Connect
  // (neither reconnect nor providerHint) sends NO body — preserving the
  // legacy zero-arg connect contract.
  const payload: Record<string, unknown> = {};
  if (opts?.reconnect !== undefined) payload.reconnect = opts.reconnect;
  if (opts?.providerHint !== undefined) payload.providerHint = opts.providerHint;
  if (opts?.returnContext !== undefined) payload.return = opts.returnContext;
  const body =
    Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined;
  const res = await fetch(
    `/api/integrations/oauth/${encodeURIComponent(provider)}/connect`,
    body !== undefined
      ? { method: "POST", headers: { "content-type": "application/json" }, body }
      : { method: "POST" },
  );
  if (!res.ok) {
    let message = `Failed to start OAuth (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* response wasn't JSON; keep default message */
    }
    throw new Error(message);
  }
  return (await res.json()) as StartOAuthResult;
}

/**
 * Thrown by the disconnect client calls (Slice 4.APPS-DISCONNECT / CD-3). Carries
 * only a SAFE, already-sanitized message (the route bodies never include a token
 * or a raw provider error). The dialog still shows a generic fallback for any
 * non-typed failure, so nothing sensitive can reach the UI.
 */
export class IntegrationApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationApiError";
  }
}

function integrationBasePath(accountId: string, integrationId: string): string {
  return `/api/accounts/${encodeURIComponent(accountId)}/integrations/${encodeURIComponent(integrationId)}`;
}

async function safeError(res: Response, fallback: string): Promise<IntegrationApiError> {
  // The route's `error` field is already a safe, typed sentence (e.g.
  // "Integration not found."). We surface it when present, else a generic
  // fallback — never a raw body.
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body?.error === "string" && body.error.length > 0) {
      return new IntegrationApiError(body.error);
    }
  } catch {
    /* non-JSON body — ignore */
  }
  return new IntegrationApiError(fallback);
}

/** One affected workflow — id + name only (matches the advisory route DTO). */
export interface AffectedWorkflow {
  id: string;
  name: string;
}
export interface IntegrationWorkflowImpact {
  affectedWorkflowCount: number;
  workflows: AffectedWorkflow[];
}

/**
 * GET the advisory pre-disconnect impact. Read-only. Returns only the safe count
 * + {id,name} list the route emits.
 */
export async function getIntegrationWorkflowImpact(
  accountId: string,
  integrationId: string,
): Promise<IntegrationWorkflowImpact> {
  const res = await fetch(`${integrationBasePath(accountId, integrationId)}/workflow-impact`, {
    method: "GET",
  });
  if (!res.ok) {
    throw await safeError(res, "Couldn't check which workflows depend on this app.");
  }
  return (await res.json()) as IntegrationWorkflowImpact;
}

export interface DisconnectIntegrationResult {
  disconnected: boolean;
  alreadyDisconnected: boolean;
  providerRevoked: boolean;
  workflowsDisabled: number;
}

/** DELETE the integration (disconnect). Returns the sanitized result DTO. */
export async function disconnectIntegration(
  accountId: string,
  integrationId: string,
): Promise<DisconnectIntegrationResult> {
  const res = await fetch(integrationBasePath(accountId, integrationId), {
    method: "DELETE",
  });
  if (!res.ok) {
    throw await safeError(res, "Couldn't disconnect this app. Please try again.");
  }
  return (await res.json()) as DisconnectIntegrationResult;
}

export type IntegrationSharingScope = "private_to_connector" | "shared_with_account";

export interface SetIntegrationSharingResult {
  scope: IntegrationSharingScope;
  shared: boolean;
  changed: boolean;
}

/**
 * POST the explicit sharing scope of a personal connection (Slice 4.CONN-SHARE /
 * CS-2 route). `shared_with_account` shares it with the team; `private_to_connector`
 * stops sharing. The route re-authorizes (connector-only share; connector-or-admin
 * unshare) and returns only the safe `{ scope, shared, changed }` DTO. Any failure
 * (incl. flag-off `not_enabled`) surfaces a SAFE, typed message via `safeError`.
 */
export async function setIntegrationSharing(
  accountId: string,
  integrationId: string,
  scope: IntegrationSharingScope,
): Promise<SetIntegrationSharingResult> {
  const res = await fetch(`${integrationBasePath(accountId, integrationId)}/sharing`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  if (!res.ok) {
    throw await safeError(res, "Couldn't update sharing for this connection. Please try again.");
  }
  return (await res.json()) as SetIntegrationSharingResult;
}
