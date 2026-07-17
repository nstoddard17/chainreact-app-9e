import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { decryptToken } from "@/core/encryption/tokens";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyMotiveSignature } from "@/integrations/_shared/motive/webhooks/signature";
import { isMotiveTriggerType } from "./eventMap";
import { normalizeMotiveEvent } from "./normalize";

/**
 * Shared receive helper for Motive company webhooks — MOTIVE-1.
 *
 * Single route at `/api/webhooks/motive` handles all 7 Motive webhook trigger
 * types. Strict-direct-lookup: the URL carries `?workflowId=X&nodeId=Y` (set at
 * activation) so the trigger row — and its per-webhook secret — resolve without
 * parsing the body first.
 *
 * Flow:
 *   1. Resolve the row via query params. Missing/foreign → quiet ack.
 *   2. Row without a stored secret (activation not yet committed / aborted) →
 *      `unverifiable` quiet ack — never dispatch what we can't verify. Motive's
 *      retry (1m/1h/6h) recovers once the secret lands.
 *   3. Verify `X-KT-Webhook-Signature` (HMAC-SHA1 hex over the RAW bytes, keyed
 *      with the row's secret). Fail → InvalidSignatureError (route 401).
 *   4. Parse the JSON body AFTER verification. Normalize against THE ROW's
 *      trigger type, threading the row's `companyId`.
 *
 * `X-KT-Webhook-Signature` secrets are per-webhook (unlike an app-level env
 * secret), so verification happens AFTER row resolution — there is no
 * missing-env 503 mode.
 */

const SIGNATURE_HEADER = "x-kt-webhook-signature";

export type MotiveReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "unverifiable" }
  | { kind: "events"; events: TriggerEvent[] };

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

export interface ReceiveMotiveWebhookInput {
  request: Request;
  /** Raw body — the receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export async function receiveMotiveWebhook(
  input: ReceiveMotiveWebhookInput,
): Promise<MotiveReceiveResult> {
  const { request, rawBody } = input;

  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  const row = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (!row || row.provider !== "motive") {
    return { kind: "unknown_workflow" };
  }

  const config = row.config as {
    hookSecretEncrypted?: unknown;
    companyId?: unknown;
  };
  if (
    typeof config.hookSecretEncrypted !== "string" ||
    config.hookSecretEncrypted.length === 0
  ) {
    // Activation not committed / aborted — nothing verifiable, nothing
    // dispatched. Motive retries; a committed secret recovers it.
    return { kind: "unverifiable" };
  }

  const secret = decryptToken(config.hookSecretEncrypted);
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyMotiveSignature(rawBody, signatureHeader, secret);
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Motive webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // Parse AFTER verification — a verified non-JSON body is malformed.
  let parsedBody: Record<string, unknown>;
  try {
    const candidate = JSON.parse(rawBody) as unknown;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("not an object");
    }
    parsedBody = candidate as Record<string, unknown>;
  } catch {
    throw new InvalidSignatureError(
      "Motive webhook: body is not a JSON object despite a verified signature.",
    );
  }

  if (!isMotiveTriggerType(row.eventType)) {
    // Skewed deploy — a row with an eventType this deployment doesn't know.
    return { kind: "events", events: [] };
  }
  const triggerType = row.eventType;

  const companyId =
    typeof config.companyId === "string" && config.companyId.length > 0
      ? config.companyId
      : (row.providerAccountId ?? null);
  if (!companyId) {
    // No company scope → nothing safe to attribute/dispatch.
    return { kind: "events", events: [] };
  }

  const action =
    typeof parsedBody.action === "string" && parsedBody.action.length > 0
      ? parsedBody.action
      : null;

  const event = normalizeMotiveEvent(triggerType, parsedBody, {
    companyId,
    action,
    receivedAt: new Date().toISOString(),
  });

  return { kind: "events", events: [event] };
}
