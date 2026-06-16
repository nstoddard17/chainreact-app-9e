/**
 * Internal MCP server — provider metadata tools.
 *
 *   list_provider_manifests             → provider folders that contain a manifest.ts
 *   get_provider_manifest_summary       → text-parsed capability summary for one provider
 *   provider_capability_matrix          → capability row per provider (Phase A-2)
 *   provider_action_trigger_counts      → action/trigger/option-source counts (Phase A-2)
 *   provider_metadata_consistency_check → manifest↔files↔registry consistency (Phase A-2)
 *   option_source_coverage_check        → referenced vs registered option sources (Phase A-2)
 *
 * Manifests are read as TEXT and never imported/executed (see manifestSummary.ts).
 * All Phase A-2 tools are repo-static: they scan files / parse text / read the
 * committed option-source JSON — no provider code execution, no API, no DB, no
 * secrets. Anything not statically parseable is reported as null / "unknown".
 */
import { INTEGRATIONS_DIR } from "../config";
import { readAllowedFile } from "../lib/files";
import {
  renderManifestSummary,
  summarizeManifestText,
} from "../lib/manifestSummary";
import {
  classifyProviderConsistency,
  type ConsistencyFinding,
  countMetaFiles,
  isValidProviderId,
  listProviderIds,
  loadRegisteredOptionSources,
  loadRegistryProviderIds,
  manifestSummaryFor,
  NON_MANIFEST_PROVIDERS,
  providerCounts,
  referencedOptionSources,
} from "../lib/providerStatics";
import type { ToolDefinition } from "../registry";

/**
 * Resolve the provider id set a tool should operate on. Returns either the
 * single requested provider (validated + must have a manifest) or all providers.
 * Returns an `error` string for an invalid/unknown single provider.
 */
function resolveProviderScope(args: Record<string, unknown>): {
  ids: string[];
  error: string | null;
} {
  const raw = typeof args.provider === "string" ? args.provider.trim() : "";
  if (!raw) return { ids: listProviderIds(), error: null };
  if (!isValidProviderId(raw)) return { ids: [], error: `invalid provider id '${raw}'.` };
  if (!listProviderIds().includes(raw)) {
    return { ids: [], error: `no manifest found for provider '${raw}'. Use list_provider_manifests.` };
  }
  return { ids: [raw], error: null };
}

function listProviderManifests(): string {
  const ids = listProviderIds();
  if (!ids.length) return "No provider manifests found.";
  return `Provider manifests (${ids.length}):\n${ids.map((id) => `- ${id}`).join("\n")}`;
}

function getProviderManifestSummary(args: Record<string, unknown>): string {
  const raw = typeof args.provider === "string" ? args.provider.trim() : "";
  if (!raw) return "Error: 'provider' is required (e.g. 'slack').";
  if (!/^[a-z][a-z0-9_-]*$/.test(raw)) {
    return `Error: invalid provider id '${raw}'.`;
  }
  const rel = `${INTEGRATIONS_DIR}/${raw}/manifest.ts`;
  let text: string;
  try {
    text = readAllowedFile(rel, [INTEGRATIONS_DIR]).text;
  } catch {
    return `Error: no manifest found for provider '${raw}'. Use list_provider_manifests.`;
  }
  const summary = summarizeManifestText(raw, text);
  return renderManifestSummary(summary);
}

function providerCapabilityMatrix(args: Record<string, unknown>): string {
  const { ids, error } = resolveProviderScope(args);
  if (error) return `Error: ${error}`;
  if (!ids.length) return "No provider manifests found.";

  const rows = ids.map((id) => {
    const s = manifestSummaryFor(id);
    if (!s) return `- ${id}: (manifest unreadable)`;
    const c = s.capabilities;
    return [
      `- ${id}`,
      `    isEnabled=${s.isEnabled}  actions=${c.actions}  webhookTrigger=${c.webhookTrigger}  pollingTrigger=${c.pollingTrigger}`,
      `    authFlow=${s.authFlow}  refreshable=${s.refreshable}  apiVersion=${s.apiVersion}`,
      s.notes.length ? `    notes: ${s.notes.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `Provider capability matrix (${ids.length}) — manifest text-parsed; null = not statically parseable:`,
    ...rows,
  ].join("\n");
}

function providerActionTriggerCounts(args: Record<string, unknown>): string {
  const { ids, error } = resolveProviderScope(args);
  if (error) return `Error: ${error}`;
  if (!ids.length) return "No provider manifests found.";

  const { sources } = loadRegisteredOptionSources();
  const rows = ids.map((id) => {
    const c = providerCounts(id, sources);
    return `- ${id}: actions=${c.actionMetaCount} triggers=${c.triggerMetaCount} optionSources=${c.optionSourceCount} discoveryMeta=${c.hasDiscoveryMeta ? "present" : "absent"}`;
  });
  return [
    `Action/trigger counts (${ids.length}) — actions/triggers are *.meta.ts file counts (static proxy for the registered set); optionSources from the committed manifest; discoveryMeta = services/discovery/providers/<id>.ts present:`,
    ...rows,
  ].join("\n");
}

function consistencyFindingsFor(
  id: string,
  registryIds: readonly string[] | null,
): ConsistencyFinding[] {
  const s = manifestSummaryFor(id);
  return classifyProviderConsistency({
    manifestReadable: s !== null,
    actionsCap: s ? s.capabilities.actions : null,
    webhookCap: s ? s.capabilities.webhookTrigger : null,
    pollingCap: s ? s.capabilities.pollingTrigger : null,
    actionMetaCount: countMetaFiles(id, "actions"),
    triggerMetaCount: countMetaFiles(id, "triggers"),
    inRegistry: registryIds ? registryIds.includes(id) : null,
  });
}

function providerMetadataConsistencyCheck(args: Record<string, unknown>): string {
  const { ids, error } = resolveProviderScope(args);
  if (error) return `Error: ${error}`;
  if (!ids.length) return "No provider manifests found.";

  const folderIds = listProviderIds();
  const registryIds = loadRegistryProviderIds();
  const { sources, error: srcErr } = loadRegisteredOptionSources();

  const blocks: string[] = [];
  let errors = 0;
  let warnings = 0;
  let unknowns = 0;

  for (const id of ids) {
    const findings = consistencyFindingsFor(id, registryIds);
    for (const f of findings) {
      if (f.severity === "error") errors += 1;
      else if (f.severity === "warning") warnings += 1;
      else unknowns += 1;
    }
    blocks.push(
      findings.length
        ? `- ${id}:\n${findings.map((f) => `    [${f.severity.toUpperCase()}] ${f.message}`).join("\n")}`
        : `- ${id}: OK`,
    );
  }

  // Cross-registry checks (only meaningful when scanning all providers).
  const globalLines: string[] = [];
  if (ids.length > 1) {
    if (registryIds) {
      for (const rid of registryIds) {
        if (!folderIds.includes(rid)) {
          globalLines.push(`    [ERROR] '${rid}' imported in integrations/_registry.ts but no integrations/${rid}/manifest.ts folder`);
          errors += 1;
        }
      }
    } else {
      globalLines.push("    [UNKNOWN] integrations/_registry.ts not readable — skipped registry cross-check");
      unknowns += 1;
    }
    if (srcErr) {
      globalLines.push(`    [UNKNOWN] option-source manifest: ${srcErr}`);
      unknowns += 1;
    } else {
      const optionProviders = [...new Set(sources.map((s) => s.provider))];
      for (const op of optionProviders) {
        if (!folderIds.includes(op) && !NON_MANIFEST_PROVIDERS.includes(op)) {
          globalLines.push(`    [WARNING] option-source manifest references provider '${op}' with no integrations/${op} manifest folder`);
          warnings += 1;
        }
      }
    }
  }

  const crossRegistry =
    ids.length > 1
      ? ["", "Cross-registry:", ...(globalLines.length ? globalLines : ["    (no cross-registry issues)"])]
      : [];

  return [
    `Provider metadata consistency (${ids.length} provider(s)) — errors=${errors} warnings=${warnings} unknown=${unknowns}:`,
    ...blocks,
    ...crossRegistry,
  ].join("\n");
}

function optionSourceCoverageCheck(args: Record<string, unknown>): string {
  const single = typeof args.provider === "string" ? args.provider.trim() : "";
  if (single && !isValidProviderId(single)) return `Error: invalid provider id '${single}'.`;

  const { sources, error: srcErr } = loadRegisteredOptionSources();
  if (srcErr) return `Not statically verifiable: ${srcErr}.`;

  const scopeIds = single ? [single] : listProviderIds();
  const refs = referencedOptionSources(scopeIds);

  const registeredKeys = new Set(
    sources.filter((s) => (single ? s.provider === single : true)).map((s) => s.source),
  );
  const referencedKeys = new Set(
    [...refs.keys()].filter((k) => (single ? k.startsWith(`${single}:`) : true)),
  );

  const missing = [...referencedKeys].filter((k) => !registeredKeys.has(k)).sort();
  const unused = [...registeredKeys].filter((k) => !referencedKeys.has(k)).sort();

  const lines: string[] = [
    `Option-source coverage${single ? ` for '${single}'` : ""} — referenced(${referencedKeys.size}) vs registered(${registeredKeys.size}):`,
  ];

  lines.push("", `MISSING registrations (referenced by a field's optionsSource but NOT registered) — ${missing.length}:`);
  if (missing.length) {
    for (const k of missing.slice(0, 50)) {
      const files = [...(refs.get(k) ?? [])].slice(0, 3);
      lines.push(`  [ERROR] ${k}  ← ${files.join(", ")}`);
    }
  } else {
    lines.push("  (none — every referenced option source is registered)");
  }

  lines.push("", `UNUSED registrations (registered but no *.meta.ts optionsSource reference found) — ${unused.length}:`);
  if (unused.length) {
    for (const k of unused.slice(0, 50)) lines.push(`  [WARNING] ${k}`);
    lines.push("  note: 'unused' means no `optionsSource:` reference in *.meta.ts — it may still be referenced dynamically or outside meta files; not definitively dead.");
  } else {
    lines.push("  (none)");
  }

  return lines.join("\n");
}

export const providerTools: ToolDefinition[] = [
  {
    name: "list_provider_manifests",
    description:
      "List provider integration ids under integrations/ that ship a manifest.ts. Read-only; folder scan only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: listProviderManifests,
  },
  {
    name: "get_provider_manifest_summary",
    description:
      "Return a capability summary (isEnabled, apiVersion, tokenScope, authFlow, capabilities, refreshable) for one provider. The manifest is TEXT-PARSED, never executed.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "Provider folder id, e.g. 'slack', 'gmail'.",
        },
      },
      required: ["provider"],
      additionalProperties: false,
    },
    handler: getProviderManifestSummary,
  },
  {
    name: "provider_capability_matrix",
    description:
      "Capability row per provider (or one): isEnabled, actions/webhookTrigger/pollingTrigger, authFlow, refreshable, apiVersion. Manifest TEXT-PARSED; null = not statically parseable. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Optional provider id to scope to (e.g. 'slack')." },
      },
      additionalProperties: false,
    },
    handler: providerCapabilityMatrix,
  },
  {
    name: "provider_action_trigger_counts",
    description:
      "Per-provider counts: action *.meta.ts, trigger *.meta.ts, registered option-sources, and whether a discovery-metadata file exists. Static file counts (proxy for the registered set). Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Optional provider id to scope to." },
      },
      additionalProperties: false,
    },
    handler: providerActionTriggerCounts,
  },
  {
    name: "provider_metadata_consistency_check",
    description:
      "Cross-check manifest capability flags vs *.meta.ts action/trigger files and registry membership; reports findings as ERROR / WARNING / UNKNOWN (never guesses). Static. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Optional provider id to scope to." },
      },
      additionalProperties: false,
    },
    handler: providerMetadataConsistencyCheck,
  },
  {
    name: "option_source_coverage_check",
    description:
      "Compare option-source keys referenced by field metadata (`optionsSource:` in *.meta.ts) against the registered option-source manifest. Reports MISSING (referenced, unregistered → ERROR) and UNUSED (registered, no meta reference → WARNING). Static. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Optional provider id to scope to." },
      },
      additionalProperties: false,
    },
    handler: optionSourceCoverageCheck,
  },
];
