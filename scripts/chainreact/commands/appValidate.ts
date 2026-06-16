/**
 * Internal ChainReact CLI — `app validate <provider>` command (FOUNDATION).
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
 *   - no orphan action/trigger meta (a `*.meta.ts` without its `*.ts` handler) —
 *     mirrors the discovery-meta-coverage "no orphan meta" rule
 *   - action units (a `*.schema.ts` + handler) that are missing a `*.meta.ts`
 *
 * Designed to extend: future slices add OAuth-scope, field-definition, AI-metadata,
 * builder-visibility, icon, category, and trigger/action depth checks by appending
 * findings — the result shape and renderer already support that.
 */
import type { FsDeps } from "../repo";

export type FindingLevel = "error" | "warning";

export interface Finding {
  readonly level: FindingLevel;
  readonly code: string;
  readonly message: string;
}

export interface ValidationCounts {
  readonly actionHandlers: number;
  readonly actionMetas: number;
  readonly actionSchemas: number;
  /**
   * Trigger *.meta.ts count only. Triggers deliberately do NOT follow the action
   * `<name>.ts`+`.meta.ts`+`.schema.ts` triad (e.g. slack triggers are a folder
   * with `<name>.meta.ts` + `filter.ts` and no sibling handler), so the foundation
   * validator reports trigger metas as a signal but does not assume a handler
   * layout. Deeper trigger validation is a future slice.
   */
  readonly triggerMetas: number;
}

export interface ValidationResult {
  readonly provider: string;
  readonly ok: boolean;
  readonly findings: readonly Finding[];
  readonly counts: ValidationCounts;
}

interface Stem {
  handler: boolean;
  meta: boolean;
  schema: boolean;
}

/** Recursively map stem-relpath → which of {handler,meta,schema} files exist. */
function collectStems(fs: FsDeps, dir: string): Map<string, Stem> {
  const out = new Map<string, Stem>();
  if (!fs.isDirectory(dir)) return out;

  const mark = (stem: string, key: keyof Stem): void => {
    const cur = out.get(stem) ?? { handler: false, meta: false, schema: false };
    cur[key] = true;
    out.set(stem, cur);
  };

  const walk = (d: string): void => {
    for (const name of fs.listDir(d)) {
      const rel = `${d}/${name}`;
      if (fs.isDirectory(rel)) {
        walk(rel);
        continue;
      }
      if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
      if (name.endsWith(".meta.ts")) mark(rel.slice(0, -".meta.ts".length), "meta");
      else if (name.endsWith(".schema.ts")) mark(rel.slice(0, -".schema.ts".length), "schema");
      else mark(rel.slice(0, -".ts".length), "handler");
    }
  };
  walk(dir);
  return out;
}

/** List provider ids that ship a manifest (for an actionable "unknown provider"). */
export function listKnownProviders(fs: FsDeps): string[] {
  return fs
    .listDir("integrations")
    .filter((id) => fs.isDirectory(`integrations/${id}`) && fs.exists(`integrations/${id}/manifest.ts`))
    .sort();
}

function scanField(manifestText: string, field: string): string | null {
  const m = manifestText.match(new RegExp(`\\b${field}\\s*:\\s*["']([^"']+)["']`));
  return m ? (m[1] ?? null) : null;
}

function hasField(manifestText: string, field: string): boolean {
  return new RegExp(`\\b${field}\\s*:`).test(manifestText);
}

const EMPTY_COUNTS: ValidationCounts = {
  actionHandlers: 0,
  actionMetas: 0,
  actionSchemas: 0,
  triggerMetas: 0,
};

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

  // Actions follow the established `<name>.ts` + `.meta.ts` + `.schema.ts` triad.
  // Triggers deliberately do NOT (see ValidationCounts.triggerMetas) — the
  // foundation only counts trigger metas and does not assume a handler layout.
  const actions = collectStems(fs, `${dir}/actions`);
  const triggers = collectStems(fs, `${dir}/triggers`);

  for (const [stem, s] of actions) {
    if (s.meta && !s.handler) {
      findings.push({ level: "error", code: "ORPHAN_META", message: `action meta ${stem}.meta.ts has no handler ${stem}.ts (orphan meta). Add the handler or remove the meta.` });
    }
    if (s.schema && !s.handler) {
      findings.push({ level: "warning", code: "ORPHAN_SCHEMA", message: `action schema ${stem}.schema.ts has no handler ${stem}.ts.` });
    }
    // An action unit (handler + schema) missing its discovery meta. Enforced for
    // covered providers by tests/structure/discovery-meta-coverage.test.ts.
    if (s.handler && s.schema && !s.meta) {
      findings.push({ level: "warning", code: "ACTION_META_GAP", message: `Action ${stem}.ts has a schema but no ${stem}.meta.ts. Covered providers require a meta (discovery-meta-coverage).` });
    }
  }

  const countKey = (stems: Map<string, Stem>, key: keyof Stem): number => {
    let n = 0;
    for (const s of stems.values()) if (s[key]) n += 1;
    return n;
  };
  const counts: ValidationCounts = {
    actionHandlers: countKey(actions, "handler"),
    actionMetas: countKey(actions, "meta"),
    actionSchemas: countKey(actions, "schema"),
    triggerMetas: countKey(triggers, "meta"),
  };

  const ok = !findings.some((f) => f.level === "error");
  return { provider: id, ok, findings, counts };
}

/** Render the validation result. Pure. */
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
