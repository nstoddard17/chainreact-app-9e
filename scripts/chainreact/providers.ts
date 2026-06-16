/**
 * Internal ChainReact CLI — shared provider discovery + metadata parsing.
 *
 * Filesystem/text-only primitives reused by every `app *` command (validate,
 * list, and future audit/scaffold). It NEVER imports provider runtime code: the
 * manifest is regex/text-scanned (never executed), file presence is counted, and
 * no app graph, schema, or secret is touched (mirrors the MCP server's text-parse
 * safety). Pure over the injected `FsDeps` → deterministic + unit-testable.
 */
import type { FsDeps } from "./repo";

/** Severity of a validation finding. Shared so check modules avoid a cycle. */
export type FindingLevel = "error" | "warning";

export interface Finding {
  readonly level: FindingLevel;
  readonly code: string;
  readonly message: string;
}

/** Which of the action triad files exist for one action basename. */
export interface ActionUnit {
  handler: boolean;
  meta: boolean;
  schema: boolean;
  /** Repo-relative path of the `*.meta.ts` file (when `meta` is true). */
  metaPath?: string;
}

const isHelperBase = (base: string): boolean => base.startsWith("_") || base === "index";

/**
 * Collect action units keyed by file BASENAME across the actions/ tree.
 *
 * Metas may sit next to the handler (slack: `sendMessage.ts` + `sendMessage.meta.ts`)
 * OR in a dedicated subfolder (hubspot: `updateDeal.ts` + `meta/updateDeal.meta.ts`),
 * so handler/meta/schema are matched by BASENAME, not by directory. Helper files
 * (`_`-prefixed) and barrels (`index.ts`) are ignored — they are not action units.
 *
 * Trade-off (foundation heuristic): two distinct actions in different subfolders
 * that share a basename would be merged. Rare in practice; deeper registry-aware
 * matching is a future slice (and is already enforced by the discovery-meta test).
 */
export function collectActionUnits(fs: FsDeps, dir: string): Map<string, ActionUnit> {
  const out = new Map<string, ActionUnit>();
  if (!fs.isDirectory(dir)) return out;

  const ensure = (base: string): ActionUnit | null => {
    if (isHelperBase(base)) return null;
    const cur = out.get(base) ?? { handler: false, meta: false, schema: false };
    out.set(base, cur);
    return cur;
  };

  const walk = (d: string): void => {
    for (const name of fs.listDir(d)) {
      const rel = `${d}/${name}`;
      if (fs.isDirectory(rel)) {
        walk(rel);
        continue;
      }
      if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
      const leaf = name.split("/").pop() ?? name;
      if (leaf.endsWith(".meta.ts")) {
        const u = ensure(leaf.slice(0, -".meta.ts".length));
        if (u) {
          u.meta = true;
          u.metaPath = rel; // keep the path so deeper checks can read the file
        }
      } else if (leaf.endsWith(".schema.ts")) {
        const u = ensure(leaf.slice(0, -".schema.ts".length));
        if (u) u.schema = true;
      } else {
        const u = ensure(leaf.slice(0, -".ts".length));
        if (u) u.handler = true;
      }
    }
  };
  walk(dir);
  return out;
}

/** Count units where the given triad key is present. */
export function countUnits(units: Map<string, ActionUnit>, key: keyof ActionUnit): number {
  let n = 0;
  for (const u of units.values()) if (u[key]) n += 1;
  return n;
}

/**
 * List provider ids that ship a manifest, sorted (deterministic). A provider is a
 * directory under integrations/ with a manifest.ts.
 */
export function listKnownProviders(fs: FsDeps): string[] {
  return fs
    .listDir("integrations")
    .filter((id) => fs.isDirectory(`integrations/${id}`) && fs.exists(`integrations/${id}/manifest.ts`))
    .sort();
}

/** First `field: "value"` string literal from manifest text (regex, never executed). */
export function scanField(manifestText: string, field: string): string | null {
  const m = manifestText.match(new RegExp(`\\b${field}\\s*:\\s*["']([^"']+)["']`));
  return m ? (m[1] ?? null) : null;
}

/** True if the manifest text declares `field:` at all (any value/type). */
export function hasField(manifestText: string, field: string): boolean {
  return new RegExp(`\\b${field}\\s*:`).test(manifestText);
}

/** Parse a boolean `field: true|false` from manifest text. null if absent/non-literal. */
export function scanBoolField(manifestText: string, field: string): boolean | null {
  const m = manifestText.match(new RegExp(`\\b${field}\\s*:\\s*(true|false)\\b`));
  if (!m) return null;
  return m[1] === "true";
}

/** Per-provider file counts (action triad + trigger metas). */
export interface ProviderCounts {
  readonly actionHandlers: number;
  readonly actionMetas: number;
  readonly actionSchemas: number;
  /**
   * Trigger *.meta.ts count only. Triggers deliberately do NOT follow the action
   * `<name>.ts`+`.meta.ts`+`.schema.ts` triad (e.g. slack triggers are a folder
   * with `<name>.meta.ts` + `filter.ts` and no sibling handler), so we report
   * trigger metas as a signal and assume no handler layout.
   */
  readonly triggerMetas: number;
}

export const EMPTY_COUNTS: ProviderCounts = {
  actionHandlers: 0,
  actionMetas: 0,
  actionSchemas: 0,
  triggerMetas: 0,
};

/** Compute the file counts for a provider directory. */
export function providerCounts(fs: FsDeps, providerDir: string): ProviderCounts {
  const actions = collectActionUnits(fs, `${providerDir}/actions`);
  const triggers = collectActionUnits(fs, `${providerDir}/triggers`);
  return {
    actionHandlers: countUnits(actions, "handler"),
    actionMetas: countUnits(actions, "meta"),
    actionSchemas: countUnits(actions, "schema"),
    triggerMetas: countUnits(triggers, "meta"),
  };
}

/** A safe, text-derived inventory row for one provider. */
export interface ProviderInfo {
  readonly id: string;
  readonly displayName: string | null;
  readonly enabled: boolean | null;
  readonly counts: ProviderCounts;
}

/** Build a ProviderInfo for one provider id (text/file inspection only). */
export function inventoryProvider(id: string, fs: FsDeps): ProviderInfo {
  const manifestPath = `integrations/${id}/manifest.ts`;
  const text = fs.exists(manifestPath) ? fs.readText(manifestPath) : "";
  return {
    id,
    displayName: scanField(text, "displayName"),
    enabled: scanBoolField(text, "isEnabled"),
    counts: providerCounts(fs, `integrations/${id}`),
  };
}

/** Inventory every discovered provider, sorted by id (deterministic). */
export function inventoryAllProviders(fs: FsDeps): ProviderInfo[] {
  return listKnownProviders(fs).map((id) => inventoryProvider(id, fs));
}
