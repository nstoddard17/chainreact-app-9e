import { isSecretLikeKey } from "@/core/security/secretKeys";
import type {
  AgentMessageKind,
  AgentMessageRole,
  SanitizedAgentMessage,
} from "@/contracts/builderAgentMessage";

/**
 * Builder Agent message sanitizer (Slice 4.AI-23).
 *
 * Persistent Builder Agent threads (workflow-scoped React Agent chat history)
 * are saved AFTER a sanitization pass that:
 *
 *   - Allowlists every key that may appear in `safe_payload`. Any other key —
 *     including `proposedPatch`, `patch`, `operations`, `config`,
 *     `workflowDefinition`, raw provider responses, raw integration metadata
 *     — is dropped silently. This is intentional: callers should never pass
 *     those, but the policy is enforced server-side as defense in depth.
 *   - Denylists secret-shaped keys at ANY depth (token / accessToken /
 *     refreshToken / apiKey / clientSecret / webhookSecret / authorization /
 *     bearer / password / privateKey / refresh_token / etc).
 *   - Scans every string value for known token / bearer / sk-/ya29.
 *     /AKIA/ shapes; matched strings replace the entire string with
 *     `"[redacted]"` so a poisoned payload still produces a valid (but
 *     value-free) row instead of leaking a secret into Postgres.
 *   - Caps string lengths (per-field + overall) and object depth so a runaway
 *     model output can't bloat the messages table.
 *   - Allowlists role + kind to the ChatMessage taxonomy used by the
 *     AI-21B/AI-21C session-local chat.
 *
 * Pure module — no I/O, no Supabase, no Next.js. The repository / route layer
 * calls `sanitizeAgentMessageForPersist({...})` on every inbound write.
 *
 * Reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §AI-23.
 */

// Role / kind enums + SanitizedAgentMessage live in `contracts/` so the
// repository can import them without crossing the services boundary.
export type { AgentMessageRole, AgentMessageKind, SanitizedAgentMessage };

/** Caller-supplied (sanitized) shape we persist. All fields optional except role / kind. */
export interface AgentMessageInput {
  readonly role: AgentMessageRole;
  readonly kind: AgentMessageKind;
  /** Free-text body (user message text, assistant summary, error copy). */
  readonly content?: string | null;
  /** Allowlisted JSON projection of the route response. May be missing / {}. */
  readonly safePayload?: Readonly<Record<string, unknown>> | null;
}

export class SanitizeAgentMessageError extends Error {
  readonly code:
    | "INVALID_ROLE"
    | "INVALID_KIND"
    | "INVALID_ROLE_KIND_COMBINATION"
    | "INVALID_SHAPE";
  constructor(
    message: string,
    code: SanitizeAgentMessageError["code"],
  ) {
    super(message);
    this.name = "SanitizeAgentMessageError";
    this.code = code;
  }
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** Mirrors the planner's MAX_PROMPT_LENGTH; the migration also caps at 8 KB. */
const MAX_CONTENT_LENGTH = 8_000;
/** Per-string cap inside safePayload (long change descriptions, summaries). */
const MAX_PAYLOAD_STRING_LENGTH = 4_000;
/** Defense against a deeply-nested poisoned payload. */
const MAX_PAYLOAD_DEPTH = 8;
/** Defense against an unbounded list of changes / required-input items. */
const MAX_PAYLOAD_ARRAY_LENGTH = 200;
/** Overall stringified-JSON cap. */
const MAX_PAYLOAD_SERIALIZED_BYTES = 32_000;

// ── Role / kind allowlist + combination rules ───────────────────────────────

const ROLES: ReadonlySet<AgentMessageRole> = new Set(["user", "assistant"]);
const KINDS: ReadonlySet<AgentMessageKind> = new Set([
  "prompt",
  "followup",
  "plan_result",
  "needs_input",
  "applied",
  "apply_failure",
  "error",
  "system_notice",
]);

const USER_KINDS: ReadonlySet<AgentMessageKind> = new Set(["prompt", "followup"]);
const ASSISTANT_KINDS: ReadonlySet<AgentMessageKind> = new Set([
  "plan_result",
  "needs_input",
  "applied",
  "apply_failure",
  "error",
  "system_notice",
]);

// ── Secret-shaped key denylist ─────────────────────────────────────────────
//
// Matched against EVERY allowlisted object key at every depth. If a payload
// object has a matching key, the entire pair is dropped (not the value
// redacted) — because any "{ accessToken: 'foo' }" is suspicious by shape
// regardless of whether the value happens to look like a token.
//
// CS-11 — delegates to the shared, client-safe classifier
// `core/security/secretKeys.isSecretLikeKey` (single source of truth across
// redaction + chat-fill eligibility), removing the inline substring list that
// had drifted. The classifier normalizes `_`/`-` so V2 snake_case equivalents
// (`access_token`, `refresh_token`, `private_key`, `api_key`) are covered, and
// it deliberately excludes the innocuous `oauth` capability key. This is
// defense-in-depth ON TOP of the payload allowlist below — no allowlisted key
// is secret-shaped, so this gate's effective behavior is unchanged; the name
// `isSecretKey` is retained so the call sites + `__testing` export are stable.
function isSecretKey(key: string): boolean {
  return isSecretLikeKey(key);
}

// Hard-deny keys that name raw planner / workflow internals. These are NEVER
// allowed in safe_payload (different from secret-key denylist — they're not
// secrets, but they're "the thing we explicitly don't persist").
const FORBIDDEN_INTERNAL_KEYS: ReadonlySet<string> = new Set([
  "proposedpatch",
  "patch",
  "rawpatch",
  "operations",
  "config",
  "configuration",
  "workflowdefinition",
  "definition",
  "draftdefinition",
  "draft_definition",
  "rawresponse",
  "rawmodeloutput",
  "modelresponse",
  "rawprompt",
  "completion",
  "execution",
  "executionpayload",
  "integrationmetadata",
]);

function isForbiddenInternalKey(key: string): boolean {
  return FORBIDDEN_INTERNAL_KEYS.has(key.toLowerCase());
}

// ── Secret-VALUE pattern scan ───────────────────────────────────────────────
//
// Applied to every string value (content + payload strings). If the string
// matches any of these shapes, the WHOLE string becomes `"[redacted]"`. The
// patterns are deliberately narrow: we are not trying to detect every secret
// ever, only the shapes the prompt called out — plus the V2 audit list (V1
// auth refactor + token-ingest tests). Better to over-redact than to leak.

const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bya29\.[A-Za-z0-9_-]{10,}/, // Google OAuth access tokens
  /\b1\/\/0[A-Za-z0-9_-]{10,}/, // Google refresh tokens
  /\bsk-[A-Za-z0-9_-]{16,}/, // OpenAI / Anthropic
  /\bsk-ant-[A-Za-z0-9_-]{16,}/, // Anthropic-specific
  /\bxox[bpsr]-[A-Za-z0-9-]{10,}/, // Slack bot/user/app tokens
  /\bghp_[A-Za-z0-9]{16,}/, // GitHub personal access token (classic)
  /\bgho_[A-Za-z0-9]{16,}/, // GitHub OAuth user token
  /\bghs_[A-Za-z0-9]{16,}/, // GitHub app server token
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bBearer\s+[A-Za-z0-9_.=-]+/i, // Authorization: Bearer <token>
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
  /\bxapp-[A-Za-z0-9]{1,}-[A-Za-z0-9]{16,}/, // Slack app-level token
  /\bxoxe\.xoxp-[A-Za-z0-9-]{16,}/, // Slack rotating-refresh token
  /\brefresh_token\s*[:=]\s*['"][A-Za-z0-9_.-]+['"]/i, // labelled tokens
];

function looksLikeSecretValue(s: string): boolean {
  return SECRET_VALUE_PATTERNS.some((re) => re.test(s));
}

// ── Payload allowlist ──────────────────────────────────────────────────────
//
// Top-level safe_payload keys we accept; everything else is dropped silently.
// (We're not throwing on "unknown" keys because the route is forward-
// compatible: a future planner field that hasn't been added to the allowlist
// yet shouldn't break the persistence path — it just isn't stored.)

const TOP_LEVEL_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  // Common to both ok=true and ok=false planner results
  "ok",
  "code",
  "intentSummary",
  "assumptions",
  "unsupportedRequests",
  "safetyNotes",
  "requiredUserInput",
  "preview",
  "canApplyLater",
  "blockedReason",
  // Apply outcomes (AI-9B + AI-21B "applied" bubble)
  "summaryText",
  "appliedOperationCount",
  "riskLevel",
  "requiresConfirmation",
]);

const REQUIRED_USER_INPUT_KEYS: ReadonlySet<string> = new Set([
  // Display labels + flags (no nodeId / no field / no live options /
  // no optionsSource resolver key — those are graph-internal references
  // that don't add value to a frozen historical preview)
  "label",
  "kind",
  "provider",
  "nodeType",
  "nodeLabel",
  "fieldLabel",
  "fieldType",
  "multiple",
  "placeholder",
]);

const PREVIEW_KEYS: ReadonlySet<string> = new Set([
  // Counts + risk shape only — already shown in the AI-11B preview UI.
  "riskLevel",
  "requiresConfirmation",
  "changeCount",
  "affectedNodeCount",
  "affectedEdgeCount",
  "userFacingSummaryText",
  "taskCostEstimate",
  "blockedReason",
]);

const TASK_COST_KEYS: ReadonlySet<string> = new Set([
  "estimatedTasksPerRun",
]);

// ── Sanitization core ───────────────────────────────────────────────────────

function sanitizeString(s: string, max: number): string {
  if (looksLikeSecretValue(s)) return "[redacted]";
  if (s.length > max) return s.slice(0, max);
  return s;
}

/**
 * Generic value sanitizer used inside leaf positions (e.g. inside an entry of
 * `requiredUserInput`). Only primitives + short arrays of primitives survive.
 * Objects nested below an allowlisted slot are dropped.
 */
function sanitizePrimitive(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "string") return sanitizeString(value, MAX_PAYLOAD_STRING_LENGTH);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  // arrays of primitives only (used for affectedNodeIds etc — currently
  // unused, kept for forward compat)
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_PAYLOAD_ARRAY_LENGTH)
      .map((v) => sanitizePrimitive(v))
      .filter((v) => v !== undefined);
  }
  // Object → drop. (Allowlisted slots handle their own object sanitation.)
  return undefined;
}

function sanitizeRequiredUserInputItem(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!REQUIRED_USER_INPUT_KEYS.has(key)) continue;
    if (isSecretKey(key) || isForbiddenInternalKey(key)) continue;
    const v = sanitizePrimitive(value);
    if (v !== undefined) out[key] = v;
  }
  // Label is the only field the UI actually requires for a read-only summary;
  // drop the item if even that's missing after sanitization.
  if (typeof out.label !== "string" || out.label.length === 0) return null;
  return out;
}

function sanitizeRequiredUserInput(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: Record<string, unknown>[] = [];
  for (const item of raw.slice(0, MAX_PAYLOAD_ARRAY_LENGTH)) {
    const s = sanitizeRequiredUserInputItem(item);
    if (s) items.push(s);
  }
  return items;
}

function sanitizeTaskCost(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!TASK_COST_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizePreview(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!PREVIEW_KEYS.has(key)) continue;
    if (isSecretKey(key) || isForbiddenInternalKey(key)) continue;
    if (key === "taskCostEstimate") {
      const tc = sanitizeTaskCost(value);
      if (tc) out[key] = tc;
      continue;
    }
    const v = sanitizePrimitive(value);
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const v of raw.slice(0, MAX_PAYLOAD_ARRAY_LENGTH)) {
    if (typeof v !== "string") continue;
    const s = sanitizeString(v, MAX_PAYLOAD_STRING_LENGTH);
    if (s.length > 0) out.push(s);
  }
  return out;
}

function sanitizeSafePayload(
  raw: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  // Hard depth guard — we never iterate deeper than MAX_PAYLOAD_DEPTH in
  // total. The recursion below is bounded to depth 3 by construction (top
  // level → preview/requiredUserInput → taskCostEstimate), but the depth
  // counter is a belt-and-suspenders for forward changes to the allowlist.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!TOP_LEVEL_PAYLOAD_KEYS.has(key)) continue;
    if (isSecretKey(key) || isForbiddenInternalKey(key)) continue;
    switch (key) {
      case "requiredUserInput": {
        const v = sanitizeRequiredUserInput(value);
        if (v !== undefined) out[key] = v;
        break;
      }
      case "preview": {
        const v = sanitizePreview(value);
        if (v !== undefined) out[key] = v;
        break;
      }
      case "assumptions":
      case "unsupportedRequests":
      case "safetyNotes": {
        const v = sanitizeStringArray(value);
        if (v !== undefined) out[key] = v;
        break;
      }
      default: {
        const v = sanitizePrimitive(value);
        if (v !== undefined) out[key] = v;
        break;
      }
    }
  }
  // Final serialized-size cap. If the payload is somehow still too big
  // (e.g. lots of small allowed strings), drop fields least useful for the
  // historical render until it fits, in this priority order.
  const dropOrder = [
    "preview",
    "requiredUserInput",
    "safetyNotes",
    "unsupportedRequests",
    "assumptions",
  ];
  let serialized = JSON.stringify(out);
  for (const k of dropOrder) {
    if (serialized.length <= MAX_PAYLOAD_SERIALIZED_BYTES) break;
    if (k in out) {
      delete out[k];
      serialized = JSON.stringify(out);
    }
  }
  return out;
}

function depthOf(value: unknown, depth = 0): number {
  if (depth > MAX_PAYLOAD_DEPTH) return depth;
  if (!value || typeof value !== "object") return depth;
  if (Array.isArray(value)) {
    return value.reduce<number>((d, v) => Math.max(d, depthOf(v, depth + 1)), depth);
  }
  return Object.values(value).reduce<number>(
    (d, v) => Math.max(d, depthOf(v, depth + 1)),
    depth,
  );
}

// ── Public entry point ──────────────────────────────────────────────────────

export function sanitizeAgentMessageForPersist(
  input: AgentMessageInput,
): SanitizedAgentMessage {
  if (!ROLES.has(input.role)) {
    throw new SanitizeAgentMessageError(
      `Unsupported role: ${input.role}`,
      "INVALID_ROLE",
    );
  }
  if (!KINDS.has(input.kind)) {
    throw new SanitizeAgentMessageError(
      `Unsupported kind: ${input.kind}`,
      "INVALID_KIND",
    );
  }
  if (input.role === "user" && !USER_KINDS.has(input.kind)) {
    throw new SanitizeAgentMessageError(
      `Kind "${input.kind}" is not valid for role "user".`,
      "INVALID_ROLE_KIND_COMBINATION",
    );
  }
  if (input.role === "assistant" && !ASSISTANT_KINDS.has(input.kind)) {
    throw new SanitizeAgentMessageError(
      `Kind "${input.kind}" is not valid for role "assistant".`,
      "INVALID_ROLE_KIND_COMBINATION",
    );
  }
  // Pre-check depth on the raw payload — refuse rather than silently
  // truncating to surface bugs in callers.
  if (
    input.safePayload &&
    depthOf(input.safePayload) > MAX_PAYLOAD_DEPTH
  ) {
    throw new SanitizeAgentMessageError(
      `safePayload exceeds max depth ${MAX_PAYLOAD_DEPTH}`,
      "INVALID_SHAPE",
    );
  }

  let content: string | null = null;
  if (typeof input.content === "string") {
    content = sanitizeString(input.content, MAX_CONTENT_LENGTH);
  }

  const safePayload = sanitizeSafePayload(input.safePayload ?? null);

  return { role: input.role, kind: input.kind, content, safePayload };
}

// Internals exported for unit tests only (not part of the public API).
export const __testing = {
  isSecretKey,
  isForbiddenInternalKey,
  looksLikeSecretValue,
  sanitizeSafePayload,
  MAX_CONTENT_LENGTH,
  MAX_PAYLOAD_STRING_LENGTH,
  MAX_PAYLOAD_SERIALIZED_BYTES,
};
