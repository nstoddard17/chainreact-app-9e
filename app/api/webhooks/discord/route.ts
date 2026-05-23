import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveDiscordInteraction,
} from "@/integrations/discord/triggers/slashCommand/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the Discord `slash_command` trigger's
// activation/deactivation registrations at module load. Without this,
// the dispatcher could fall through with no registered hooks on a
// fresh worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/discord — Slice 3.DISCORD-6.
 *
 * Discord's interactions endpoint is configured ONCE per Discord
 * application in the Developer Portal: `${NEXT_PUBLIC_APP_URL}/api/webhooks/discord`.
 * Every `INTERACTION_CREATE` Discord generates (slash commands, modal
 * submits, message components, autocomplete) is POSTed here.
 *
 * **Wire contract differs from GitHub/Stripe/Shopify webhooks** —
 * Discord's interactions architecture is request-response:
 *
 *   - PING (`type: 1`) → respond `{ type: 1 }` (PONG). Required to
 *     register the endpoint URL as healthy in the Developer Portal.
 *   - APPLICATION_COMMAND (`type: 2`) → respond `{ type: 4, data: { ... } }`
 *     (CHANNEL_MESSAGE_WITH_SOURCE) with an ephemeral acknowledgment
 *     so the invoker sees "Workflow triggered." inline. The actual
 *     workflow execution is enqueued asynchronously via
 *     `dispatchTriggerEvent` — Discord's 3-second response budget is
 *     met because `enqueueRun` is fast (writes a queue row and
 *     returns).
 *
 * Status-code mapping (all 2xx responses carry an interaction reply
 * JSON body; non-2xx carry an `{error: ...}` body for operator
 * diagnostics — Discord does NOT show non-2xx bodies to the user):
 *
 *   - `MissingSecretError` → 503. `DISCORD_INTERACTIONS_PUBLIC_KEY`
 *     env not set. V2 fails closed (no silent-accept of unsigned
 *     traffic). Same V1-bug-fix shape as GitHub.
 *   - `InvalidSignatureError` → 401. Discord enforces signature
 *     verification at the endpoint — endpoints that 200-ack with
 *     invalid signatures are auto-disabled. We return 401 for
 *     signature failures so Discord's verifier sees the correct
 *     failure mode.
 *   - `unknown_workflow` → 200 with an ephemeral "Workflow not
 *     configured." reply. Quiet ack — covers in-flight interactions
 *     to a just-deleted workflow or a renamed command. Discord won't
 *     retry on 2xx so we don't generate retry storms.
 *   - `unsupported_interaction` → 200 with an ephemeral "Not
 *     supported." reply. Modal submits / message-component
 *     interactions / autocomplete out of scope for this slice.
 *   - `event` → dispatch then respond `{ type: 4, ... }` ephemeral.
 *   - Dispatch failure → 500. Discord retries on 5xx — operator
 *     observability + Discord's own retry attempts surface the issue.
 *
 * **Ephemeral replies (`flags: 64`)** are private to the invoker. The
 * channel doesn't see them. This keeps the user-facing surface clean
 * — workflow authors who want a public reply use a downstream
 * `discord:send_message` action.
 */

const FLAG_EPHEMERAL = 64;

const INTERACTION_REPLY_TYPE_PONG = 1;
const INTERACTION_REPLY_TYPE_CHANNEL_MESSAGE = 4;

function ephemeralReply(content: string): Response {
  return NextResponse.json({
    type: INTERACTION_REPLY_TYPE_CHANNEL_MESSAGE,
    data: { content, flags: FLAG_EPHEMERAL },
  });
}

export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveDiscordInteraction>>;
  try {
    result = await receiveDiscordInteraction(request);
  } catch (err) {
    if (err instanceof MissingSecretError) {
      console.error(
        JSON.stringify({
          event: "webhook.discord.missing_secret",
          error: err.message,
        }),
      );
      return NextResponse.json(
        { error: "Discord interactions public key is not configured." },
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
        event: "webhook.discord.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "ping") {
    // Discord's handshake. Responding with PONG (type: 1) registers
    // the interactions endpoint URL as healthy in the Developer Portal.
    return NextResponse.json({ type: INTERACTION_REPLY_TYPE_PONG });
  }

  if (result.kind === "unknown_workflow") {
    return ephemeralReply(
      "ChainReact: this command isn't wired to a workflow. The workflow may have been deleted or the command renamed.",
    );
  }

  if (result.kind === "unsupported_interaction") {
    console.info(
      JSON.stringify({
        event: "webhook.discord.unsupported_interaction",
        interactionType: result.interactionType,
      }),
    );
    return ephemeralReply(
      "ChainReact: this interaction type isn't supported by this workflow.",
    );
  }

  // Dispatch the event. Failures here return 5xx so Discord retries.
  try {
    const dispatchResult = await dispatchTriggerEvent(result.event);
    console.info(
      JSON.stringify({
        event: "webhook.discord.dispatched",
        commandName: (result.event.payload.commandName as string | null) ?? null,
        enqueued: dispatchResult.enqueued,
        duplicate: dispatchResult.duplicate,
      }),
    );
    return ephemeralReply("Workflow triggered.");
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.discord.dispatch_error",
        error: (err as Error).message,
        commandName:
          (result.event.payload.commandName as string | null) ?? null,
      }),
    );
    return NextResponse.json(
      { error: "Dispatch failed." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/webhooks/discord — service-info endpoint.
 *
 * Discord doesn't issue a GET-time challenge for the interactions
 * endpoint URL — the only handshake is the POST PING. Returns a JSON
 * description so accidental GETs don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "discord interactions endpoint",
    description:
      "POST Discord interactions here. Ed25519 signature verified via X-Signature-Ed25519 + X-Signature-Timestamp using DISCORD_INTERACTIONS_PUBLIC_KEY env. PING (type: 1) responds with PONG (type: 1). Slash commands (APPLICATION_COMMAND, type: 2) dispatch to the matching workflow and reply with an ephemeral 'Workflow triggered.'",
  });
}
