/**
 * Internal ChainReact CLI — deeper read-only metadata checks (text/regex only).
 *
 * These extend `app validate` from "the triad files exist" to "the metadata each
 * file declares is structurally complete, value-valid, and consistent with the
 * contracts in `contracts/actionMeta.ts`, `contracts/triggerMeta.ts`, and
 * `contracts/integration.ts`". They NEVER import provider code — each file is read
 * as text.
 *
 * Conservatism (avoid false positives):
 *   - Only UNAMBIGUOUS top-level keys are presence-checked. Keys that also appear
 *     inside `fields[]` / `outputs[]` sub-objects (`type`, `description`, `name`,
 *     `label`) are NOT presence-checked — a text scan cannot tell a top-level
 *     `type:` from a field's `type:`.
 *   - VALUE checks scan COMMENT-STRIPPED text. Provider JSDoc routinely mentions
 *     keys (e.g. ``healthCheckIntervalMs: 12h``) which would otherwise be read as
 *     the code value. `stripCommentLines` drops whole comment lines first.
 *   - The category / tokenScope allow-lists are PARSED FROM THE CONTRACT FILES at
 *     runtime (no import, no hardcoded list that could drift). If a contract can't
 *     be parsed, the value check is skipped (documented), never guessed.
 *   - A file with no `: ActionMeta` / `: TriggerMeta` marker is not statically
 *     analyzable; we WARN and skip rather than emit false errors.
 *
 * ERROR vs WARNING:
 *   - ERROR = a contract violation Zod rejects at discovery-registry load — the app
 *     build fails AND the action/trigger is invisible/broken in the builder + AI
 *     (missing required key, wrong provider/key, category/tokenScope value outside
 *     its enum).
 *   - WARNING = a CLI-analysis limitation or suspicious-but-unproven drift (a value
 *     we can't prove is a static literal, a `fields:`/`scopes:` that isn't an
 *     obvious array/object literal). Text can't prove these are wrong, so they
 *     don't fail the run.
 */
import { type Finding, scanField } from "../providers";
import type { FsDeps } from "../repo";

/** UNAMBIGUOUS top-level keys (never present inside field/output sub-objects). */
export const REQUIRED_ACTION_META_KEYS: readonly string[] = ["provider", "displayName", "category", "requiresIntegration", "fields"];
export const REQUIRED_TRIGGER_META_KEYS: readonly string[] = ["provider", "displayName", "category", "activation", "requiresIntegration", "fields"];
/** Manifest keys beyond id/displayName/isEnabled (those are checked elsewhere). */
export const REQUIRED_MANIFEST_KEYS: readonly string[] = ["tokenScope", "scopes", "capabilities", "healthCheckIntervalMs"];

/** True if the text declares a top-level `<key>:` (word-boundary, not a substring). */
export function hasTopLevelKey(text: string, key: string): boolean {
  return new RegExp(`\\b${key}\\s*:`).test(text);
}

/**
 * Drop whole comment lines (JSDoc `*`, `//`, `/*` openers) so VALUE scans never
 * pick up a key mentioned in prose. Deliberately line-granular: a trailing `//`
 * after code on the same line is left alone (it sits after the value we read).
 */
export function stripCommentLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !(t.startsWith("*") || t.startsWith("//") || t.startsWith("/*"));
    })
    .join("\n");
}

/** Parse a `z.enum([...])` literal list for a named schema const (text only). */
export function parseZodEnum(contractText: string, schemaConst: string): string[] | null {
  const m = contractText.match(new RegExp(`${schemaConst}\\s*=\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]`));
  if (!m || m[1] === undefined) return null;
  const values = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1] as string);
  return values.length > 0 ? values : null;
}

/** Allow-lists parsed from the contract files (null when a file can't be parsed). */
export interface ContractAllowlists {
  readonly categories: ReadonlySet<string> | null;
  readonly tokenScopes: ReadonlySet<string> | null;
}

/** Load the category + tokenScope allow-lists by reading the contract files. */
export function loadContractAllowlists(fs: FsDeps): ContractAllowlists {
  const cats = parseZodEnum(fs.readText("contracts/actionMeta.ts"), "ActionCategorySchema");
  const scopes = parseZodEnum(fs.readText("contracts/integration.ts"), "TokenScopeSchema");
  return {
    categories: cats ? new Set(cats) : null,
    tokenScopes: scopes ? new Set(scopes) : null,
  };
}

export type MetaKind = "action" | "trigger";

const MARKER: Record<MetaKind, string> = { action: "ActionMeta", trigger: "TriggerMeta" };
const REQUIRED: Record<MetaKind, readonly string[]> = { action: REQUIRED_ACTION_META_KEYS, trigger: REQUIRED_TRIGGER_META_KEYS };
const CODE_PREFIX: Record<MetaKind, string> = { action: "ACTION", trigger: "TRIGGER" };
/** Triggers emit `payloadShape`; actions emit `outputs`. Both are array literals. */
const ARRAY_KEY: Record<MetaKind, string> = { action: "outputs", trigger: "payloadShape" };

export interface MetaCheckOptions {
  /** Allowed category values (from the contract). When omitted, category value isn't checked. */
  readonly allowedCategories?: ReadonlySet<string> | null;
}

/**
 * Deep-check one meta file's text against its contract. `label` is the action/
 * trigger basename for messages; `providerId` is the owning provider folder.
 */
export function checkMetaContent(text: string, kind: MetaKind, providerId: string, label: string, opts: MetaCheckOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const prefix = CODE_PREFIX[kind];

  if (!text.includes(MARKER[kind])) {
    findings.push({
      level: "warning",
      code: `${prefix}_META_NOT_ANALYZABLE`,
      message: `${kind} meta '${label}' does not declare a \`: ${MARKER[kind]}\` literal — deeper checks skipped (build-time Zod still validates it).`,
    });
    return findings;
  }

  // ── required-key presence (raw text) ──
  for (const key of REQUIRED[kind]) {
    if (!hasTopLevelKey(text, key)) {
      findings.push({ level: "error", code: `${prefix}_META_INCOMPLETE`, message: `${kind} meta '${label}' is missing required \`${key}\`. The ${MARKER[kind]} contract requires it.` });
    }
  }

  // ── identity consistency (raw text — provider/key only appear in code) ──
  const declaredProvider = scanField(text, "provider");
  if (declaredProvider !== null && declaredProvider !== providerId) {
    findings.push({ level: "error", code: `${prefix}_META_PROVIDER_MISMATCH`, message: `${kind} meta '${label}' declares provider "${declaredProvider}" but lives under integrations/${providerId}/.` });
  }
  const declaredKey = scanField(text, "key");
  if (declaredKey !== null && !declaredKey.startsWith(`${providerId}:`)) {
    findings.push({ level: "error", code: `${prefix}_META_KEY_MISMATCH`, message: `${kind} meta '${label}' key "${declaredKey}" must be "${providerId}:<type>" (key === provider:type).` });
  }

  // ── VALUE checks (comment-stripped) ──
  const code = stripCommentLines(text);

  // category value ∈ enum (ERROR) / dynamic (WARNING)
  if (opts.allowedCategories) {
    const cat = scanField(code, "category");
    if (cat === null) {
      if (hasTopLevelKey(code, "category")) {
        findings.push({ level: "warning", code: `${prefix}_META_CATEGORY_NOT_LITERAL`, message: `${kind} meta '${label}' has a non-literal \`category\` — cannot validate its value statically.` });
      }
    } else if (!opts.allowedCategories.has(cat)) {
      findings.push({ level: "error", code: `${prefix}_META_CATEGORY_INVALID`, message: `${kind} meta '${label}' category "${cat}" is not a valid ActionCategory.` });
    }
  }

  // requiresIntegration is a boolean literal (WARNING if not true/false)
  const ri = code.match(/\brequiresIntegration\s*:\s*([A-Za-z0-9_]+)/);
  if (ri && ri[1] !== "true" && ri[1] !== "false") {
    findings.push({ level: "warning", code: `${prefix}_META_REQUIRES_INTEGRATION_NOT_BOOLEAN`, message: `${kind} meta '${label}' \`requiresIntegration\` is not a true/false literal ("${ri[1]}") — cannot statically verify it is boolean.` });
  }

  // fields is an array literal (WARNING if no `fields: [` exists anywhere)
  if (hasTopLevelKey(code, "fields") && !/\bfields\s*:\s*\[/.test(code)) {
    findings.push({ level: "warning", code: `${prefix}_META_FIELDS_NOT_ARRAY`, message: `${kind} meta '${label}' \`fields\` does not appear to be an array literal — cannot statically verify its shape.` });
  }

  // outputs / payloadShape is an array literal WHEN present (WARNING)
  const arrKey = ARRAY_KEY[kind];
  if (hasTopLevelKey(code, arrKey) && !new RegExp(`\\b${arrKey}\\s*:\\s*\\[`).test(code)) {
    findings.push({ level: "warning", code: `${prefix}_META_${arrKey === "outputs" ? "OUTPUTS" : "PAYLOAD"}_NOT_ARRAY`, message: `${kind} meta '${label}' \`${arrKey}\` is present but not an array literal — cannot statically verify its shape.` });
  }

  return findings;
}

export interface ManifestCheckOptions {
  /** Allowed tokenScope values (from the contract). When omitted, the value isn't checked. */
  readonly allowedTokenScopes?: ReadonlySet<string> | null;
}

/** Deep-check a manifest's text for required fields + safe value shapes. */
export function checkManifestContent(text: string, providerId: string, opts: ManifestCheckOptions = {}): Finding[] {
  const findings: Finding[] = [];
  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (!hasTopLevelKey(text, key)) {
      findings.push({ level: "error", code: "MANIFEST_FIELD_MISSING", message: `integrations/${providerId}/manifest.ts is missing required \`${key}\`. The ProviderManifest contract requires it.` });
    }
  }

  const code = stripCommentLines(text);

  // tokenScope value ∈ enum (ERROR) / dynamic (WARNING)
  if (opts.allowedTokenScopes && hasTopLevelKey(code, "tokenScope")) {
    const ts = scanField(code, "tokenScope");
    if (ts === null) {
      findings.push({ level: "warning", code: "MANIFEST_TOKENSCOPE_NOT_LITERAL", message: `integrations/${providerId}/manifest.ts has a non-literal \`tokenScope\` — cannot validate its value statically.` });
    } else if (!opts.allowedTokenScopes.has(ts)) {
      findings.push({ level: "error", code: "MANIFEST_TOKENSCOPE_INVALID", message: `integrations/${providerId}/manifest.ts tokenScope "${ts}" is not a valid TokenScope (user/workspace).` });
    }
  }

  // scopes / capabilities are object literals (WARNING if not)
  if (hasTopLevelKey(code, "scopes") && !/\bscopes\s*:\s*\{/.test(code)) {
    findings.push({ level: "warning", code: "MANIFEST_SCOPES_NOT_OBJECT", message: `integrations/${providerId}/manifest.ts \`scopes\` is not an object literal — cannot statically verify required/optional/deprecated.` });
  }
  if (hasTopLevelKey(code, "capabilities") && !/\bcapabilities\s*:\s*\{/.test(code)) {
    findings.push({ level: "warning", code: "MANIFEST_CAPABILITIES_NOT_OBJECT", message: `integrations/${providerId}/manifest.ts \`capabilities\` is not an object literal — cannot statically verify the capability flags.` });
  }

  return findings;
}
