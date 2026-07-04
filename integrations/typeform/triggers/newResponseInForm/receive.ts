import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { decryptToken } from "@/core/encryption/tokens";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyTypeformSignature } from "@/integrations/_shared/typeform/webhooks/signature";
import {
  normalizeNewResponseInForm,
  type TypeformWebhookEvent,
} from "./normalize";

/**
 * Receive helper for the Typeform form webhook — Slice 5.TYPEFORM-1.
 *
 * Single route at `/api/webhooks/typeform`. Strict-direct-lookup: the
 * URL carries `?workflowId=X&nodeId=Y` (set at activation) so the
 * trigger row resolves without parsing the body first.
 *
 * ONE inbound shape (no creation handshake — V2 mints the secret and
 * sends it in the webhook PUT body, contrast Asana):
 *
 * **Event delivery.** `Typeform-Signature` = `sha256=` + base64
 * HMAC-SHA256 over the raw body, keyed with THAT webhook's secret
 * (per-webhook — verification happens AFTER row resolution; there is no
 * missing-env failure mode):
 *   1. Resolve row via query params. Missing/foreign → quiet ack.
 *   2. Row without a stored secret (aborted activation) →
 *      `unverifiable` quiet ack — never dispatch what we can't verify.
 *   3. Verify signature over the RAW bytes (route captures them before
 *      any parse). Fail → InvalidSignatureError (route 401).
 *   4. Parse AFTER verification. `event_type !== "form_response"` →
 *      `ignored_event` quiet ack (e.g. `form_response_partial` if the
 *      account ever enables partial-response webhooks — out of scope).
 *   5. Normalize → one TriggerEvent. `formId` attribution prefers the
 *      payload's `form_id` with the ROW's configured form as fallback.
 *
 * The route must NEVER return 404/410 for these quiet-ack states —
 * Typeform disables the webhook immediately on those statuses
 * (documented retry policy).
 */

export type ReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "unverifiable" }
  | { kind: "ignored_event"; eventType: string | null }
  | { kind: "events"; events: TriggerEvent[] };

const SIGNATURE_HEADER = "typeform-signature";

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

export interface ReceiveTypeformWebhookInput {
  request: Request;
  /** Raw body — the receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export async function receiveTypeformWebhook(
  input: ReceiveTypeformWebhookInput,
): Promise<ReceiveResult> {
  const { request, rawBody } = input;

  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  const row = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (!row || row.provider !== "typeform") {
    return { kind: "unknown_workflow" };
  }

  const config = row.config as {
    hookSecretEncrypted?: unknown;
    formId?: unknown;
  };
  if (
    typeof config.hookSecretEncrypted !== "string" ||
    config.hookSecretEncrypted.length === 0
  ) {
    // Aborted activation left a secretless row — nothing deliverable to
    // this row can be verified, so nothing is dispatched.
    return { kind: "unverifiable" };
  }

  const secret = decryptToken(config.hookSecretEncrypted);
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyTypeformSignature(rawBody, signatureHeader, secret);
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Typeform webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // Parse AFTER verification — a verified non-JSON body is malformed.
  let parsedBody: TypeformWebhookEvent;
  try {
    const candidate = JSON.parse(rawBody) as unknown;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("not an object");
    }
    parsedBody = candidate as TypeformWebhookEvent;
  } catch {
    throw new InvalidSignatureError(
      "Typeform webhook: body is not a JSON object despite a verified signature.",
    );
  }

  if (parsedBody.event_type !== "form_response") {
    // Defense-in-depth: only the standard form_response event is
    // supported this slice (partial-response webhooks are out of scope).
    return {
      kind: "ignored_event",
      eventType:
        typeof parsedBody.event_type === "string" ? parsedBody.event_type : null,
    };
  }

  const formId =
    typeof config.formId === "string" && config.formId.length > 0
      ? config.formId
      : null;

  return {
    kind: "events",
    events: [normalizeNewResponseInForm(parsedBody, { formId })],
  };
}
