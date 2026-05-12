import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { webhooksDelete } from "@/integrations/trello/api/webhooks";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";

/**
 * Shared deactivation hook for the 6 Trello webhook triggers —
 * Slice 17 Commit 5.
 *
 * Reads `trigger_resources.config.webhookId` and DELETEs the Trello
 * webhook. Best-effort:
 *   - `TrelloNotFoundError` → swallow (the webhook is already gone
 *     server-side; the user may have manually deleted it from the
 *     Trello dashboard, or revoked the OAuth token).
 *   - `Unauthorized401Error` (by name match) → swallow with no log.
 *     The user revoked the token; subsequent calls would all 401.
 *   - Other errors → propagate (the lifecycle orchestrator catches
 *     and proceeds with row deletion per `deactivationRegistry.ts`).
 *
 * Skips silently when the trigger row carries no `webhookId` — V1
 * had this exact bug (V1's `webhooks.ts:46-51` discarded the webhook
 * id, making cleanup impossible). V2 stores the id at activation;
 * this defensive skip handles only the partial-activation rollback
 * edge case.
 */
export const trelloSharedDeactivate: DeactivationFn = async ({
  trigger,
  integration,
}) => {
  const config = trigger.config as {
    webhookId?: string;
  };
  const { webhookId } = config;
  if (typeof webhookId !== "string" || webhookId.length === 0) return;

  const accessToken = decryptToken(integration.accessTokenEncrypted);

  try {
    await webhooksDelete({ accessToken, webhookId });
  } catch (err) {
    if (err instanceof TrelloNotFoundError) return;
    const errorName = err instanceof Error ? err.name : "unknown";
    if (errorName === "Unauthorized401Error") return;
    throw err;
  }
};
