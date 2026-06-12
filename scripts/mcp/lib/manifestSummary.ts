/**
 * Internal MCP server — provider manifest summarizer (TEXT ONLY).
 *
 * CRITICAL: this NEVER imports or executes a manifest module. Provider manifest
 * files run `ProviderManifestSchema.parse({...})` at import time and pull in app
 * code; importing them from a dev tool would execute provider/app code and risk
 * side effects. Instead we read the file as text and extract a conservative
 * summary with regexes. Any field that cannot be parsed is reported as null —
 * we never guess.
 */

export interface ManifestSummary {
  /** Provider id from the folder name (authoritative for the folder). */
  folderId: string;
  /** `id:` field parsed from the manifest text, or null. */
  declaredId: string | null;
  displayName: string | null;
  isEnabled: boolean | null;
  isExperimental: boolean | null;
  apiVersion: string | null;
  tokenScope: string | null;
  authFlow: string | null;
  refreshable: boolean | null;
  /** Required OAuth scopes, text-parsed from the `scopes.required` array (null if not found). */
  scopesRequired: string[] | null;
  /** Optional OAuth scopes, text-parsed from the `scopes.optional` array (null if not found). */
  scopesOptional: string[] | null;
  /** Raw expression text of healthCheckIntervalMs (not evaluated). */
  healthCheckIntervalMsExpr: string | null;
  capabilities: {
    oauth: boolean | null;
    webhookTrigger: boolean | null;
    pollingTrigger: boolean | null;
    actions: boolean | null;
  };
  /** Note when text parsing could not find expected structure. */
  notes: string[];
}

function matchString(text: string, key: string): string | null {
  const m = text.match(new RegExp(`\\b${key}\\s*:\\s*["']([^"']+)["']`));
  return m?.[1] ?? null;
}

function matchBool(text: string, key: string): boolean | null {
  const m = text.match(new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`));
  if (!m) return null;
  return m[1] === "true";
}

function extractCapabilitiesBlock(text: string): string | null {
  const start = text.indexOf("capabilities");
  if (start === -1) return null;
  const brace = text.indexOf("{", start);
  if (brace === -1) return null;
  // Balanced-brace scan from the opening brace.
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(brace, i + 1);
    }
  }
  return null;
}

/**
 * Find the balanced `{ ... }` body of a named object key (e.g. `scopes`,
 * `capabilities`). Reused by both block extractors. Text-only, no execution.
 */
function extractObjectBlock(text: string, key: string): string | null {
  const start = text.indexOf(key);
  if (start === -1) return null;
  const brace = text.indexOf("{", start);
  if (brace === -1) return null;
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(brace, i + 1);
    }
  }
  return null;
}

/**
 * Strip line comments (slash-slash) and C-style block comments from source
 * text WITHOUT touching characters inside string literals — a char-scan that
 * copies string bodies verbatim (so a `//` inside a quoted scope can never be
 * mistaken for a comment) and drops everything between comment delimiters.
 * Text-only.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    // Inside a string literal: copy through to the matching close quote,
    // honoring backslash escapes. Covers ", ', and ` (template) quotes.
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = src[i];
        out += c;
        i += 1;
        if (c === "\\" && i < n) {
          // Escaped char — copy the next one verbatim, don't end the string.
          out += src[i];
          i += 1;
          continue;
        }
        if (c === quote) break;
      }
      continue;
    }
    // Line comment: skip to (but keep) the newline.
    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    // Block comment: skip to the closing delimiter.
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2; // consume the closing */
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Extract the quoted string entries of a `key: [ ... ]` array within `text`.
 * Comments are stripped FIRST (string-aware) so only real quoted array members
 * are collected — comment prose, `//`-line fragments, and stray apostrophes in
 * comments never leak into the result. Returns null when the array can't be
 * located. Text-only, no execution.
 */
function extractStringArray(text: string, key: string): string[] | null {
  const keyIdx = text.search(new RegExp(`\\b${key}\\s*:\\s*\\[`));
  if (keyIdx === -1) return null;
  const open = text.indexOf("[", keyIdx);
  if (open === -1) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return null;
  // Strip comments before collecting literals — this is the fix for comment
  // prose (e.g. Slack's heavily-annotated scopes array) polluting the output.
  const body = stripComments(text.slice(open + 1, close));
  const out: string[] = [];
  const re = /"([^"]+)"|'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const value = m[1] ?? m[2];
    if (value !== undefined) out.push(value);
  }
  return out;
}

/** Parse a manifest summary from raw source text (no execution). */
export function summarizeManifestText(
  folderId: string,
  text: string,
): ManifestSummary {
  const notes: string[] = [];

  const capBlock = extractCapabilitiesBlock(text);
  if (!capBlock) notes.push("capabilities block not found in text");

  // Scopes — scoped to the `scopes { ... }` block so `required`/`optional`
  // can't collide with same-named keys elsewhere in the manifest.
  const scopesBlock = extractObjectBlock(text, "scopes");
  const scopesRequired = scopesBlock
    ? extractStringArray(scopesBlock, "required")
    : null;
  const scopesOptional = scopesBlock
    ? extractStringArray(scopesBlock, "optional")
    : null;
  if (!scopesBlock) notes.push("scopes block not found in text");

  // authFlow falls back to oauthFlows[*] when the manifest declares no explicit
  // `authFlow` field (e.g. Slack uses `oauthFlows: ["v2"]`), so the connection
  // view never shows a bare `authFlow: null` for a provider that has a flow.
  let authFlow = matchString(text, "authFlow");
  if (authFlow === null) {
    const oauthFlows = extractStringArray(text, "oauthFlows");
    if (oauthFlows && oauthFlows.length > 0) {
      authFlow = oauthFlows.join(", ");
    }
  }

  const healthMatch = text.match(/\bhealthCheckIntervalMs\s*:\s*([^,\n]+)/);
  const healthExpr = healthMatch?.[1] !== undefined ? healthMatch[1].trim() : null;

  return {
    folderId,
    declaredId: matchString(text, "id"),
    displayName: matchString(text, "displayName"),
    isEnabled: matchBool(text, "isEnabled"),
    isExperimental: matchBool(text, "isExperimental"),
    apiVersion: matchString(text, "apiVersion"),
    tokenScope: matchString(text, "tokenScope"),
    authFlow,
    refreshable: matchBool(text, "refreshable"),
    scopesRequired,
    scopesOptional,
    healthCheckIntervalMsExpr: healthExpr,
    capabilities: {
      oauth: capBlock ? matchBool(capBlock, "oauth") : null,
      webhookTrigger: capBlock ? matchBool(capBlock, "webhookTrigger") : null,
      pollingTrigger: capBlock ? matchBool(capBlock, "pollingTrigger") : null,
      actions: capBlock ? matchBool(capBlock, "actions") : null,
    },
    notes,
  };
}

/** Render a summary as compact human-readable text. */
export function renderManifestSummary(s: ManifestSummary): string {
  const cap = s.capabilities;
  const capStr = `oauth=${cap.oauth} webhookTrigger=${cap.webhookTrigger} pollingTrigger=${cap.pollingTrigger} actions=${cap.actions}`;
  const lines = [
    `provider: ${s.folderId}${s.declaredId && s.declaredId !== s.folderId ? ` (declared id: ${s.declaredId})` : ""}`,
    `displayName: ${s.displayName}`,
    `isEnabled: ${s.isEnabled}  isExperimental: ${s.isExperimental}`,
    `apiVersion: ${s.apiVersion}  tokenScope: ${s.tokenScope}  authFlow: ${s.authFlow}`,
    `refreshable: ${s.refreshable}  healthCheckIntervalMs: ${s.healthCheckIntervalMsExpr}`,
    `capabilities: ${capStr}`,
  ];
  if (s.notes.length) lines.push(`notes: ${s.notes.join("; ")}`);
  return lines.join("\n");
}

/**
 * Render a connection-requirements view: what a provider needs to be considered
 * connected & usable in the builder. Distinct from `renderManifestSummary` (the
 * raw capability dump) — this is framed for the "why won't this connect / why
 * is an option source failing for auth reasons" diagnostic.
 *
 * `optionSources` is the list of registered option-source keys backed by this
 * provider (from the generated manifest) — included so the reader sees which
 * builder pickers depend on the connection. Never includes secrets: scope NAMES
 * are public OAuth metadata, not credentials.
 */
export function renderConnectionRequirements(
  s: ManifestSummary,
  optionSources: readonly string[],
): string {
  const reqScopes =
    s.scopesRequired && s.scopesRequired.length
      ? s.scopesRequired.join(", ")
      : s.scopesRequired
        ? "(none declared)"
        : "(could not parse scopes block)";
  const optScopes =
    s.scopesOptional && s.scopesOptional.length
      ? s.scopesOptional.join(", ")
      : "(none)";
  const lines = [
    `connection requirements for provider: ${s.folderId}`,
    `displayName: ${s.displayName}`,
    `isEnabled: ${s.isEnabled}  (a disabled provider cannot be connected)`,
    `authFlow: ${s.authFlow}  tokenScope: ${s.tokenScope}  apiVersion: ${s.apiVersion}`,
    `refreshable: ${s.refreshable}  (false → an expired/revoked token needs a manual reconnect, no silent refresh)`,
    `required scopes: ${reqScopes}`,
    `optional scopes: ${optScopes}`,
    optionSources.length
      ? `builder option-sources requiring this connection: ${optionSources.join(", ")}`
      : "builder option-sources requiring this connection: (none registered)",
    "",
    "To be usable: the provider must be enabled, an active integration row must exist",
    "for the resolving account, and the token must carry the required scopes above.",
    "A scope the token lacks surfaces as PROVIDER_ERROR from option-source resolvers",
    "(the raw provider error code is intentionally hidden from the picker).",
  ];
  if (s.notes.length) lines.push(`notes: ${s.notes.join("; ")}`);
  return lines.join("\n");
}
