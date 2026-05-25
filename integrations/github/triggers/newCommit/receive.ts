import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyGitHubSignature } from "@/integrations/_shared/github/webhooks/signature";
import { normalizeGitHubEvent, type GitHubHeaders } from "./normalize";

/**
 * Verify and parse an inbound GitHub webhook delivery — Slice 14b
 * Commit 4.
 *
 * Strict-direct-lookup pattern (per Slice 11 / Stripe + Slice 12 /
 * Shopify shape):
 *   - Reads `workflowId` + `nodeId` from URL query params (set by
 *     activate at webhook-create time).
 *   - Calls `findByWorkflowAndNode` (service-role) for the single
 *     matching trigger row.
 *   - Verifies `X-Hub-Signature-256` against `GITHUB_WEBHOOK_SECRET`
 *     — single global webhook secret. Distinct from
 *     `GITHUB_CLIENT_SECRET` per Slice 14b plan §"V1 bugs to fix" #3.
 *
 * Outcomes:
 *   - **`MissingSecretError` thrown** when `GITHUB_WEBHOOK_SECRET` is
 *     missing — route maps to 503 (server misconfig). This is the
 *     load-bearing V1-bug-fix: V1 silently accepted unsigned webhooks
 *     when the secret was missing.
 *   - `InvalidSignatureError` thrown for missing-header / malformed /
 *     mismatch / replay → route 401.
 *   - `unknown_workflow`: query params missing OR no matching row.
 *     Route maps to a 200 quiet ack — GitHub retries on non-2xx and
 *     in-flight events for a deleted workflow shouldn't trigger a
 *     storm.
 *   - `ping_event`: signature OK + GitHub's ping handshake. Route
 *     200-acks `{ ok: true, message: "pong" }` — GitHub requires
 *     a 2xx on first delivery for the webhook to register as
 *     healthy.
 *   - `unsupported_event`: signature OK + trigger found, but the
 *     received `X-GitHub-Event` is NOT `"push"` (Slice 14b Batch 1
 *     supports push only). Route 200-acks without dispatch.
 *   - `branch_filtered`: signature OK + push event, but the
 *     trigger config has a branch filter and the push's branch
 *     doesn't match. Route 200-acks without dispatch.
 *   - `events`: signature verified + push event + branch matches /
 *     no filter. Route dispatches.
 */

export class MissingSecretError extends Error {
  constructor() {
    super(
      "GitHub webhook: GITHUB_WEBHOOK_SECRET env var is not set — refusing to accept unsigned-equivalent traffic.",
    );
    this.name = "MissingSecretError";
  }
}

export type ReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "ping_event" }
  | { kind: "unsupported_event"; eventName: string }
  | { kind: "branch_filtered"; branch: string | null; configuredBranch: string }
  | { kind: "events"; events: TriggerEvent[] };

const SIGNATURE_HEADER = "x-hub-signature-256";
const EVENT_HEADER = "x-github-event";
const DELIVERY_HEADER = "x-github-delivery";
const HOOK_ID_HEADER = "x-github-hook-id";

const SUPPORTED_EVENTS = new Set(["push"]);

interface QueryDescriptor {
  workflowId: string;
  nodeId: string;
}

function parseQuery(url: string): QueryDescriptor | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const workflowId = parsed.searchParams.get("workflowId");
  const nodeId = parsed.searchParams.get("nodeId");
  if (!workflowId || !nodeId) return null;
  return { workflowId, nodeId };
}

function getWebhookSecret(): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Distinct from InvalidSignatureError so the route can map to 503.
    throw new MissingSecretError();
  }
  return secret;
}

export async function receiveGitHubWebhook(
  request: Request,
): Promise<ReceiveResult> {
  // 1. Strict-direct-lookup query params. Missing → 200 quiet ack.
  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  // 2. Read raw body BEFORE parse — signature is over these bytes.
  const rawBody = await request.text();
  if (!rawBody.length) {
    throw new InvalidSignatureError("GitHub webhook: empty body.");
  }

  // 3. Verify signature — fail-closed on missing secret (route → 503).
  const secret = getWebhookSecret();
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyGitHubSignature(rawBody, signatureHeader, secret);
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `GitHub webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // 4. Read X-GitHub-Event for routing.
  const eventName = request.headers.get(EVENT_HEADER);
  if (!eventName) {
    throw new InvalidSignatureError(
      "GitHub webhook: required X-GitHub-Event header missing despite verified signature.",
    );
  }

  // 5. GitHub's "ping" handshake — sent on webhook creation. Must
  //    return 2xx for the webhook to register as healthy in the
  //    GitHub UI. We don't bother looking up the trigger row for
  //    ping; the signature already proved provenance.
  if (eventName === "ping") {
    return { kind: "ping_event" };
  }

  // 6. Unsupported event types → 200 quiet skip. Slice 14b Batch 1
  //    only handles `push`; future slices may add `pull_request`,
  //    `release`, etc.
  if (!SUPPORTED_EVENTS.has(eventName)) {
    return { kind: "unsupported_event", eventName };
  }

  // 7. Find the trigger row.
  const trigger = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (
    !trigger ||
    trigger.provider !== "github" ||
    trigger.eventType !== "new_commit"
  ) {
    return { kind: "unknown_workflow" };
  }

  // 8. Parse JSON body.
  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new InvalidSignatureError(
      "GitHub webhook: body is not valid JSON despite a verified signature.",
    );
  }

  // 9. Branch filter (optional). Compare against the push event's
  //    `ref` after stripping `refs/heads/`. If the trigger config
  //    has a branch set and the push doesn't match, 200 ack without
  //    dispatch.
  const triggerConfig = trigger.config as { branch?: string | null };
  if (
    typeof triggerConfig.branch === "string" &&
    triggerConfig.branch.length > 0
  ) {
    const ref = parsedBody.ref;
    const pushedBranch =
      typeof ref === "string" && ref.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : typeof ref === "string"
          ? ref
          : null;
    if (pushedBranch !== triggerConfig.branch) {
      return {
        kind: "branch_filtered",
        branch: pushedBranch,
        configuredBranch: triggerConfig.branch,
      };
    }
  }

  // 10. Normalize to canonical TriggerEvent.
  const headers: GitHubHeaders = {
    eventName,
    deliveryId: request.headers.get(DELIVERY_HEADER),
    hookId: request.headers.get(HOOK_ID_HEADER),
  };
  const normalized = normalizeGitHubEvent({ headers, body: parsedBody });
  return { kind: "events", events: [normalized] };
}
