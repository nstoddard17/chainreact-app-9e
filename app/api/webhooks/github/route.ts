import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveGitHubWebhook,
} from "@/integrations/github/triggers/newCommit/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the GitHub `new_commit` trigger's
// activation/deactivation registrations at module load. Without it,
// the receive path's lookup would run but the lifecycle deactivate
// hook would be missing from the activation registry on a fresh
// worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/github
 *
 * Slice 14b Commit 4. Mirrors `app/api/webhooks/shopify/route.ts` shape.
 *
 *   - Reads raw body BEFORE parsing (signature is over those bytes —
 *     handled inside `receiveGitHubWebhook`).
 *   - Strict-direct-lookup: requires `?workflowId=X&nodeId=Y` query
 *     params (set on the notification URL at activation time).
 *   - Verifies `X-Hub-Signature-256` against the global
 *     `GITHUB_WEBHOOK_SECRET` env. Mismatch / missing header /
 *     malformed → 401. Missing secret env var → 503 (server
 *     misconfig — closes V1's silent-accept gap).
 *   - Unknown workflow / node → 200 quiet ack (avoids GitHub's
 *     retry schedule on non-2xx for in-flight events to a
 *     just-deleted workflow).
 *   - GitHub `ping` event → 200 `{ ok: true, message: "pong" }`.
 *     Required by GitHub for the webhook to register as healthy in
 *     the repo settings UI.
 *   - Unsupported event (anything other than `push` in Batch 1) →
 *     200 ack without dispatch.
 *   - Branch filter mismatch → 200 ack without dispatch.
 *   - On success → normalize push delivery → dispatch through V2's
 *     `dispatchTriggerEvent` pipeline (`webhook_event_dedup` keyed
 *     on the `X-GitHub-Delivery` UUID).
 *
 * 5xx on dispatch failure so GitHub retries.
 */
export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveGitHubWebhook>>;
  try {
    result = await receiveGitHubWebhook(request);
  } catch (err) {
    if (err instanceof MissingSecretError) {
      // Server misconfig — V2 closes V1's silent-accept gap. Return
      // 503 so the GitHub retry path eventually surfaces this to the
      // operator (instead of silently accepting unsigned traffic).
      console.error(
        JSON.stringify({
          event: "webhook.github.missing_secret",
          error: err.message,
        }),
      );
      return NextResponse.json(
        { error: "GitHub webhook secret is not configured." },
        { status: 503 },
      );
    }
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
    console.error(
      JSON.stringify({
        event: "webhook.github.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "unknown_workflow") {
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "ping_event") {
    // GitHub's webhook registration handshake — must return 2xx for
    // the webhook to show as healthy in the repo settings UI.
    return NextResponse.json({ ok: true, message: "pong" });
  }

  if (result.kind === "unsupported_event") {
    console.info(
      JSON.stringify({
        event: "webhook.github.unsupported_event",
        eventName: result.eventName,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "branch_filtered") {
    console.info(
      JSON.stringify({
        event: "webhook.github.branch_filtered",
        pushedBranch: result.branch,
        configuredBranch: result.configuredBranch,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  // Dispatch each event. Failures here return 5xx so GitHub retries.
  try {
    let dispatched = 0;
    for (const event of result.events) {
      const r = await dispatchTriggerEvent(event);
      dispatched += r.enqueued;
    }
    return NextResponse.json({ ok: true, dispatched });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.github.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/github
 *
 * Service-info endpoint. GitHub's webhook system has no GET-time
 * challenge — the only handshake is the POST `ping` event. Returns
 * a JSON description so accidental GET requests don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "github webhook",
    description:
      "POST events here. Signature verified via X-Hub-Signature-256 (HMAC-SHA256-hex over raw body, keyed with GITHUB_WEBHOOK_SECRET).",
  });
}
