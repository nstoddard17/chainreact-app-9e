import type { CompiledProvider, CompiledAction } from "./types";
import { camelCase, pascalCase } from "./emit";

/**
 * Registration plan (CS-5A) — prints the EXACT hand-maintained inventory
 * fragments a compiled MCP provider needs, so wiring a certified provider is
 * copy/paste instead of hand-derivation. It NEVER edits registries: explicit
 * hand-maintained inventories remain the source of truth (CLAUDE.md rule 14),
 * and this only tells the operator what to paste and where.
 *
 * Pure + deterministic (a jest guard can diff it). No auto-discovery, no
 * auto-approval — only `decision: "ship"` actions reach `CompiledProvider`, so
 * only shipped actions ever appear here.
 */

export interface RegistrationFragment {
  /** Destination file, repo-relative. */
  readonly destination: string;
  /** `create` = a whole new file to add; `append` = lines to add to an existing file. */
  readonly action: "create" | "append";
  readonly description: string;
  /** Paste-ready source. */
  readonly content: string;
}

export interface RegistrationPlan {
  readonly provider: string;
  readonly actionKeys: readonly string[];
  readonly fragments: readonly RegistrationFragment[];
  /** Distinct `optionsSource` ids the metas reference (need resolver registration). */
  readonly resolverSources: readonly string[];
}

function upperSnake(provider: string): string {
  return provider.toUpperCase().replace(/-/g, "_");
}
function camelProvider(provider: string): string {
  return camelCase(provider.replace(/-/g, "_"));
}
function metaExport(provider: string): string {
  return `${upperSnake(provider)}_ACTION_METAS`;
}
function metaImportName(type: string): string {
  return `${camelCase(type)}Meta`;
}
function handlerAlias(provider: string, type: string): string {
  return `${camelProvider(provider)}${pascalCase(type)}`;
}
function handlerExport(type: string): string {
  return camelCase(type);
}

/** Distinct optionsSource ids across a meta's fields + sub-fields (stable order). */
function optionsSourcesOf(action: CompiledAction): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (fields: readonly { optionsSource?: string; itemFields?: readonly unknown[] }[]) => {
    for (const f of fields) {
      if (typeof f.optionsSource === "string" && !seen.has(f.optionsSource)) {
        seen.add(f.optionsSource);
        out.push(f.optionsSource);
      }
      if (Array.isArray(f.itemFields)) {
        visit(f.itemFields as { optionsSource?: string; itemFields?: readonly unknown[] }[]);
      }
    }
  };
  visit(action.meta.fields as { optionsSource?: string; itemFields?: readonly unknown[] }[]);
  return out;
}

// ─── Fragment builders ───────────────────────────────────────────────────────

function metaSubRegistryFragment(compiled: CompiledProvider): RegistrationFragment {
  const p = compiled.provider;
  const imports = compiled.actions
    .map((a) => `import { ${metaImportName(a.type)} } from "@/integrations/${p}/actions/${camelCase(a.type)}.meta";`)
    .join("\n");
  const arrayBody = compiled.actions.map((a) => `  ${metaImportName(a.type)},`).join("\n");
  const content =
    `import type { ActionMeta } from "@/contracts/actionMeta";\n\n` +
    `/**\n * ${pascalCase(camelProvider(p))} discovery sub-registry (generated MCP catalog app).\n` +
    ` * META-ONLY: imports .meta.ts, never handlers, so the meta registry's import\n` +
    ` * graph never pulls executor/repository code. Central _metaInventory spreads\n` +
    ` * ${metaExport(p)}.\n */\n` +
    `${imports}\n\n` +
    `export const ${metaExport(p)}: ReadonlyArray<ActionMeta> = [\n${arrayBody}\n];\n`;
  return {
    destination: `services/discovery/providers/${p}.ts`,
    action: "create",
    description: "Create the meta-only discovery sub-registry.",
    content,
  };
}

function metaInventoryFragment(compiled: CompiledProvider): RegistrationFragment {
  const p = compiled.provider;
  const content =
    `// 1) add the import beside the other provider sub-registries:\n` +
    `import { ${metaExport(p)} } from "./providers/${p}";\n\n` +
    `// 2) spread into the ALL_ACTION_META array:\n` +
    `  ...${metaExport(p)},`;
  return {
    destination: "services/discovery/_metaInventory.ts",
    action: "append",
    description: "Import + spread the provider's action metas.",
    content,
  };
}

function handlerInventoryFragment(compiled: CompiledProvider): RegistrationFragment {
  const p = compiled.provider;
  const imports = compiled.actions
    .map((a) => `import { ${handlerExport(a.type)} as ${handlerAlias(p, a.type)} } from "@/integrations/${p}/actions/${camelCase(a.type)}";`)
    .join("\n");
  const entries = compiled.actions
    .map((a) => `  { provider: "${p}", type: "${a.type}", handler: ${handlerAlias(p, a.type)} },`)
    .join("\n");
  const content =
    `// 1) add the handler imports:\n${imports}\n\n` +
    `// 2) add the entries to the ALL_HANDLERS array:\n${entries}`;
  return {
    destination: "services/execution/handlers/_handlerInventory.ts",
    action: "append",
    description: "Import + register the typed handlers.",
    content,
  };
}

function optionsFragment(compiled: CompiledProvider, resolverSources: readonly string[]): RegistrationFragment {
  if (resolverSources.length === 0) {
    return {
      destination: "services/options/_registry.ts",
      action: "append",
      description: "Options resolvers — none (no field declares optionsSource).",
      content: "none — no field in this provider's metas declares `optionsSource`.",
    };
  }
  const lines = resolverSources
    .map(
      (source) =>
        `// ${source}: implement integrations/${compiled.provider}/options/<resource>.ts, then\n` +
        `//   import { <resolverExport> } from "@/integrations/${compiled.provider}/options/<resource>";\n` +
        `//   ...and add <resolverExport> to ALL_OPTIONS_RESOLVERS.`,
    )
    .join("\n");
  return {
    destination: "services/options/_registry.ts",
    action: "append",
    description: `Register ${resolverSources.length} option resolver(s): ${resolverSources.join(", ")}.`,
    content: lines,
  };
}

/** Build the deterministic registration plan for a compiled provider. */
export function buildRegistrationPlan(compiled: CompiledProvider): RegistrationPlan {
  // Defensive duplicate-key validation (compiler already rejects dup types; this
  // guards the registration surface too).
  const metaKeys = new Set<string>();
  const handlerKeys = new Set<string>();
  for (const a of compiled.actions) {
    if (metaKeys.has(a.meta.key)) {
      throw new Error(`registration plan: duplicate meta key '${a.meta.key}'.`);
    }
    metaKeys.add(a.meta.key);
    const hk = `${compiled.provider}:${a.type}`;
    if (handlerKeys.has(hk)) {
      throw new Error(`registration plan: duplicate handler key '${hk}'.`);
    }
    handlerKeys.add(hk);
  }

  const resolverSources = [...new Set(compiled.actions.flatMap(optionsSourcesOf))].sort();

  return {
    provider: compiled.provider,
    actionKeys: compiled.actions.map((a) => a.meta.key),
    fragments: [
      metaSubRegistryFragment(compiled),
      metaInventoryFragment(compiled),
      handlerInventoryFragment(compiled),
      optionsFragment(compiled, resolverSources),
    ],
    resolverSources,
  };
}

/** Render the plan as a human copy/paste report. Deterministic. */
export function renderRegistrationPlan(plan: RegistrationPlan): string {
  const lines: string[] = [];
  lines.push(`Registration plan for ${plan.provider}`);
  lines.push(`actions (${plan.actionKeys.length}): ${plan.actionKeys.join(", ")}`);
  lines.push("");
  for (const f of plan.fragments) {
    lines.push(`── ${f.destination}  [${f.action}]`);
    lines.push(`   ${f.description}`);
    lines.push("");
    lines.push(f.content);
    lines.push("");
  }
  lines.push("These are fragments to paste — this command does NOT edit any registry.");
  return lines.join("\n");
}
