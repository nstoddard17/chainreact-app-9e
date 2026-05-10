import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { NotFoundError } from "@/integrations/_shared/github/errors";
import { repoHooksDelete } from "@/integrations/_shared/github/api/webhooks";

/**
 * GitHub `new_commit` deactivation hook — Slice 14b Commit 4.
 *
 * Reads `trigger_resources.config.{owner,repo,hookId}` and DELETEs
 * the per-repo webhook on GitHub. Best-effort:
 *   - 404 → swallow (the hook is already gone server-side; e.g. user
 *     deleted it manually from the repo's webhook settings, or
 *     uninstalled the OAuth App). Activation didn't depend on the
 *     cleanup, so we don't punish disable / delete for a state we
 *     can't observe.
 *   - 401 → swallow with a warn-level log. The user revoked the
 *     OAuth App; the token is dead; subsequent calls would all 401 —
 *     bail early.
 *   - Other errors → propagate (the lifecycle orchestrator catches
 *     and proceeds with row deletion per
 *     `deactivationRegistry.ts:18`).
 *
 * Skips silently when the trigger row carries no `hookId` — the row
 * was registered but the activation hook never persisted the id
 * (early test fixtures, partial-activation rollback, etc.).
 *
 * Mirrors `integrations/shopify/triggers/webhookReceived/deactivate.ts`
 * shape — best-effort delete, swallow 404 / 401, propagate everything
 * else.
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    owner?: string;
    repo?: string;
    hookId?: number;
  };
  const { owner, repo, hookId } = config;
  if (!owner || !repo || typeof hookId !== "number") return;

  const accessToken = decryptToken(integration.accessTokenEncrypted);

  try {
    await repoHooksDelete({
      accessToken,
      owner,
      repo,
      hookId,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    // 401 surfaces from githubRequest as Unauthorized401Error from
    // the refreshAndRetry-shared module. We don't have refreshAndRetry
    // wrapping here because deactivation runs in best-effort mode
    // and re-auth doesn't help for a revoked-by-uninstall token.
    const errorName = err instanceof Error ? err.name : "unknown";
    if (errorName === "Unauthorized401Error") {
      return;
    }
    throw err;
  }
};
