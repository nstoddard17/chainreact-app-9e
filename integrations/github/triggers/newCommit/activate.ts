import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import {
  repoHooksCreate,
  type GitHubRepoHook,
} from "@/integrations/_shared/github/api/webhooks";
import { parseRepository } from "../../actions/_parseRepository";

/**
 * GitHub `new_commit` activation hook — Slice 14b Commit 4.
 *
 * Reads `node.config.repository` (REQUIRED, `owner/repo` format) and
 * optional `node.config.branch`, then creates ONE per-repo webhook
 * subscribed to the `push` event.
 *
 * Persists the response in `trigger_resources.config`:
 *   - `webhookEnabled: true` (parity with other V2 webhook triggers).
 *   - `repository` — the original `owner/repo` string.
 *   - `owner` / `repo` — split for fast deactivation lookup.
 *   - `branch` — the optional branch filter; `null` if absent.
 *   - `events: ["push"]` — Slice 14b Batch 1 supports push only.
 *   - `hookId` — GitHub webhook id for deactivation cleanup.
 *
 * **NO `type: "subscription-watch"` field.** GitHub repo webhooks
 * don't expire (unlike Microsoft Graph / Airtable). The
 * `runRenewals` cron filters on
 * `config.type === "subscription-watch"` — GitHub's activate
 * intentionally omits it so the renewal cron never picks up GitHub
 * rows. Same "permanent endpoint" pattern as Slice 11 Stripe and
 * Slice 12 Shopify.
 *
 * **Notification URL** — `${V2_BASE_URL}/api/webhooks/github?workflowId=X&nodeId=Y`.
 * The query params drive the receive route's strict-direct-lookup
 * (`findByWorkflowAndNode`).
 *
 * **HMAC secret** — `GITHUB_WEBHOOK_SECRET` (REQUIRED). Activation
 * fails-closed if the env var is missing — V2 plan §"V1 bugs to fix"
 * #1: V1 silently created webhooks with an empty secret which then
 * silently passed signature verification. V2 closes the gap at the
 * earliest possible point: design-time activation.
 *
 * Throws abort the activate transition (TRIGGER_REGISTRATION_FAILED).
 */

function webhookBaseUrl(): string {
  const explicit = process.env.GITHUB_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/github");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

function notificationUrl(workflowId: string, nodeId: string): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/github?${params.toString()}`;
}

function getWebhookSecret(): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "github new_commit activate: GITHUB_WEBHOOK_SECRET env var is not set — refusing to register a webhook with an empty secret. (V1 bug fix: V1 silently fell back to GITHUB_CLIENT_SECRET; V2 requires a dedicated webhook secret.)",
    );
  }
  return secret;
}

export const activate: ActivationFn = async ({
  node,
  integration,
  workflowId,
}) => {
  const repository = node.config?.repository;
  if (typeof repository !== "string" || repository.length === 0) {
    throw new Error(
      "github new_commit activate: node.config.repository is required (owner/repo format).",
    );
  }
  // parseRepository throws on bad shape — surface verbatim. Mirrors the
  // schema-layer validation done by action handlers; activation runs
  // before the workflow can ever fire so a bad shape fails fast at
  // design time.
  const { owner, repo } = parseRepository(repository);

  // Optional branch filter. Validate shape but don't fail if absent.
  const branchRaw = node.config?.branch;
  let branch: string | null = null;
  if (branchRaw !== undefined && branchRaw !== null && branchRaw !== "") {
    if (typeof branchRaw !== "string") {
      throw new Error(
        "github new_commit activate: node.config.branch must be a string when supplied.",
      );
    }
    branch = branchRaw;
  }

  const accessToken = decryptToken(integration.accessTokenEncrypted);
  const secret = getWebhookSecret();
  const url = notificationUrl(workflowId, node.id);

  const events = ["push"] as const;

  const created: GitHubRepoHook = await repoHooksCreate({
    accessToken,
    owner,
    repo,
    url,
    secret,
    events,
  });

  return {
    webhookEnabled: true,
    repository,
    owner,
    repo,
    branch,
    events: [...events],
    hookId: created.id,
    notificationUrl: url,
  };
};
