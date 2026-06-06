import * as notificationsRepo from "@/repositories/notifications";

/**
 * API-key audit notifications (Slice 4.API-KEYS-AUDIT-1).
 *
 * Writes a safe, in-app audit record to the acting owner/admin when an API key is
 * created or revoked, reusing the existing per-user `notifications` table (RLS gates
 * by `auth.uid() = user_id`). Best-effort: a notification failure NEVER fails the
 * create/revoke action and NEVER logs a secret.
 *
 * No-leak contract (load-bearing): the input carries ONLY non-secret fields — key
 * name, display prefix, ids. The raw key, `key_hash`, OAuth/integration tokens, and
 * provider account labels/scopes are NOT parameters here and never reach a
 * notification's title/body/metadata.
 */

export interface ApiKeyAuditNotificationInput {
  /** Who receives the in-app notice — the acting owner/admin (also the actor). */
  recipientUserId: string;
  accountId: string;
  keyId: string;
  /** Human label (safe, user-supplied). */
  name: string;
  /** Non-secret display prefix, e.g. "crk_live_AbCd1234". NEVER the raw key/hash. */
  prefix: string;
  /** The owner/admin who performed the action (safe id). */
  actorUserId: string;
}

type ApiKeyAuditAction = "created" | "revoked";

async function record(action: ApiKeyAuditAction, input: ApiKeyAuditNotificationInput): Promise<void> {
  const type = action === "created" ? "api_key_created" : "api_key_revoked";
  try {
    await notificationsRepo.create({
      userId: input.recipientUserId,
      type,
      severity: "warning",
      title: `API key ${action}: ${input.name}`,
      body: `Key ${input.prefix} was ${action}.`,
      // Deep-link to the Account Settings API section (real route; no per-key URL).
      actionUrl: "/account?section=api",
      // Non-secret metadata only — no raw key, hash, or token.
      metadata: {
        action,
        keyId: input.keyId,
        prefix: input.prefix,
        name: input.name,
        accountId: input.accountId,
        actorUserId: input.actorUserId,
      },
    });
  } catch (err) {
    // Best-effort. Log ids only — NEVER the raw key, hash, or notification payload.
    console.warn(
      JSON.stringify({
        event: "api_key.audit_notification_failed",
        action,
        accountId: input.accountId,
        keyId: input.keyId,
        error: (err as Error).message,
      }),
    );
  }
}

export function recordApiKeyCreatedNotification(
  input: ApiKeyAuditNotificationInput,
): Promise<void> {
  return record("created", input);
}

export function recordApiKeyRevokedNotification(
  input: ApiKeyAuditNotificationInput,
): Promise<void> {
  return record("revoked", input);
}
