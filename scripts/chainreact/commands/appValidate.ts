/**
 * Internal ChainReact CLI — `app validate` command (FOUNDATION).
 *
 * Validates the obvious, already-established structural requirements of a
 * provider/app under `integrations/<id>/`, using filesystem + lightweight text
 * checks ONLY. It deliberately does NOT import provider code (mirrors the MCP
 * server's text-parse safety): no app graph is pulled, no schema is executed, no
 * secrets are read. Pure over injected `FsDeps` → fully unit-testable.
 *
 * Checks (foundation):
 *   - provider folder + manifest.ts exist
 *   - manifest declares `id` and it matches the folder name
 *   - manifest declares `displayName` and `isEnabled`
 *   - no orphan action meta (a `*.meta.ts` whose action has no `*.ts` handler) —
 *     mirrors the discovery-meta-coverage "no orphan meta" rule. Matching is by
 *     BASENAME so a dedicated `actions/meta/` subfolder (e.g. hubspot) is fine.
 *   - action units (a `*.schema.ts` + handler) that are missing a `*.meta.ts`
 *
 * `--all` validates every discovered provider and prints a summary; warnings never
 * fail, only ERROR findings do.
 *
 * Designed to extend: future slices add OAuth-scope, field-definition, AI-metadata,
 * builder-visibility, icon, category, and trigger/action depth checks by appending
 * findings — the result shape and renderer already support that.
 */
import {
  collectActionUnits,
  countUnits,
  EMPTY_COUNTS,
  type Finding,
  type FindingLevel,
  hasField,
  listKnownProviders,
  type ProviderCounts,
  scanField,
} from "../providers";
import {
  detectHandlerRegistration,
  detectMetaRegistration,
  detectTriggerMetaRegistration,
  HANDLER_INVENTORY_PATH,
  META_INVENTORY_PATH,
  readMetaRegistryText,
} from "../actionRegistry";
import { registrationStatus } from "../registry";
import type { FsDeps } from "../repo";
import { checkManifestContent, checkMetaContent, loadContractAllowlists } from "./metaChecks";

// Re-export the shared finding types so existing import sites keep working.
export type { Finding, FindingLevel };

/** Per-provider file counts (re-exported from the shared discovery module). */
export type ValidationCounts = ProviderCounts;

export interface ValidationResult {
  readonly provider: string;
  readonly ok: boolean;
  readonly findings: readonly Finding[];
  readonly counts: ValidationCounts;
}

// Re-export so existing import sites keep working.
export { listKnownProviders };

/** Validate one provider/app. Pure over injected deps. */
export function validateProvider(provider: string, fs: FsDeps): ValidationResult {
  const findings: Finding[] = [];
  const id = provider.trim();

  if (!id) {
    return { provider: id, ok: false, findings: [{ level: "error", code: "NO_PROVIDER", message: "Provider id is required: `app validate <provider>`." }], counts: EMPTY_COUNTS };
  }

  const dir = `integrations/${id}`;
  if (!fs.isDirectory(dir)) {
    const known = listKnownProviders(fs);
    return {
      provider: id,
      ok: false,
      findings: [
        {
          level: "error",
          code: "PROVIDER_NOT_FOUND",
          message: `No provider folder at integrations/${id}/. Known providers: ${known.join(", ") || "(none found)"}.`,
        },
      ],
      counts: EMPTY_COUNTS,
    };
  }

  // Value allow-lists (category / tokenScope) parsed from the contract files.
  const allow = loadContractAllowlists(fs);

  // manifest.ts
  const manifestPath = `${dir}/manifest.ts`;
  if (!fs.exists(manifestPath)) {
    findings.push({ level: "error", code: "MANIFEST_MISSING", message: `Missing ${manifestPath}. Every provider must ship a manifest.ts (ProviderManifestSchema).` });
  } else {
    const text = fs.readText(manifestPath);
    const declaredId = scanField(text, "id");
    if (!declaredId) {
      findings.push({ level: "error", code: "MANIFEST_NO_ID", message: `${manifestPath} does not declare an \`id\`. Add \`id: "${id}"\`.` });
    } else if (declaredId !== id) {
      findings.push({ level: "error", code: "MANIFEST_ID_MISMATCH", message: `${manifestPath} declares id "${declaredId}" but the folder is "${id}". They must match.` });
    }
    if (!hasField(text, "displayName")) {
      findings.push({ level: "warning", code: "MANIFEST_NO_DISPLAYNAME", message: `${manifestPath} has no \`displayName\` — add a human-readable name for the Apps page.` });
    }
    if (!hasField(text, "isEnabled")) {
      findings.push({ level: "warning", code: "MANIFEST_NO_ISENABLED", message: `${manifestPath} has no \`isEnabled\` flag — set it explicitly (true/false).` });
    }
    // Deeper manifest completeness + safe value checks (value enums parsed from
    // the contract files — no import, skipped if a contract can't be read).
    findings.push(...checkManifestContent(text, id, { allowedTokenScopes: allow.tokenScopes }));
  }

  // Registry wiring (text-derived). A scaffolded manifest is intentionally inert
  // until wired into integrations/_registry.ts, so "not registered" is a WARNING
  // (a valid intermediate state), never an error. When the registry can't be read
  // (status "unknown") we don't assert anything. Registered providers stay clean.
  if (registrationStatus(fs, id) === "unregistered") {
    findings.push({
      level: "warning",
      code: "MANIFEST_NOT_REGISTERED",
      message: `${dir}/manifest.ts is not registered in integrations/_registry.ts — the provider is inert (won't load in the app) until wired. Run \`chainreact app register ${id}\` (or \`app scaffold ${id} --register\` for a new one).`,
    });
  }

  // Actions follow the established `<name>.ts` + `.meta.ts` + `.schema.ts` triad,
  // matched by BASENAME (metas may live in a dedicated actions/meta/ subfolder).
  // Triggers deliberately do NOT follow the triad (see ProviderCounts.triggerMetas)
  // — the foundation only counts trigger metas and assumes no handler layout.
  const actions = collectActionUnits(fs, `${dir}/actions`);
  const triggers = collectActionUnits(fs, `${dir}/triggers`);

  // Read the action inventories ONCE for this provider's registry checks (text
  // only — never imported). Empty/unreadable → "unknown" downstream, never a
  // false negative.
  const handlerInv = fs.readText(HANDLER_INVENTORY_PATH);
  const metaInv = readMetaRegistryText(fs, id);

  for (const [base, u] of actions) {
    if (u.meta && !u.handler) {
      findings.push({ level: "error", code: "ORPHAN_META", message: `action meta '${base}.meta.ts' has no handler '${base}.ts' (orphan meta). Add the handler or remove the meta.` });
    }
    if (u.schema && !u.handler) {
      findings.push({ level: "warning", code: "ORPHAN_SCHEMA", message: `action schema '${base}.schema.ts' has no handler '${base}.ts'.` });
    }
    // An action unit (handler + schema) missing its discovery meta. Enforced for
    // covered providers by tests/structure/discovery-meta-coverage.test.ts.
    if (u.handler && u.schema && !u.meta) {
      findings.push({ level: "warning", code: "ACTION_META_GAP", message: `Action '${base}.ts' has a schema but no '${base}.meta.ts'. Covered providers require a meta (discovery-meta-coverage).` });
    }
    // Deep ActionMeta completeness + provider/key consistency + value checks.
    if (u.meta && u.metaPath) {
      findings.push(...checkMetaContent(fs.readText(u.metaPath), "action", id, base, { allowedCategories: allow.categories }));
    }

    // Action-registry wiring (text-derived). Only for COMPLETE triads — a
    // freshly-scaffolded action is intentionally unregistered until implemented,
    // so "not registered" is a WARNING, never an error. "unknown" (inventory
    // unreadable) is skipped — we never assert a false negative.
    if (u.handler && u.meta && u.schema) {
      if (detectMetaRegistration(metaInv, id, base) === "unregistered") {
        findings.push({
          level: "warning",
          code: "ACTION_META_NOT_REGISTERED",
          message: `action '${base}' meta is not registered in ${META_INVENTORY_PATH} — it won't appear in the builder/AI until wired. Run \`chainreact app action register ${id} ${base}\` once implemented.`,
        });
      }
      if (detectHandlerRegistration(handlerInv, id, base) === "unregistered") {
        findings.push({
          level: "warning",
          code: "ACTION_HANDLER_NOT_REGISTERED",
          message: `action '${base}' handler is not registered in ${HANDLER_INVENTORY_PATH} — it can't execute until wired. Run \`chainreact app action register ${id} ${base}\` once implemented.`,
        });
      }
    }
  }

  // Trigger metas use a different (folder-based) layout, but the META FILE
  // contract is identical and statically checkable — deep-check each one. A
  // trigger has no handler/schema (runtime self-registers separately); the meta
  // is the unit. Registry wiring is the discovery ALL_TRIGGER_META / barrel
  // <X>_TRIGGER_METAS — unregistered → WARNING (a scaffolded trigger is inert
  // until wired); "unknown" (inventory unreadable) is skipped.
  for (const [base, u] of triggers) {
    if (u.meta && u.metaPath) {
      findings.push(...checkMetaContent(fs.readText(u.metaPath), "trigger", id, base, { allowedCategories: allow.categories }));
      if (detectTriggerMetaRegistration(metaInv, id, base) === "unregistered") {
        findings.push({
          level: "warning",
          code: "TRIGGER_META_NOT_REGISTERED",
          message: `trigger '${base}' meta is not registered in the discovery inventory (ALL_TRIGGER_META / <X>_TRIGGER_METAS) — it won't appear in the builder/AI until wired. Register it manually (see scripts/chainreact/README.md → trigger scaffolding).`,
        });
      }
    }
  }

  const counts: ValidationCounts = {
    actionHandlers: countUnits(actions, "handler"),
    actionMetas: countUnits(actions, "meta"),
    actionSchemas: countUnits(actions, "schema"),
    triggerMetas: countUnits(triggers, "meta"),
  };

  const ok = !findings.some((f) => f.level === "error");
  return { provider: id, ok, findings, counts };
}

/** Render a single provider's validation result. Pure. */
export function renderValidation(result: ValidationResult): string {
  const lines: string[] = [`ChainReact — app validate: ${result.provider}`];
  const errors = result.findings.filter((f) => f.level === "error");
  const warnings = result.findings.filter((f) => f.level === "warning");

  lines.push(
    `  counts: actions=${result.counts.actionHandlers} (meta=${result.counts.actionMetas}, schema=${result.counts.actionSchemas}) triggerMetas=${result.counts.triggerMetas}`,
    "",
  );

  if (result.findings.length === 0) {
    lines.push("PASS — no structural issues detected (foundation checks).");
    return lines.join("\n");
  }

  if (errors.length) {
    lines.push("Errors:");
    for (const f of errors) lines.push(`  [ERROR] ${f.code}: ${f.message}`);
  }
  if (warnings.length) {
    lines.push("Warnings:");
    for (const f of warnings) lines.push(`  [WARN ] ${f.code}: ${f.message}`);
  }
  lines.push("", result.ok ? `PASS with ${warnings.length} warning(s).` : `FAIL — ${errors.length} error(s), ${warnings.length} warning(s).`);
  return lines.join("\n");
}

// ─────────────────────────────── --all (provider-wide) ───────────────────────────────

/** Per-provider verdict for the summary. */
export type ProviderVerdict = "PASS" | "WARN" | "FAIL";

export function verdictOf(result: ValidationResult): ProviderVerdict {
  if (!result.ok) return "FAIL";
  return result.findings.length > 0 ? "WARN" : "PASS";
}

/** Validate every discovered provider (sorted, deterministic). Pure over deps. */
export function validateAllProviders(fs: FsDeps): ValidationResult[] {
  return listKnownProviders(fs).map((id) => validateProvider(id, fs));
}

export interface ValidationSummary {
  readonly total: number;
  readonly pass: number;
  readonly warn: number;
  readonly fail: number;
  /** True only when no provider has an ERROR finding (warnings do not fail). */
  readonly ok: boolean;
}

export function summarizeValidation(results: readonly ValidationResult[]): ValidationSummary {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const r of results) {
    const v = verdictOf(r);
    if (v === "PASS") pass += 1;
    else if (v === "WARN") warn += 1;
    else fail += 1;
  }
  return { total: results.length, pass, warn, fail, ok: fail === 0 };
}

function countOf(result: ValidationResult, level: FindingLevel): number {
  return result.findings.filter((f) => f.level === level).length;
}

/**
 * Render the provider-wide summary. Default output is concise: a header, a
 * one-line status per provider, and the full ERROR findings for any failures
 * (always actionable). `--verbose` additionally prints WARNING findings.
 */
export function renderValidationSummary(
  results: readonly ValidationResult[],
  options: { readonly verbose: boolean } = { verbose: false },
): string {
  const summary = summarizeValidation(results);
  const lines: string[] = [
    "ChainReact — app validate --all",
    `  providers: ${summary.total}  pass: ${summary.pass}  warn: ${summary.warn}  fail: ${summary.fail}`,
    "",
  ];

  if (results.length === 0) {
    lines.push("No providers discovered under integrations/.");
    return lines.join("\n");
  }

  const idWidth = Math.min(28, Math.max(...results.map((r) => r.provider.length)));
  lines.push("Per provider:");
  for (const r of results) {
    const v = verdictOf(r);
    const errs = countOf(r, "error");
    const warns = countOf(r, "warning");
    const suffix = v === "FAIL" ? `  (${errs} error(s), ${warns} warning(s))` : v === "WARN" ? `  (${warns} warning(s))` : "";
    lines.push(
      `  [${v}] ${r.provider.padEnd(idWidth)} actions=${r.counts.actionHandlers} (meta=${r.counts.actionMetas}, schema=${r.counts.actionSchemas}) triggerMetas=${r.counts.triggerMetas}${suffix}`,
    );
  }

  const failures = results.filter((r) => verdictOf(r) === "FAIL");
  if (failures.length > 0) {
    lines.push("", "Failures (errors):");
    for (const r of failures) {
      lines.push(`  ${r.provider}:`);
      for (const f of r.findings.filter((x) => x.level === "error")) lines.push(`    [ERROR] ${f.code}: ${f.message}`);
    }
  }

  if (options.verbose) {
    const withWarnings = results.filter((r) => r.findings.some((f) => f.level === "warning"));
    if (withWarnings.length > 0) {
      lines.push("", "Warnings:");
      for (const r of withWarnings) {
        lines.push(`  ${r.provider}:`);
        for (const f of r.findings.filter((x) => x.level === "warning")) lines.push(`    [WARN ] ${f.code}: ${f.message}`);
      }
    }
  } else if (summary.warn > 0) {
    lines.push("", `${summary.warn} provider(s) have warnings — re-run with --verbose to see them.`);
  }

  lines.push("", summary.ok ? `OK — ${summary.total} provider(s), no errors.` : `FAILED — ${summary.fail} provider(s) have errors.`);
  return lines.join("\n");
}
