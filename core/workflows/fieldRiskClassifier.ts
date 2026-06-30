import type { FieldSensitivity } from "@/contracts/actionMeta";
import type { WorkflowNodeKind } from "@/contracts/workflowDefinition";
import { isSecretLikeKey } from "@/core/security/secretKeys";

/**
 * Deterministic, conservative high-risk classification for ONE changed config field, for the React
 * Agent preview "Why this change?" rail (REACT-AGENT-PREVIEW-FIELD-REASONS).
 *
 * It answers: "is changing THIS field a major / high-risk change worth a field-level reason?" — and if
 * so, which category. It is intentionally conservative: a field that is NOT clearly high-risk returns
 * `null`, so cosmetic / minor fields (subject, message body, name, …) never produce noisy reasons.
 *
 * Signals, in priority order, are the SAME basis the apply-safety contract uses:
 *   1. declarative metadata `sensitivity` (`secret` / `connection` / `recipient`) — authoritative;
 *   2. conservative KEY-NAME heuristics as defense-in-depth when metadata is absent;
 *   3. node kind (`trigger`) — any trigger config change affects WHEN the workflow fires.
 *
 * No-leak: it reads ONLY the field KEY NAME, the declared sensitivity, the diff's secret flag, and the
 * node kind. It NEVER inspects a config value, so no caller can leak one through it.
 *
 * `core/` rule: imports only `contracts/` + the client-safe `core/security` classifier. Pure.
 */

export type FieldRiskCategory =
  | "recipient"
  | "connection"
  | "secret"
  | "trigger_config"
  | "action_effect";

export interface ClassifyFieldRiskInput {
  /** The field KEY name (never a value). */
  readonly name: string;
  /** The diff's redaction flag for this field (true ⇒ secret/connection material or secret-shaped key). */
  readonly secret: boolean;
  /** Declarative sensitivity from registry metadata, when known. */
  readonly sensitivity?: FieldSensitivity;
  /** The kind of node the field lives on — a trigger field change affects firing. */
  readonly nodeKind?: WorkflowNodeKind;
}

/** Lowercase + strip separators so `webhook_url`/`webhook-url`/`webhookUrl` collapse. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

/** Split a key into lowercased words on camelCase + separator boundaries. */
function tokenizeKey(key: string): readonly string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_.-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/** Distinctive recipient/destination fragments — substring-matched against the normalized key. */
const RECIPIENT_SUBSTRINGS: readonly string[] = [
  "recipient",
  "attendee",
  "webhook",
  "destination",
  "mailto",
  "sendto",
];

/** Short recipient/destination WORDS — token-matched so they don't collide as substrings. */
const RECIPIENT_WORDS: ReadonlySet<string> = new Set([
  "to",
  "cc",
  "bcc",
  "channel",
  "channels",
  "recipients",
]);

/** Connection/account-selection WORDS — narrow on purpose (metadata is the primary signal). */
const CONNECTION_WORDS: ReadonlySet<string> = new Set(["connection", "integration"]);

/** Externally-visible / destructive action-effect WORDS (delete/archive/send/publish/update toggles). */
const ACTION_EFFECT_WORDS: ReadonlySet<string> = new Set([
  "send",
  "publish",
  "archive",
  "delete",
  "remove",
  "notify",
  "broadcast",
  "visibility",
  "public",
]);

function matchesRecipient(name: string): boolean {
  const normalized = normalizeKey(name);
  if (RECIPIENT_SUBSTRINGS.some((p) => normalized.includes(p))) return true;
  return tokenizeKey(name).some((w) => RECIPIENT_WORDS.has(w));
}

function matchesConnection(name: string): boolean {
  return tokenizeKey(name).some((w) => CONNECTION_WORDS.has(w));
}

function matchesActionEffect(name: string): boolean {
  return tokenizeKey(name).some((w) => ACTION_EFFECT_WORDS.has(w));
}

/**
 * Classify a changed field's risk, or `null` when it is not clearly high-risk. Declarative metadata
 * wins over key-name heuristics; both are unioned (heuristics can only ADD a category, never clear one).
 */
export function classifyFieldRisk(input: ClassifyFieldRiskInput): FieldRiskCategory | null {
  const { name, sensitivity, nodeKind } = input;
  // 1. Declarative metadata — authoritative.
  if (sensitivity === "secret") return "secret";
  if (sensitivity === "connection") return "connection";
  if (sensitivity === "recipient") return "recipient";
  // 2. Key-name heuristics (defense-in-depth when metadata is absent). `secret` first: the diff's
  //    redaction flag OR a secret-shaped key means credential/auth material.
  if (input.secret || isSecretLikeKey(name)) return "secret";
  if (matchesConnection(name)) return "connection";
  if (matchesRecipient(name)) return "recipient";
  if (matchesActionEffect(name)) return "action_effect";
  // 3. Any trigger config change affects when the workflow fires.
  if (nodeKind === "trigger") return "trigger_config";
  return null;
}

const RISK_PHRASE: Record<FieldRiskCategory, string> = {
  recipient: "controls where this sends",
  connection: "changes the connected account",
  secret: "credential or auth material",
  action_effect: "affects what this action does",
  trigger_config: "affects when this runs",
};

/** Short, value-free user-facing phrase for a field-risk category. */
export function fieldRiskPhrase(category: FieldRiskCategory): string {
  return RISK_PHRASE[category];
}
