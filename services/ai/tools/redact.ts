/**
 * Secret-value redaction for the AI tool layer (Slice 4.AI-2).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §8.
 *
 * The agent must NEVER receive token material or secrets. The connected-
 * integrations tool already constructs its output by explicit allow-list, so
 * no secret can structurally appear; `redactSecrets` is the defense-in-depth
 * final pass applied to any object that carries author-entered values we do
 * not control the shape of — chiefly `WorkflowNode.config` in the workflow
 * graph view, which can contain a manually-typed API key, an `Authorization`
 * header, a webhook secret, etc.
 *
 * IMPORTANT distinction: this redacts secret-keyed *values*, not schema field
 * *names*. ActionMeta / TriggerMeta field definitions (e.g. a field literally
 * named `apiKey`) are PUBLIC builder schema and are passed through unredacted —
 * the agent needs to know such a field exists. Redaction only ever touches
 * concrete values pulled from rows / configs.
 */

import { isSecretLikeKey } from "@/core/security/secretKeys";

/** Sentinel written in place of a redacted value. */
export const REDACTED = "[REDACTED]";

/**
 * True when a property key looks like it holds secret material. Exported so
 * tests and callers can assert the policy directly.
 *
 * CS-2A — the key-classification policy now lives in the shared, client-safe
 * `core/security/secretKeys.isSecretLikeKey` (single source of truth across this
 * server redactor and the builder chat-fill guard). This wrapper is kept for the
 * existing call sites + the `isSecretKey` name; redaction behavior below is
 * unchanged.
 */
export function isSecretKey(key: string): boolean {
  return isSecretLikeKey(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Deep-clone `value`, replacing any secret-keyed property value with the
 * `REDACTED` sentinel at every nesting level. Arrays are recursed; primitives
 * are returned as-is. Never mutates the input.
 *
 * A secret-keyed property is redacted wholesale (its entire subtree becomes
 * the sentinel) — we do not descend into a value we already know is secret.
 */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = isSecretKey(key) ? REDACTED : redactSecrets(val);
    }
    return out as T;
  }
  return value;
}
