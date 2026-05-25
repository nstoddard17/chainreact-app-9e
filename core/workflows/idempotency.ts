/**
 * Q4 — Idempotency utilities.
 *
 * Pure functions. No storage layer in this slice — the within-session
 * `checkReplay`/`recordFired` storage is deferred until V2 grows a same-session
 * retry mechanism. These helpers compute the stable key and payload hash that
 * downstream handlers use to drive provider-side dedup (e.g. Google Meet
 * `requestId`, Stripe `Idempotency-Key` header).
 */
import { createHash } from "node:crypto";

export type IdempotencyMeta = {
  executionSessionId: string;
  nodeId: string;
  actionType: string;
};

export function buildIdempotencyKey(meta: IdempotencyMeta): string {
  return `${meta.executionSessionId}:${meta.nodeId}:${meta.actionType}`;
}

/**
 * Canonical-form SHA-256 hash. Object keys are sorted recursively before
 * stringification so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the same
 * hash. Array order is preserved — order is part of the input.
 *
 * Excluded fields: caller's responsibility. If a field varies per execution
 * (e.g. a randomly-generated request id from V1), strip it before passing in.
 * In Calendar's createEvent, conferenceData.requestId is now derived
 * deterministically from `meta.runId + ':' + meta.nodeId`, so it can stay in
 * the hash without breaking replay detection.
 */
export function hashPayload(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
