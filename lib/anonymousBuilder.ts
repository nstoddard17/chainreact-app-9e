/**
 * ANON-BUILDER — anonymous (logged-out) draft + prompt handoff.
 *
 * A visitor can type a workflow idea on the marketing homepage, get taken into
 * the local-only builder (`/start`) WITHOUT signing in, lay out a skeleton, and
 * then — on Save/Activate/Run/Connect/AI — sign up and have that draft restored
 * into a real workflow (ANON-BUILDER-2).
 *
 * The draft is parked in localStorage (not sessionStorage) so it survives the
 * full auth round trip: a same-tab password sign-in, an OAuth full-page redirect,
 * AND an email-confirmation link that may open in a new tab. It never goes in the
 * URL.
 *
 * Hard limits (security / privacy):
 *   - Stores ONLY the user's own typed prompt + a SANITIZED graph skeleton
 *     (kind / provider / type / position / display name / sanitized config).
 *   - NEVER stores secrets, tokens, credential ids, provider account data, raw
 *     provider payloads, or file contents — secret-ish config keys are dropped.
 *   - Versioned payload; an unknown / future version reads back as `null`.
 *   - Bounded: prompt length, node/edge counts, config key count + value sizes.
 *
 * Environment-agnostic: every accessor guards `window`/`localStorage` so the
 * module is import-safe from server components (it just no-ops there).
 */

const DRAFT_KEY = "chainreact:anon-builder-draft";
const RESTORED_CONTEXT_PREFIX = "chainreact:anon-restored:";
const RESTORE_TARGET_KEY = "chainreact:anon-restore-target";

/**
 * Why a logged-out visitor hit a sign-up gate. A short, safe enum — the ONLY
 * thing carried about the gated action (never the action's payload). Drives the
 * contextual auth copy and the post-restore banner.
 */
export type AnonGateReason = "save" | "activate" | "run" | "connect" | "ai";

const ANON_GATE_REASONS: readonly AnonGateReason[] = ["save", "activate", "run", "connect", "ai"];

export function isAnonGateReason(value: unknown): value is AnonGateReason {
  return typeof value === "string" && (ANON_GATE_REASONS as readonly string[]).includes(value);
}

/** Bump when the persisted shape changes incompatibly. Older payloads read as null. */
export const ANON_DRAFT_VERSION = 1;

/** Cap on the carried-over prompt. Mirrors the homepage textarea / builder composer. */
export const ANON_PROMPT_MAX_LENGTH = 2000;

const MAX_NODES = 60;
const MAX_EDGES = 120;
const MAX_CONFIG_KEYS = 40;
const MAX_STRING_LEN = 2000;
const MAX_ARRAY_LEN = 50;

/** Drop any config key that looks like it could carry a secret / credential / identity. */
const SECRET_KEY_PATTERN =
  /(token|secret|password|api[_-]?key|credential|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|auth[_-]?token|private[_-]?key|session|cookie)/i;

export interface AnonDraftNode {
  id: string;
  kind: "trigger" | "action";
  provider: string;
  type: string;
  position?: { x: number; y: number };
  displayName?: string;
  config?: Record<string, unknown>;
}

export interface AnonDraftEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface AnonDraft {
  version: number;
  prompt: string;
  nodes: AnonDraftNode[];
  edges: AnonDraftEdge[];
}

export interface AnonDraftInput {
  prompt?: string;
  nodes?: readonly unknown[];
  edges?: readonly unknown[];
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    // Access can throw in privacy modes / sandboxed iframes.
    return null;
  }
}

function boundString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Sanitize one config value: only JSON primitives, arrays of primitives, and a
 * single level of object-of-primitives survive. Functions, deep nesting, and
 * non-finite numbers are dropped. Strings are length-bounded.
 */
function sanitizeConfigValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string") return (value as string).slice(0, MAX_STRING_LEN);
  if (t === "number") return Number.isFinite(value) ? value : undefined;
  if (t === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth > 0) return undefined;
    const out = value
      .slice(0, MAX_ARRAY_LEN)
      .map((v) => sanitizeConfigValue(v, depth + 1))
      .filter((v) => v !== undefined);
    return out;
  }
  if (t === "object" && depth === 0) {
    return sanitizeConfigObject(value as Record<string, unknown>, depth + 1);
  }
  return undefined;
}

function sanitizeConfigObject(
  raw: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (kept >= MAX_CONFIG_KEYS) break;
    if (SECRET_KEY_PATTERN.test(key)) continue; // never persist secret-ish keys
    const clean = sanitizeConfigValue(value, depth);
    if (clean !== undefined) {
      out[key] = clean;
      kept++;
    }
  }
  return out;
}

function sanitizeNode(raw: unknown): AnonDraftNode | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const id = boundString(n.id, 200);
  const provider = boundString(n.provider, 100);
  if (!id || !provider) return null;
  if (n.kind !== "trigger" && n.kind !== "action") return null;
  const node: AnonDraftNode = {
    id,
    kind: n.kind,
    provider,
    type: boundString(n.type, 200),
  };
  if (
    n.position &&
    typeof n.position === "object" &&
    Number.isFinite((n.position as { x?: unknown }).x) &&
    Number.isFinite((n.position as { y?: unknown }).y)
  ) {
    const p = n.position as { x: number; y: number };
    node.position = { x: p.x, y: p.y };
  }
  const displayName = boundString(n.displayName, 120);
  if (displayName) node.displayName = displayName;
  if (n.config && typeof n.config === "object" && !Array.isArray(n.config)) {
    node.config = sanitizeConfigObject(n.config as Record<string, unknown>, 0);
  }
  return node;
}

function sanitizeEdge(raw: unknown): AnonDraftEdge | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const id = boundString(e.id, 200);
  const from = boundString(e.from, 200);
  const to = boundString(e.to, 200);
  if (!id || !from || !to) return null;
  const edge: AnonDraftEdge = { id, from, to };
  const label = boundString(e.label, 64);
  if (label) edge.label = label;
  return edge;
}

/** Sanitize + bound an arbitrary input into a normalized AnonDraft (no version stamp yet). */
function normalize(input: AnonDraftInput): Omit<AnonDraft, "version"> {
  const prompt = (typeof input.prompt === "string" ? input.prompt.trim() : "").slice(
    0,
    ANON_PROMPT_MAX_LENGTH,
  );
  const nodes = (Array.isArray(input.nodes) ? input.nodes : [])
    .slice(0, MAX_NODES)
    .map(sanitizeNode)
    .filter((n): n is AnonDraftNode => n !== null);
  // Keep only edges whose endpoints survived node sanitization.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(input.edges) ? input.edges : [])
    .slice(0, MAX_EDGES)
    .map(sanitizeEdge)
    .filter((e): e is AnonDraftEdge => e !== null && nodeIds.has(e.from) && nodeIds.has(e.to));
  return { prompt, nodes, edges };
}

/** True when the draft has nothing worth restoring (no prompt and no nodes). */
function isEmptyDraft(d: Omit<AnonDraft, "version">): boolean {
  return d.prompt.length === 0 && d.nodes.length === 0;
}

/** Persist the full anonymous draft (sanitized + bounded + version-stamped). */
export function saveAnonDraft(input: AnonDraftInput): void {
  const storage = getLocalStorage();
  if (!storage) return;
  const normalized = normalize(input);
  if (isEmptyDraft(normalized)) {
    clearAnonDraft();
    return;
  }
  try {
    storage.setItem(
      DRAFT_KEY,
      JSON.stringify({ version: ANON_DRAFT_VERSION, ...normalized } satisfies AnonDraft),
    );
  } catch {
    // Quota / disabled storage — non-fatal.
  }
}

/** Read + validate + sanitize the stored draft. Returns null when absent / invalid / wrong version. */
export function readAnonDraft(): AnonDraft | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  let parsed: unknown;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (p.version !== ANON_DRAFT_VERSION) return null; // unknown/old schema → ignore
  const normalized = normalize(p as AnonDraftInput);
  if (isEmptyDraft(normalized)) return null;
  return { version: ANON_DRAFT_VERSION, ...normalized };
}

/** Remove the stored anonymous draft — called after a successful restore. */
export function clearAnonDraft(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ── prompt convenience (homepage handoff) ────────────────────────────────────

/** Set just the prompt, preserving any already-stored skeleton. */
export function setAnonPrompt(prompt: string): void {
  const existing = readAnonDraft();
  saveAnonDraft({
    prompt,
    nodes: existing?.nodes ?? [],
    edges: existing?.edges ?? [],
  });
}

/** Read just the prompt from the stored draft ("" when absent). */
export function readAnonPrompt(): string {
  return readAnonDraft()?.prompt ?? "";
}

// ── restore target (idempotency across retries) ──────────────────────────────

/**
 * The workflow id created by an in-flight restore, persisted BEFORE the skeleton
 * PATCH so a failed import can be retried against the SAME workflow instead of
 * creating a duplicate empty one (ANON-BUILDER-3 Scope A). Single key — only one
 * restore is ever in flight.
 */
export function setRestoreTarget(workflowId: string): void {
  const storage = getLocalStorage();
  if (!storage || !workflowId) return;
  try {
    storage.setItem(RESTORE_TARGET_KEY, workflowId);
  } catch {
    // ignore
  }
}

/** The pending restore-target workflow id ("" when none). */
export function readRestoreTarget(): string {
  const storage = getLocalStorage();
  if (!storage) return "";
  try {
    return storage.getItem(RESTORE_TARGET_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Drop the restore target (on success, or when it's confirmed unusable). */
export function clearRestoreTarget(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(RESTORE_TARGET_KEY);
  } catch {
    // ignore
  }
}

// ── restored context handoff (restore → real builder: composer seed + banner) ─

/** Safe, non-secret context handed to the real builder after a restore. */
export interface AnonRestoredContext {
  prompt: string;
  reason?: AnonGateReason;
}

/**
 * Park the prompt + gate reason for the freshly-created workflow so the real
 * builder can seed its React Agent composer once and show the next-action banner.
 * Stores only the safe prompt string + reason enum — never config/secrets.
 */
export function setRestoredContext(workflowId: string, ctx: AnonRestoredContext): void {
  const storage = getLocalStorage();
  if (!storage || !workflowId) return;
  const prompt = (ctx.prompt ?? "").trim().slice(0, ANON_PROMPT_MAX_LENGTH);
  const reason = isAnonGateReason(ctx.reason) ? ctx.reason : undefined;
  if (prompt.length === 0 && reason === undefined) return;
  try {
    storage.setItem(
      RESTORED_CONTEXT_PREFIX + workflowId,
      JSON.stringify({ prompt, ...(reason ? { reason } : {}) }),
    );
  } catch {
    // ignore
  }
}

/** Read + clear the restored context for a workflow (one-shot). null when absent/invalid. */
export function consumeRestoredContext(workflowId: string): AnonRestoredContext | null {
  const storage = getLocalStorage();
  if (!storage || !workflowId) return null;
  const key = RESTORED_CONTEXT_PREFIX + workflowId;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
    if (raw) storage.removeItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt.slice(0, ANON_PROMPT_MAX_LENGTH) : "";
    const reason = isAnonGateReason(parsed.reason) ? parsed.reason : undefined;
    if (prompt.length === 0 && reason === undefined) return null;
    return { prompt, ...(reason ? { reason } : {}) };
  } catch {
    return null;
  }
}
