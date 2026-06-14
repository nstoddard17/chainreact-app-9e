import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";

/**
 * AI-CONFIG-ASSIST CS-1 — pure eligibility + value validation for the future
 * "chat-fill missing field" feature.
 *
 * Plan: docs/slices/phase-4/ai/ai-config-assist-chat-fill-plan.md.
 *
 * This module is the SAFETY FOUNDATION only. It decides:
 *   - `isChatFillEligible` — may a chat-typed value be placed into THIS field?
 *   - `validateChatFillValue` — is the proposed value acceptable to place?
 *
 * It does NOT fill anything, mutate builder state, save, run, render UI, call a
 * model, or touch browser state. Pure + deterministic + client-safe: it imports
 * ONLY the `@/contracts/actionMeta` types — never `@/services/**`,
 * `@/repositories/**`, or any server-only module. The secret-shaped-key check is
 * intentionally inlined (rather than reusing `services/ai/tools/redact.isSecretKey`)
 * to keep this helper free of any `services/` import per the client boundary.
 *
 * v1 deliberately allows the narrowest safe shape: a non-secret, non-recipient,
 * non-destructive `text`/`textarea` field. Everything else is blocked with a
 * stable reason code. Over-blocking is the safe failure mode here.
 */

// ─── Eligibility ─────────────────────────────────────────────────────────────

/** Stable, no-leak reason codes for an ineligible field. */
export type ChatFillIneligibleReason =
  | "MISSING_FIELD_METADATA"
  | "SECRET_FIELD"
  | "RECIPIENT_OR_DESTINATION_FIELD"
  | "DESTRUCTIVE_ACTION"
  | "CONFIRMATION_REQUIRED_ACTION"
  | "UNSUPPORTED_FIELD_TYPE";

export type ChatFillEligibility =
  | { readonly ok: true; readonly field: FieldMeta }
  | { readonly ok: false; readonly reason: ChatFillIneligibleReason };

export interface ChatFillEligibilityInput {
  /**
   * The resolved `FieldMeta` for the target field, or `undefined` when the field
   * key isn't present in the node's action/trigger metadata (stale / unknown
   * target → `MISSING_FIELD_METADATA`).
   */
  readonly field: FieldMeta | undefined;
  /**
   * Action-level risk flags for the target node, when it is an action. Triggers
   * carry none — omit it (treated as non-destructive / no-confirmation).
   */
  readonly action?: Pick<ActionMeta, "isDestructive" | "requiresConfirmation">;
}

/** Renderer types whose value is a plain free-text string — the only v1-fillable shape. */
const FILLABLE_FIELD_TYPES: ReadonlySet<FieldMeta["type"]> = new Set([
  "text",
  "textarea",
]);

/**
 * Secret-shaped key fragments (matched against the separator-stripped, lowercased
 * key). Substring matching here is deliberate — over-blocking a secret is safe.
 */
const SECRET_KEY_FRAGMENTS: readonly string[] = [
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "bearer",
  "auth",
  "credential",
  "privatekey",
  "clientsecret",
  "accesskey",
];

/**
 * Recipient / destination key WORDS (matched against camelCase/separator-split
 * tokens, so `channelId` → `channel`, `webhookUrl` → `webhook`+`url`). Word-level
 * matching avoids false positives on normal text fields (e.g. `customMessage`
 * contains the substring "to" but tokenizes to `custom`/`message`).
 */
const RECIPIENT_KEY_WORDS: ReadonlySet<string> = new Set([
  "to",
  "cc",
  "bcc",
  "recipient",
  "recipients",
  "attendee",
  "attendees",
  "channel",
  "webhook",
  "webhookurl",
  "url",
  "uri",
  "email",
  "mail",
  "phone",
  "address",
  "destination",
  "dest",
  "target",
]);

/** Lowercase + strip all non-alphanumerics — for substring (secret) matching. */
function flattenKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Split a key into lowercased words on camelCase + `_ - .` boundaries. */
function tokenizeKey(key: string): readonly string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_.-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

function isSecretShapedKey(key: string): boolean {
  const flat = flattenKey(key);
  return SECRET_KEY_FRAGMENTS.some((fragment) => flat.includes(fragment));
}

function isRecipientOrDestinationKey(key: string): boolean {
  return tokenizeKey(key).some((word) => RECIPIENT_KEY_WORDS.has(word));
}

/**
 * Decide whether a chat-typed value may be placed into the given field.
 *
 * Order is by safety severity so the most protective reason wins when several
 * apply: missing metadata → secret → recipient/destination → destructive action
 * → confirmation-required action → unsupported field type.
 */
export function isChatFillEligible(
  input: ChatFillEligibilityInput,
): ChatFillEligibility {
  const { field, action } = input;

  if (!field) return { ok: false, reason: "MISSING_FIELD_METADATA" };
  if (isSecretShapedKey(field.name)) return { ok: false, reason: "SECRET_FIELD" };
  if (isRecipientOrDestinationKey(field.name)) {
    return { ok: false, reason: "RECIPIENT_OR_DESTINATION_FIELD" };
  }
  if (action?.isDestructive) return { ok: false, reason: "DESTRUCTIVE_ACTION" };
  if (action?.requiresConfirmation) {
    return { ok: false, reason: "CONFIRMATION_REQUIRED_ACTION" };
  }
  if (!FILLABLE_FIELD_TYPES.has(field.type)) {
    return { ok: false, reason: "UNSUPPORTED_FIELD_TYPE" };
  }
  return { ok: true, field };
}

// ─── Value validation ────────────────────────────────────────────────────────

/** Stable reason codes for a rejected fill value. */
export type ChatFillValueReason = "NON_STRING_VALUE" | "EMPTY_VALUE" | "VALUE_TOO_LONG";

export type ChatFillValueResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: ChatFillValueReason };

/**
 * Upper bound on a chat-fill value's length. Generous enough for a long message
 * body, tight enough to reject obviously-pasted-garbage. The handler schema
 * remains the authoritative validator at apply/run time.
 */
export const MAX_CHAT_FILL_VALUE_LENGTH = 10_000;

/**
 * Validate a proposed chat-fill value (field-agnostic). Returns the user's EXACT
 * typed value on success — never trimmed/normalized — so insertion later places
 * precisely what the user wrote; trimming is used ONLY to detect emptiness.
 *
 * Never throws, never echoes secrets (it does not know the field; secret fields
 * are blocked earlier by `isChatFillEligible`), never calls a model or reads
 * browser state.
 */
export function validateChatFillValue(value: unknown): ChatFillValueResult {
  if (typeof value !== "string") return { ok: false, reason: "NON_STRING_VALUE" };
  if (value.trim().length === 0) return { ok: false, reason: "EMPTY_VALUE" };
  if (value.length > MAX_CHAT_FILL_VALUE_LENGTH) {
    return { ok: false, reason: "VALUE_TOO_LONG" };
  }
  return { ok: true, value };
}
