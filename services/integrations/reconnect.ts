import {
  getByIdForAccountServiceRole,
  type IntegrationRecord,
} from "@/repositories/integrations";
import * as accountsRepo from "@/repositories/accounts";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";

/**
 * Per-account reconnect resolution + authorization (Slice 4.APPS-RECONNECT).
 *
 * Backend-only. The connect route calls this BEFORE starting OAuth in reconnect
 * mode. It answers one question: "may THIS caller reconnect THIS specific
 * integration row, and what identity should the provider sign-in be steered to?"
 *
 * Authorization shares the disconnect service's frozen → exact account-scoped
 * row → role/connector shape, so every "can't touch it" case collapses to a
 * single `not_found` (no existence / ownership inference for non-members or
 * cross-account ids). Reuses the same repository primitives — no duplicated SQL,
 * no new query. The one INTENTIONAL difference from disconnect (APPS-PERM-1):
 * personal-provider reconnect is CONNECTOR-ONLY — owner/admin may disconnect a
 * member's personal connection for safety but may NOT re-authorize it (only the
 * identity-holder can). Account/service-provider reconnect stays owner/admin.
 *
 * The dispatcher's callback identity-match is the HARD guarantee that a reconnect
 * only ever refreshes the intended row; this gate is the front-door check that
 * decides who may START a reconnect and supplies the steering identity. It does
 * NOT mutate anything.
 *
 * No-leak: the only value that leaves this module is the row's
 * `providerAccountId` (returned to the dispatcher to build `login_hint` — it
 * travels to the provider + the reconnecting user's own browser, never to the
 * Apps client). Tokens, scopes, metadata, display name, and the connector id are
 * never returned.
 */

export type ReconnectFailureReason = "account_frozen" | "not_found" | "forbidden";

export type ResolveReconnectResult =
  | {
      ok: true;
      /** The account that owns the row — the OAuth flow must write here, not the personal floor. */
      accountId: string;
      /** Opaque integration row id to bind into the signed OAuth state. */
      integrationId: string;
      /** The row's external identity (email for Google/Microsoft) — steers the provider sign-in. */
      expectedProviderAccountId: string;
    }
  | { ok: false; reason: ReconnectFailureReason };

export interface ResolveReconnectInput {
  /** Account that owns the connection (the Apps page's active account). */
  accountId: string;
  /** Opaque integration row id (the client only ever sends this). */
  integrationId: string;
  /** The signed-in caller. */
  callerUserId: string;
  /** Provider from the connect route URL — must match the row's provider. */
  provider: string;
}

/**
 * Resolve + authorize a per-account reconnect target. Returns the bound values
 * the dispatcher needs, or a typed reason the route maps to an HTTP status
 * (`not_found` → 404, `forbidden` → 403, `account_frozen` → 409).
 */
export async function resolveReconnectTarget(
  input: ResolveReconnectInput,
): Promise<ResolveReconnectResult> {
  const status = await accountsRepo.getDeletionStatusServiceRole(input.accountId);
  if (status === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // Exact (id, account_id) scope ⇒ a cross-account / unknown id is null.
  const row: IntegrationRecord | null = await getByIdForAccountServiceRole(
    input.accountId,
    input.integrationId,
  );
  if (!row) return { ok: false, reason: "not_found" };

  // A row exists but for a different provider than the route ⇒ treat as unknown
  // (the URL provider is the authoritative one the OAuth flow will run).
  if (row.provider !== input.provider) return { ok: false, reason: "not_found" };

  // Non-members can't infer the row exists ⇒ not_found (no existence leak).
  const callerRole = await getRoleServiceRole(input.accountId, input.callerUserId);
  if (callerRole === null) return { ok: false, reason: "not_found" };
  const isOwnerAdmin = callerRole === "owner" || callerRole === "admin";

  if (isAccountCredentialProvider(row.provider)) {
    // Shared org resource — reconnecting re-authorizes the shared workspace
    // token ⇒ owner/admin only (mirrors disconnect).
    if (!isOwnerAdmin) return { ok: false, reason: "forbidden" };
  } else {
    // Personal credential — CONNECTOR ONLY (APPS-PERM-1). Reconnecting re-binds
    // the connecting human's OWN provider identity; only that person can (and
    // should) do it. This is an INTENTIONAL asymmetry with disconnect: owner/admin
    // may DISCONNECT a member's personal connection as a safety action, but they
    // may NOT reconnect it. (The callback identity-match would block a non-owning
    // re-auth anyway; authorizing the START for owner/admin would be a misleading
    // affordance.)
    const isConnector =
      row.connectedByUserId !== null && row.connectedByUserId === input.callerUserId;
    if (!isConnector) return { ok: false, reason: "forbidden" };
  }

  return {
    ok: true,
    accountId: input.accountId,
    integrationId: row.id,
    expectedProviderAccountId: row.providerAccountId,
  };
}
