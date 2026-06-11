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

/** Parse a manifest summary from raw source text (no execution). */
export function summarizeManifestText(
  folderId: string,
  text: string,
): ManifestSummary {
  const notes: string[] = [];

  const capBlock = extractCapabilitiesBlock(text);
  if (!capBlock) notes.push("capabilities block not found in text");

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
    authFlow: matchString(text, "authFlow"),
    refreshable: matchBool(text, "refreshable"),
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
