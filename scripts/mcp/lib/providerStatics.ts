/**
 * Internal MCP server — provider static-analysis helpers (Phase A-2).
 *
 * SAFE STATIC SOURCES ONLY. These helpers read repo files as TEXT / scan
 * directory listings — they NEVER import or execute provider/app code, never
 * call a provider API, never touch a DB, and never read secrets (the
 * whitelist-first `resolveAllowedPath`/`readAllowedFile` seam refuses env/key/
 * secret/credential filenames). Sources used:
 *   - `integrations/<id>/manifest.ts`           (text-parsed capabilities)
 *   - `integrations/<id>/{actions,triggers}/**.meta.ts` (file-count proxy)
 *   - `integrations/_registry.ts`               (registry membership, imports)
 *   - `services/discovery/providers/<id>.ts`    (builder-metadata coverage flag)
 *   - `scripts/mcp/data/option-source-manifest.json` (registered option sources)
 *   - `integrations/<id>/**.meta.ts` `optionsSource:` (referenced option sources)
 *
 * Anything that cannot be parsed is reported as null / "unknown" — never guessed.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTEGRATIONS_DIR,
  LIMITS,
  MCP_DATA_DIR,
  OPTION_SOURCE_MANIFEST_FILE,
} from "../config";
import { existsAllowed, listFilesUnder, readAllowedFile } from "./files";
import { type ManifestSummary, summarizeManifestText } from "./manifestSummary";
import { resolveAllowedPath } from "../security/paths";

const REGISTRY_FILE = "integrations/_registry.ts";
const DISCOVERY_PROVIDERS_DIR = "services/discovery/providers";

/** Provider ids the option-source manifest may list that have no `integrations/<id>` folder. */
export const NON_MANIFEST_PROVIDERS: readonly string[] = ["native"];

export interface RegisteredOptionSource {
  readonly source: string;
  readonly provider: string;
  readonly requiresIntegration: boolean | null;
  readonly requiredDeps: readonly string[] | null;
}

export interface ProviderCounts {
  readonly provider: string;
  readonly actionMetaCount: number;
  readonly triggerMetaCount: number;
  readonly optionSourceCount: number;
  readonly hasDiscoveryMeta: boolean;
}

export type Severity = "error" | "warning" | "unknown";
export interface ConsistencyFinding {
  readonly severity: Severity;
  readonly message: string;
}

export interface ConsistencyInput {
  /** manifest capabilities.actions (null = not statically parseable). */
  readonly actionsCap: boolean | null;
  readonly webhookCap: boolean | null;
  readonly pollingCap: boolean | null;
  /** false when the manifest could not be read/parsed at all. */
  readonly manifestReadable: boolean;
  readonly actionMetaCount: number;
  readonly triggerMetaCount: number;
  /** true/false in registry; null = registry not readable (skip the check). */
  readonly inRegistry: boolean | null;
}

/**
 * PURE severity decision for one provider's manifest↔files↔registry consistency.
 * Distinguishes error (manifest claims a capability the files contradict),
 * warning (files present the manifest doesn't advertise / not registered), and
 * unknown (capability not statically parseable). Never guesses.
 */
export function classifyProviderConsistency(input: ConsistencyInput): ConsistencyFinding[] {
  const out: ConsistencyFinding[] = [];
  if (!input.manifestReadable) {
    out.push({ severity: "warning", message: "manifest could not be read/parsed" });
    return out;
  }

  // Actions capability vs action meta files.
  if (input.actionsCap === true && input.actionMetaCount === 0) {
    out.push({ severity: "error", message: "manifest declares capabilities.actions=true but no *.meta.ts action files found" });
  } else if (input.actionsCap === false && input.actionMetaCount > 0) {
    out.push({ severity: "warning", message: `${input.actionMetaCount} action *.meta.ts present but capabilities.actions=false` });
  } else if (input.actionsCap === null && input.actionMetaCount > 0) {
    out.push({ severity: "unknown", message: `${input.actionMetaCount} action *.meta.ts present but capabilities.actions not statically parseable` });
  }

  // Trigger capabilities vs trigger meta files.
  const claimsTrigger = input.webhookCap === true || input.pollingCap === true;
  const triggerCapKnown = input.webhookCap !== null || input.pollingCap !== null;
  if (claimsTrigger && input.triggerMetaCount === 0) {
    out.push({ severity: "error", message: "manifest declares a trigger capability but no *.meta.ts trigger files found" });
  } else if (!claimsTrigger && input.triggerMetaCount > 0) {
    out.push(
      triggerCapKnown
        ? { severity: "warning", message: `${input.triggerMetaCount} trigger *.meta.ts present but neither webhookTrigger nor pollingTrigger is true` }
        : { severity: "unknown", message: `${input.triggerMetaCount} trigger *.meta.ts present but trigger capabilities not statically parseable` },
    );
  }

  // Registry membership (null = unknown, skip).
  if (input.inRegistry === false) {
    out.push({ severity: "warning", message: "manifest folder is not imported in integrations/_registry.ts" });
  }
  return out;
}

/** Validate a provider id (folder-name shape). */
export function isValidProviderId(id: string): boolean {
  return /^[a-z][a-z0-9_-]*$/.test(id);
}

/** Provider folder ids under `integrations/` that ship a `manifest.ts`. */
export function listProviderIds(): string[] {
  let dirAbs: string;
  try {
    dirAbs = resolveAllowedPath(INTEGRATIONS_DIR, [INTEGRATIONS_DIR]);
  } catch {
    return [];
  }
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const name of entries) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const childAbs = join(dirAbs, name);
    try {
      if (!statSync(childAbs).isDirectory()) continue;
      statSync(join(childAbs, "manifest.ts"));
      ids.push(name);
    } catch {
      // not a dir, or no manifest — skip.
    }
  }
  return ids.sort();
}

/** Text-parsed manifest summary for one provider, or null if no manifest. */
export function manifestSummaryFor(provider: string): ManifestSummary | null {
  try {
    const { text } = readAllowedFile(
      `${INTEGRATIONS_DIR}/${provider}/manifest.ts`,
      [INTEGRATIONS_DIR],
    );
    return summarizeManifestText(provider, text);
  } catch {
    return null;
  }
}

/** Count `*.meta.ts` files under `integrations/<provider>/<kind>/` (recursive). */
export function countMetaFiles(provider: string, kind: "actions" | "triggers"): number {
  const files = listFilesUnder(
    `${INTEGRATIONS_DIR}/${provider}/${kind}`,
    [".ts"],
    LIMITS.navMaxFiles,
  );
  return files.filter((p) => p.toLowerCase().endsWith(".meta.ts")).length;
}

/** True if the provider has a `services/discovery/providers/<id>.ts` metadata file. */
export function hasDiscoveryMeta(provider: string): boolean {
  return existsAllowed(`${DISCOVERY_PROVIDERS_DIR}/${provider}.ts`, ["services"]);
}

/** Per-provider static counts (actions/triggers/option-sources/discovery-meta). */
export function providerCounts(
  provider: string,
  registered: readonly RegisteredOptionSource[],
): ProviderCounts {
  return {
    provider,
    actionMetaCount: countMetaFiles(provider, "actions"),
    triggerMetaCount: countMetaFiles(provider, "triggers"),
    optionSourceCount: registered.filter((s) => s.provider === provider).length,
    hasDiscoveryMeta: hasDiscoveryMeta(provider),
  };
}

/**
 * Load the committed option-source manifest (registered keys). Returns the
 * parsed sources, or an `error` string when the file is missing/unparseable —
 * callers then report "not statically verifiable" rather than guessing.
 */
export function loadRegisteredOptionSources(): {
  sources: RegisteredOptionSource[];
  error: string | null;
} {
  let raw: string;
  try {
    raw = readAllowedFile(OPTION_SOURCE_MANIFEST_FILE, [MCP_DATA_DIR]).text;
  } catch {
    return { sources: [], error: "option-source manifest not found" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { sources: [], error: "option-source manifest is not valid JSON" };
  }
  const arr =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { sources?: unknown }).sources)
      ? ((parsed as { sources: unknown[] }).sources)
      : null;
  if (!arr) return { sources: [], error: "option-source manifest has no 'sources' array" };

  const sources: RegisteredOptionSource[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.source !== "string" || typeof e.provider !== "string") continue;
    sources.push({
      source: e.source,
      provider: e.provider,
      requiresIntegration: typeof e.requiresIntegration === "boolean" ? e.requiresIntegration : null,
      requiredDeps: Array.isArray(e.requiredDeps)
        ? e.requiredDeps.filter((d): d is string => typeof d === "string")
        : null,
    });
  }
  return { sources, error: null };
}

/**
 * Provider ids imported in `integrations/_registry.ts` via `from "./<id>/manifest"`.
 * Returns null if the registry can't be read (callers skip the cross-registry check).
 */
export function loadRegistryProviderIds(): string[] | null {
  let text: string;
  try {
    text = readAllowedFile(REGISTRY_FILE, [INTEGRATIONS_DIR]).text;
  } catch {
    return null;
  }
  const ids = new Set<string>();
  const re = /from\s+["']\.\/([a-z0-9-]+)\/manifest["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids].sort();
}

/**
 * Scan `*.meta.ts` field metadata under the given providers for
 * `optionsSource: "<key>"` references. Returns key → set of referencing files.
 * Matches ONLY the `optionsSource:` property (the resolver definitions use
 * `source:` and are not counted as references). Text-only; reads no app code.
 */
export function referencedOptionSources(providerIds: readonly string[]): Map<string, Set<string>> {
  const refs = new Map<string, Set<string>>();
  let filesRead = 0;
  const re = /optionsSource\s*:\s*["']([^"']+)["']/g;

  for (const provider of providerIds) {
    if (filesRead >= LIMITS.navMaxFiles) break;
    const metaFiles = listFilesUnder(
      `${INTEGRATIONS_DIR}/${provider}`,
      [".ts"],
      LIMITS.navMaxFiles,
    ).filter((p) => p.toLowerCase().endsWith(".meta.ts"));

    for (const rel of metaFiles) {
      if (filesRead >= LIMITS.navMaxFiles) break;
      filesRead += 1;
      let text: string;
      try {
        text = readAllowedFile(rel, [INTEGRATIONS_DIR]).text;
      } catch {
        continue;
      }
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const key = m[1];
        if (!key) continue;
        if (!refs.has(key)) refs.set(key, new Set());
        refs.get(key)!.add(rel);
      }
    }
  }
  return refs;
}
