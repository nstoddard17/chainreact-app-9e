/**
 * Sensitive-literal tokenization for the AI guidance boundary (REACT-CONFIG-COVERAGE-1).
 *
 * The user's own goal text may carry recipient-class literals — email addresses, phone numbers —
 * that the guidance brain (Hermes, via the public gateway) must never see raw, while the FINAL
 * workflow config must still receive the user's exact value. This module implements the local
 * placeholder flow:
 *
 *   1. ChainReact TOKENIZES the outbound text: each detected literal is replaced by a stable typed
 *      placeholder (`[[EMAIL_1]]`, `[[PHONE_1]]`) and the exact original value is kept in a
 *      server-side binding list that NEVER crosses the boundary.
 *   2. Hermes may assign a placeholder to a config field (it is instructed to copy it VERBATIM).
 *   3. ChainReact REBINDS the placeholder back to the original literal in the model's output
 *      (plan-step config values, patch-operation config values, display text) BEFORE validation,
 *      preview, and apply — so the saved workflow contains the user's intended value.
 *
 * Pure + deterministic: no I/O, no model calls, no state. The same literal always maps to the same
 * token within one request (bindings are threaded through successive `tokenizeSensitiveLiterals`
 * calls for goal text + conversation turns).
 *
 * Detection is deliberately CONSERVATIVE for phones (international `+` format and US
 * `(nnn) nnn-nnnn` style only) — a bare digit run is ambiguous with ids/amounts and must not be
 * mangled. Credentials/API keys/tokens are NOT handled here: those are redacted (never
 * tokenized/rebindable) by `redactSecretsFromText` at the prompt builder — a secret must never
 * round-trip through a placeholder.
 */

export type SensitiveLiteralKind = "email" | "phone";

export interface SensitiveLiteralBinding {
  /** The placeholder token sent instead of the literal, e.g. "[[EMAIL_1]]". */
  readonly token: string;
  readonly kind: SensitiveLiteralKind;
  /** The exact original literal. SERVER-SIDE ONLY — never sent to the gateway or logged. */
  readonly value: string;
}

export interface TokenizeResult {
  /** The input text with every detected literal replaced by its token. */
  readonly text: string;
  /** All bindings known after this call (prior bindings + newly minted ones). */
  readonly bindings: readonly SensitiveLiteralBinding[];
}

/** RFC-lite email shape — matches the common forms users actually type. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/g;

/**
 * Conservative phone shapes only:
 *  - international: `+` then 7–15 digits with optional space/dot/dash/paren separators,
 *  - US-style: `(nnn) nnn-nnnn` (parens required, so a plain 10-digit id never matches).
 */
const PHONE_RE = /\+\d(?:[\d\s().-]{5,18}\d)|\(\d{3}\)\s?\d{3}[-.\s]\d{4}/g;

/** Token shape the model is asked to copy verbatim. Also used to find tokens when rebinding. */
const TOKEN_RE = /\[\[(EMAIL|PHONE)_(\d{1,3})\]\]/g;

function nextIndexFor(kind: SensitiveLiteralKind, bindings: readonly SensitiveLiteralBinding[]): number {
  return bindings.filter((b) => b.kind === kind).length + 1;
}

function tokenFor(kind: SensitiveLiteralKind, index: number): string {
  return `[[${kind.toUpperCase()}_${index}]]`;
}

/** Case-insensitive lookup for an existing binding of the same literal (emails compare lowercased). */
function findExisting(
  kind: SensitiveLiteralKind,
  value: string,
  bindings: readonly SensitiveLiteralBinding[],
): SensitiveLiteralBinding | undefined {
  const norm = kind === "email" ? value.toLowerCase() : value.replace(/[\s().-]/g, "");
  return bindings.find(
    (b) => b.kind === kind && (kind === "email" ? b.value.toLowerCase() === norm : b.value.replace(/[\s().-]/g, "") === norm),
  );
}

function tokenizeKind(
  text: string,
  kind: SensitiveLiteralKind,
  re: RegExp,
  bindings: SensitiveLiteralBinding[],
): string {
  re.lastIndex = 0;
  return text.replace(re, (match) => {
    const existing = findExisting(kind, match, bindings);
    if (existing) return existing.token;
    const binding: SensitiveLiteralBinding = {
      token: tokenFor(kind, nextIndexFor(kind, bindings)),
      kind,
      value: match,
    };
    bindings.push(binding);
    return binding.token;
  });
}

/**
 * Replace every detected sensitive literal in `text` with a stable typed placeholder. The same
 * literal (case-insensitive for emails, separator-insensitive for phones) maps to the same token
 * across calls when `priorBindings` are threaded through. The input is never mutated.
 */
export function tokenizeSensitiveLiterals(
  text: string,
  priorBindings: readonly SensitiveLiteralBinding[] = [],
): TokenizeResult {
  const bindings: SensitiveLiteralBinding[] = [...priorBindings];
  let out = tokenizeKind(text, "email", EMAIL_RE, bindings);
  out = tokenizeKind(out, "phone", PHONE_RE, bindings);
  return { text: out, bindings };
}

/** Replace every known token in `text` with its bound original literal. Unknown tokens are left as-is. */
export function rebindSensitiveLiteralsInText(
  text: string,
  bindings: readonly SensitiveLiteralBinding[],
): string {
  if (bindings.length === 0 || typeof text !== "string" || !text.includes("[[")) return text;
  const byToken = new Map(bindings.map((b) => [b.token, b.value]));
  TOKEN_RE.lastIndex = 0;
  return text.replace(TOKEN_RE, (match) => byToken.get(match) ?? match);
}

/**
 * Deep-rebind tokens inside an arbitrary JSON-safe value (config records, plan steps, operations).
 * Strings are rebound; arrays/objects are walked; everything else passes through untouched. Returns
 * a NEW value — the input is never mutated.
 */
export function rebindSensitiveLiteralsDeep<T>(value: T, bindings: readonly SensitiveLiteralBinding[]): T {
  if (bindings.length === 0) return value;
  if (typeof value === "string") return rebindSensitiveLiteralsInText(value, bindings) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => rebindSensitiveLiteralsDeep(v, bindings)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rebindSensitiveLiteralsDeep(v, bindings);
    }
    return out as unknown as T;
  }
  return value;
}

/** True when `text` still contains an (un-rebound) sensitive-literal token. */
export function containsSensitiveLiteralToken(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}

/** True when `text` contains a RAW (un-tokenized) sensitive literal. Used by no-leak tests/guards. */
export function containsRawSensitiveLiteral(text: string): boolean {
  EMAIL_RE.lastIndex = 0;
  if (EMAIL_RE.test(text)) return true;
  PHONE_RE.lastIndex = 0;
  return PHONE_RE.test(text);
}
