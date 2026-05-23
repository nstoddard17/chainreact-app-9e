import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { verifyDiscordSignature } from "@/integrations/_shared/discord/webhooks/signature";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { normalizeSlashCommand } from "./normalize";

/**
 * Verify and parse an inbound Discord interactions POST — Slice 3.DISCORD-6.
 *
 * Strict-direct-lookup via `?workflowId=X&nodeId=Y` query params on the
 * configured Interactions Endpoint URL. Discord's interactions endpoint
 * is configured ONCE per Discord application in the Developer Portal
 * (a deployment-wide URL); the route uses query params to identify
 * which workflow + node the slash command belongs to — same shape as
 * Stripe / Shopify / GitHub.
 *
 * **Signature verification.** Every Discord interactions POST carries
 * `X-Signature-Ed25519` + `X-Signature-Timestamp`. The signed payload is
 * `${timestamp}${rawBody}` — concatenated UTF-8 bytes with no
 * separator. The verifier uses `DISCORD_INTERACTIONS_PUBLIC_KEY` env
 * (the application's per-app public key from the Discord Developer
 * Portal). Mismatch / malformed → 401. Missing env var → 503
 * (server misconfig — same pattern as GitHub's `MissingSecretError`).
 *
 * **Discord's PING/PONG handshake.** Discord verifies the interactions
 * endpoint URL is reachable by POSTing a `{ type: 1 }` ping. The route
 * MUST respond with `{ type: 1 }` (PONG) to register the endpoint URL
 * as healthy in the Developer Portal. We do this BEFORE the
 * strict-direct-lookup — the ping comes from Discord with no workflow
 * context, but its signature is still verified.
 *
 * **Slash-command interactions** (`type: 2`, `data.type: 1` =
 * CHAT_INPUT) are the only handled interaction shape in this slice.
 * Modal submits / component interactions / autocomplete are out of
 * scope and surface as `unsupported_interaction` → 200 ack so Discord
 * doesn't disable the endpoint.
 *
 * **Strict trigger-row matching.** Even with valid query params, the
 * receive flow validates:
 *   1. trigger row exists for (workflowId, nodeId);
 *   2. row's provider = "discord" and eventType = "slash_command";
 *   3. row's config.guildId matches the interaction's guild_id;
 *   4. row's config.commandName matches the interaction's data.name.
 *
 * Mismatch at steps 1-2 → `unknown_workflow` → 200 quiet ack. Mismatch
 * at 3-4 (signature valid + row exists but the interaction is for a
 * different command / guild than what this row registered) → also
 * `unknown_workflow` 200 ack. Discord doesn't retry on 2xx, so we
 * don't generate retry storms for in-flight interactions targeting
 * a workflow that was just deleted or whose command was renamed.
 */

export class MissingSecretError extends Error {
  constructor() {
    super(
      "Discord webhook: DISCORD_INTERACTIONS_PUBLIC_KEY env var is not set — refusing to accept unsigned-equivalent traffic.",
    );
    this.name = "MissingSecretError";
  }
}

export type ReceiveResult =
  | { kind: "ping" }
  | { kind: "unknown_workflow" }
  | { kind: "unsupported_interaction"; interactionType: number | null }
  | { kind: "event"; event: TriggerEvent };

const SIGNATURE_HEADER = "x-signature-ed25519";
const TIMESTAMP_HEADER = "x-signature-timestamp";

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

function getPublicKey(): string {
  const key = process.env.DISCORD_INTERACTIONS_PUBLIC_KEY;
  if (!key) throw new MissingSecretError();
  return key;
}

const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const COMMAND_TYPE_CHAT_INPUT = 1;

export async function receiveDiscordInteraction(
  request: Request,
): Promise<ReceiveResult> {
  // 1. Read raw body BEFORE parse — signature is over these bytes.
  const rawBody = await request.text();
  if (!rawBody.length) {
    throw new InvalidSignatureError("Discord webhook: empty body.");
  }

  // 2. Verify signature — fail-closed on missing public key (→ 503).
  const publicKey = getPublicKey();
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const timestampHeader = request.headers.get(TIMESTAMP_HEADER);
  const verifyResult = verifyDiscordSignature(
    rawBody,
    signatureHeader,
    timestampHeader,
    publicKey,
  );
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Discord webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // 3. Parse JSON body. Discord guarantees JSON on a verified-signature
  //    request — if parsing fails post-verification, the body matched
  //    the signature but is shaped invalid, which is a contract
  //    violation.
  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new InvalidSignatureError(
      "Discord webhook: body is not valid JSON despite a verified signature.",
    );
  }

  const interactionType =
    typeof parsedBody.type === "number" ? parsedBody.type : null;

  // 4. Discord's PING handshake. Required to register the endpoint URL
  //    in the Developer Portal. The route returns the matching PONG
  //    JSON response; no trigger-row lookup needed.
  if (interactionType === INTERACTION_TYPE_PING) {
    return { kind: "ping" };
  }

  // 5. Only APPLICATION_COMMAND (slash command + CHAT_INPUT) is in
  //    scope. Modal submits / message-component interactions /
  //    autocomplete are out of scope for this slice → 200 ack.
  if (interactionType !== INTERACTION_TYPE_APPLICATION_COMMAND) {
    return { kind: "unsupported_interaction", interactionType };
  }
  const dataObj = (parsedBody.data ?? {}) as Record<string, unknown>;
  if (
    typeof dataObj.type === "number" &&
    dataObj.type !== COMMAND_TYPE_CHAT_INPUT
  ) {
    return { kind: "unsupported_interaction", interactionType };
  }

  // 6. Strict-direct-lookup query params. Missing → 200 quiet ack.
  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  // 7. Find the trigger row.
  const trigger = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (
    !trigger ||
    trigger.provider !== "discord" ||
    trigger.eventType !== "slash_command"
  ) {
    return { kind: "unknown_workflow" };
  }

  // 8. Match guild + command name on the trigger config. Slash-command
  //    interactions don't carry the configured row's ids directly, but
  //    the URL's workflowId+nodeId already pinned us to one row; this
  //    is defense-in-depth against a rename mid-flight.
  const triggerConfig = trigger.config as {
    guildId?: string;
    commandName?: string;
  };
  const interactionGuildId =
    typeof parsedBody.guild_id === "string" ? parsedBody.guild_id : null;
  const interactionCommandName =
    typeof dataObj.name === "string" ? dataObj.name : null;
  if (
    typeof triggerConfig.guildId === "string" &&
    interactionGuildId !== null &&
    triggerConfig.guildId !== interactionGuildId
  ) {
    return { kind: "unknown_workflow" };
  }
  if (
    typeof triggerConfig.commandName === "string" &&
    interactionCommandName !== null &&
    triggerConfig.commandName !== interactionCommandName
  ) {
    return { kind: "unknown_workflow" };
  }

  // 9. Normalize to canonical TriggerEvent.
  const event = normalizeSlashCommand({ body: parsedBody });
  return { kind: "event", event };
}
