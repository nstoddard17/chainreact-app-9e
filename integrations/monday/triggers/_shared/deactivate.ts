import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { webhooksDelete } from "@/integrations/_shared/monday/api/webhooksDelete";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

/**
 * Shared deactivation hook for the 5 Monday webhook triggers —
 * Slice 3.MONDAY-7.
 *
 * Reads `trigger_resources.config.webhookId` and DELETEs the Monday
 * webhook via `delete_webhook`. Best-effort:
 *   - `NotFoundError` → swallow (the webhook is already gone server-side;
 *     the user may have deleted it from the Monday admin, or revoked the
 *     OAuth token). Mirrors GitHub / Trello / Shopify best-effort delete.
 *   - `Unauthorized401Error` (by name match) → swallow. The token is
 *     dead; re-auth doesn't help a revoke-by-uninstall token and
 *     subsequent calls would all 401.
 *   - Other errors → propagate (the lifecycle orchestrator catches and
 *     proceeds with row deletion per `deactivationRegistry.ts`).
 *
 * Skips silently when the trigger row carries no `webhookId` — the row
 * was registered but activation never persisted the id (partial-
 * activation rollback edge case).
 *
 * `webhooksDelete` pins API-Version `2025-04` internally — no override
 * needed here.
 */
const WEBHOOK_API_VERSION = "2025-04";

export const mondaySharedDeactivate: DeactivationFn = async ({
  trigger,
  integration,
}) => {
  const config = trigger.config as { webhookId?: string };
  const webhookId = config.webhookId;
  if (typeof webhookId !== "string" || webhookId.length === 0) return;

  const accessToken = decryptToken(integration.accessTokenEncrypted);

  try {
    await webhooksDelete({
      accessToken,
      webhookId,
      apiVersion: WEBHOOK_API_VERSION,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    const errorName = err instanceof Error ? err.name : "unknown";
    if (errorName === "Unauthorized401Error") return;
    throw err;
  }
};
