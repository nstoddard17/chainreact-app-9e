import type {
  CompiledAction,
  CompiledFieldIr,
  CompiledObjectMemberIr,
  CompiledProvider,
} from "./types";

/**
 * Source emitters (CS-2): compiled provider → ordinary V2 provider source.
 *
 * Generated files carry a two-line provenance header (regenerate, don't
 * hand-edit) and otherwise read like hand-written provider code: plain typed
 * literals for `.meta.ts`, `.strict()` zod for `.schema.ts`, thin typed
 * handlers delegating to the shared executor seam. Determinism matters — a
 * jest guard regenerates from the committed snapshot+catalog and diffs
 * against the committed artifacts, so emitters must be pure functions of
 * their inputs (no timestamps, no randomness).
 */

export interface EmittedFile {
  /** Path relative to `integrations/<provider>/`. */
  readonly path: string;
  readonly content: string;
}

// ─── Name helpers ────────────────────────────────────────────────────────────

/** "create_issue" → "createIssue". */
export function camelCase(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** "create_issue" → "CreateIssue". */
export function pascalCase(snake: string): string {
  const c = camelCase(snake);
  return c[0]!.toUpperCase() + c.slice(1);
}

function header(provider: string): string {
  return (
    `// Generated from integrations/${provider}/mcp-catalog.ts + mcp-snapshot.json` +
    ` (npm run mcp:import -- generate ${provider}).\n` +
    `// Curate the catalog and regenerate rather than hand-editing this file.\n`
  );
}

// ─── TS literal serialization ────────────────────────────────────────────────

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** JSON-safe data → readable TypeScript literal (2-space indent). */
export function tsLiteral(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
      return String(value);
    case "object":
      break;
    default:
      throw new Error(`tsLiteral: unsupported value type '${typeof value}'.`);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${padIn}${tsLiteral(v, indent + 1)},`);
    return `[\n${items.join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (entries.length === 0) return "{}";
  const body = entries.map(([k, v]) => {
    const key = IDENT_RE.test(k) ? k : JSON.stringify(k);
    return `${padIn}${key}: ${tsLiteral(v, indent + 1)},`;
  });
  return `{\n${body.join("\n")}\n${pad}}`;
}

// ─── Zod schema emission ─────────────────────────────────────────────────────

function zodForMember(m: CompiledObjectMemberIr): string {
  let expr: string;
  switch (m.kind.k) {
    case "string":
      expr = "z.string()";
      break;
    case "enum":
      expr = `z.enum([${m.kind.values.map((v) => JSON.stringify(v)).join(", ")}])`;
      break;
    case "number":
      expr = m.kind.integer ? "z.number().int()" : "z.number()";
      break;
    case "boolean":
      expr = "z.boolean()";
      break;
  }
  return m.required ? expr : `${expr}.optional()`;
}

function zodMembersObject(members: readonly CompiledObjectMemberIr[], indent: number): string {
  const padIn = "  ".repeat(indent + 1);
  const body = members
    .map((m) => `${padIn}${IDENT_RE.test(m.name) ? m.name : JSON.stringify(m.name)}: ${zodForMember(m)},`)
    .join("\n");
  return `z\n${padIn}.object({\n${body}\n${padIn}})\n${padIn}.strict()`;
}

function zodForField(f: CompiledFieldIr): string {
  let expr: string;
  switch (f.kind.k) {
    case "string":
      expr = "z.string().min(1)";
      break;
    case "enum":
      expr = `z.enum([${f.kind.values.map((v) => JSON.stringify(v)).join(", ")}])`;
      break;
    case "enum-array":
      expr = `z.array(z.enum([${f.kind.values.map((v) => JSON.stringify(v)).join(", ")}])).min(1)`;
      break;
    case "number": {
      expr = f.kind.integer ? "z.number().int()" : "z.number()";
      if (f.kind.min !== undefined) expr += `.min(${f.kind.min})`;
      if (f.kind.max !== undefined) expr += `.max(${f.kind.max})`;
      break;
    }
    case "boolean":
      expr = "z.boolean()";
      break;
    case "date":
      // Stored as "YYYY-MM-DD" (the `date` field renderer's contract).
      expr = "z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)";
      break;
    case "datetime":
      // Stored as a UTC instant string (the `datetime-utc` renderer's contract).
      expr = "z.string().min(1)";
      break;
    case "string-array":
      expr = "z.array(z.string().min(1)).min(1)";
      if (f.kind.maxItems !== undefined) expr += `.max(${f.kind.maxItems})`;
      break;
    case "object":
      expr = zodMembersObject(f.kind.members, 1);
      break;
    case "object-list":
      expr = `z.array(${zodMembersObject(f.kind.members, 2)}).min(1)`;
      if (f.kind.maxItems !== undefined) expr += `.max(${f.kind.maxItems})`;
      break;
  }
  return f.required ? expr : `${expr}.optional()`;
}

export function emitSchemaSource(provider: string, action: CompiledAction): string {
  const name = `${pascalCase(action.type)}ConfigSchema`;
  const lines = action.fields.map((f) => {
    const key = IDENT_RE.test(f.name) ? f.name : JSON.stringify(f.name);
    return `    ${key}: ${zodForField(f)},`;
  });
  return (
    header(provider) +
    `import { z } from "zod";\n\n` +
    `/** Config schema for \`${provider}:${action.type}\` — mirrors ${camelCase(action.type)}.meta.ts. */\n` +
    `export const ${name} = z\n  .object({\n${lines.join("\n")}\n  })\n  .strict();\n\n` +
    `export type ${pascalCase(action.type)}Config = z.infer<typeof ${name}>;\n`
  );
}

// ─── Meta emission ───────────────────────────────────────────────────────────

export function emitMetaSource(provider: string, action: CompiledAction): string {
  const exportName = `${camelCase(action.type)}Meta`;
  return (
    header(provider) +
    `import type { ActionMeta } from "@/contracts/actionMeta";\n\n` +
    `/** Builder-facing metadata for \`${action.meta.key}\`. */\n` +
    `export const ${exportName}: ActionMeta = ${tsLiteral(action.meta)};\n`
  );
}

// ─── Handler emission ────────────────────────────────────────────────────────

function outputSpecLiteral(action: CompiledAction): string {
  const outputs = action.meta.outputs;
  if (outputs.length === 1 && outputs[0]!.name === "text" && outputs[0]!.type === "string") {
    return `{ kind: "text" }`;
  }
  const fields = outputs.map((o) => ({ name: o.name, type: o.type }));
  return tsLiteral({ kind: "structured", fields }, 1);
}

/** camelCase provider id for the `_pinned.ts` export symbol. */
function pinnedExportName(provider: string): string {
  return `${camelCase(provider.replace(/-/g, "_"))}PinnedToolSchemas`;
}

export function emitHandlerSource(compiled: CompiledProvider, action: CompiledAction): string {
  const fn = camelCase(action.type);
  const schemaName = `${pascalCase(action.type)}ConfigSchema`;
  const pinnedName = pinnedExportName(compiled.provider);
  // Reads are safe to auto-retry on a transient failure; writes are not (a
  // retried write could duplicate). Derived from the certified risk class so
  // the executor's retry-safety switch matches the catalog decision.
  const idempotent = action.capability.risk.classification === "read";
  return (
    header(compiled.provider) +
    `import type { ActionHandler } from "@/services/execution/handlers/types";\n` +
    `import { executeMcpTool } from "@/integrations/_shared/mcp/executeTool";\n` +
    `import { ${schemaName} } from "./${fn}.schema";\n` +
    `import { ${pinnedName} } from "./_pinned";\n\n` +
    `/**\n` +
    ` * \`${action.meta.key}\` — ${action.meta.displayName}.\n` +
    ` * Validates the pre-resolved config against the strict schema, then calls\n` +
    ` * the provider through the shared executor with the certification-pinned\n` +
    ` * tool schema (drift is classified; breaking change fails closed) and the\n` +
    ` * bounded output spec.\n` +
    ` */\n` +
    `const pinned = ${pinnedName}["${action.tool}"]!;\n\n` +
    `export const ${fn}: ActionHandler = async (input) => {\n` +
    `  const config = ${schemaName}.parse(input.config);\n` +
    `  return executeMcpTool({\n` +
    `    provider: "${compiled.provider}",\n` +
    `    serverUrl: "${compiled.serverUrl}",\n` +
    `    tool: "${action.tool}",\n` +
    `    accountId: input.accountId,\n` +
    `    args: config,\n` +
    `    pinnedSchema: pinned.inputSchema,\n` +
    `    pinnedSchemaHash: pinned.schemaHash,\n` +
    `    output: ${outputSpecLiteral(action)},\n` +
    `    idempotent: ${idempotent},\n` +
    `  });\n` +
    `};\n`
  );
}

/**
 * Emit `actions/_pinned.ts` — the certified inputSchema + hash for every tool a
 * shipped action uses, deduped by tool name. The runtime executor reads these
 * to CLASSIFY drift (breaking vs safe-addition), not just compare hashes.
 */
export function emitPinnedSchemas(compiled: CompiledProvider): string {
  const byTool = new Map<string, CompiledAction>();
  for (const a of compiled.actions) {
    if (!byTool.has(a.tool)) byTool.set(a.tool, a);
  }
  const entries = [...byTool.values()]
    .map((a) => {
      const key = JSON.stringify(a.tool);
      const value = tsLiteral({ schemaHash: a.schemaHash, inputSchema: a.inputSchema }, 1);
      return `  ${key}: ${value},`;
    })
    .join("\n");
  const name = pinnedExportName(compiled.provider);
  return (
    header(compiled.provider) +
    `\n/**\n` +
    ` * Certification-pinned tool inputSchemas (by tool name). The runtime\n` +
    ` * executor compares the live \`tools/list\` schema against these to classify\n` +
    ` * drift; a breaking change fails closed, a safe addition runs + flags review.\n` +
    ` */\n` +
    `export const ${name}: Record<string, { schemaHash: string; inputSchema: Record<string, unknown> }> = {\n${entries}\n};\n`
  );
}

// ─── Registration fragment + capability report ──────────────────────────────

function emitGeneratedIndex(compiled: CompiledProvider): string {
  const metaImports = compiled.actions
    .map((a) => `import { ${camelCase(a.type)}Meta } from "./${camelCase(a.type)}.meta";`)
    .join("\n");
  const handlerImports = compiled.actions
    .map((a) => `import { ${camelCase(a.type)} } from "./${camelCase(a.type)}";`)
    .join("\n");
  const metas = compiled.actions.map((a) => `  ${camelCase(a.type)}Meta,`).join("\n");
  const handlers = compiled.actions
    .map(
      (a) =>
        `  { provider: "${compiled.provider}", type: "${a.type}", handler: ${camelCase(a.type)} },`,
    )
    .join("\n");
  const p = pascalCase(compiled.provider.replace(/-/g, "_"));
  return (
    header(compiled.provider) +
    `// Registration fragments: spread these into services/discovery/_metaInventory.ts\n` +
    `// and services/execution/handlers/_handlerInventory.ts when this provider's\n` +
    `// actions REGISTER (executor slice). Until then the action files are orphans\n` +
    `// by design (CLAUDE.md rule 14 — registry presence defines the action set).\n` +
    `${metaImports}\n${handlerImports}\n\n` +
    `export const ${camelCase(compiled.provider.replace(/-/g, "_"))}GeneratedActionMetas = [\n${metas}\n] as const;\n\n` +
    `export const ${camelCase(compiled.provider.replace(/-/g, "_"))}Generated${p.endsWith("s") ? "" : ""}Handlers = [\n${handlers}\n] as const;\n`
  );
}

export function emitProviderArtifacts(compiled: CompiledProvider): EmittedFile[] {
  const files: EmittedFile[] = [];
  for (const action of compiled.actions) {
    const base = `actions/${camelCase(action.type)}`;
    files.push({ path: `${base}.schema.ts`, content: emitSchemaSource(compiled.provider, action) });
    files.push({ path: `${base}.meta.ts`, content: emitMetaSource(compiled.provider, action) });
    files.push({ path: `${base}.ts`, content: emitHandlerSource(compiled, action) });
  }
  files.push({ path: "actions/_pinned.ts", content: emitPinnedSchemas(compiled) });
  files.push({ path: "actions/_generated.ts", content: emitGeneratedIndex(compiled) });
  files.push({
    path: "mcp-capabilities.json",
    content: JSON.stringify(compiled.capabilityReport, null, 2) + "\n",
  });
  return files;
}
