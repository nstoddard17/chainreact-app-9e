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
  hasField,
  listKnownProviders,
  type ProviderCounts,
  scanField,
} from "../providers";
import type { FsDeps } from "../repo";

export type FindingLevel = "error" | "warning";

export interface Finding {
  readonly level: FindingLevel;
  readonly code: string;
  readonly message: string;
}

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
  }

  // Actions follow the established `<name>.ts` + `.meta.ts` + `.schema.ts` triad,
  // matched by BASENAME (metas may live in a dedicated actions/meta/ subfolder).
  // Triggers deliberately do NOT follow the triad (see ProviderCounts.triggerMetas)
  // — the foundation only counts trigger metas and assumes no handler layout.
  const actions = collectActionUnits(fs, `${dir}/actions`);
  const triggers = collectActionUnits(fs, `${dir}/triggers`);

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
