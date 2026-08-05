/**
 * SUPABASE-TABLE-TYPING-1A — keeps migrated repositories on the typed client.
 *
 * WHY A GUARD AND NOT JUST tsc
 * ----------------------------
 * `tsc` proves a migrated file COMPILES, but it cannot notice that someone
 * quietly went back to the untyped client: `getServiceRoleClient(...).from("x")`
 * type-checks perfectly, because the untyped client's row generic is `any`.
 * That is exactly how these repositories drifted in the first place. So the
 * guard asserts the *shape of the access*, file by file, for the files that have
 * actually been migrated — a repo-wide ban would be dishonest while ~30
 * repositories are still waiting their turn.
 *
 *   check --manifest <file>
 *
 * Fails closed on: a manifest entry whose file is missing, duplicated, or no
 * longer routes table access through the typed client; a `.from()` on an
 * untyped binding; `as any` / `as unknown as`; a handwritten interface that
 * duplicates a generated table Row; and (as a scope tripwire) a `SupabaseClient`
 * annotation without the `Database` generic.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import ts from "typescript";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DEFAULT_MANIFEST = "scripts/ci/typed-db-manifest.json";

/**
 * Decision-driving jsonb columns. A cast of one of these into a trusted domain
 * type is banned outright — the generated type is `Json`, so the cast asserts
 * structure nothing verified, on values that drive execution, retries and the
 * failure UI.
 *
 * 1C adds the analytics pair. Both are OPAQUE at their repository and validated
 * at exactly one downstream chokepoint (`normalizeDashboardWidgets` for
 * widgets; `NormalizedAnalyticsResultSchema` / `ConnectedAnalyticsResultSchema`
 * for a snapshot result). Listing them here does not make the repositories
 * validate — it stops a repository from QUIETLY ADOPTING a trusted shape and
 * bypassing the chokepoint that does.
 */
const JSON_COLUMN_ACCESSORS = [
  ".trigger_event",
  ".steps",
  ".fatal_error",
  ".error_classification",
  ".run_input",
  ".run_output",
  ".error_detail",
  ".widgets",
  ".result",
  // 1D — the workflow graph, in all three places it is persisted. These are the
  // highest-stakes JSON columns in the schema: `draft_definition` is what the
  // builder edits and the engine walks, a checkpoint `definition` is written
  // BACK over a live workflow by restore, and a template `definition` becomes a
  // new workflow. Each one used to be reached with `?? {nodes:[],edges:[]} as
  // WorkflowDefinition` — an unchecked shape assertion wrapped around a silent
  // empty-graph substitution. All three now go through the authoritative
  // contracts (normalizePersistedWorkflowDefinition / TemplateDefinitionSchema).
  ".draft_definition",
  ".definition",
];

function fail(message) {
  console.error(`TYPED-DB FAIL — ${message}`);
  process.exit(1);
}

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) {
    if (fallback !== undefined) return fallback;
    fail(`missing required argument --${name}`);
  }
  return process.argv[i + 1];
}

function toRepoRelative(absPath, root = ROOT) {
  const normalizedRoot = root.split(sep).join("/").replace(/\/+$/, "");
  const normalized = String(absPath).split(sep).join("/");
  if (!normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) return normalized;
  return normalized.slice(normalizedRoot.length + 1);
}

/** Column names of every generated public table, for duplicate detection. */
export function generatedTableColumns(typesSource, fileName = "database.types.ts") {
  const sf = ts.createSourceFile(fileName, typesSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const member = (typeNode, name) => {
    if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return null;
    for (const m of typeNode.members) {
      if (ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) && m.name.text === name) {
        return m.type ?? null;
      }
    }
    return null;
  };
  let databaseType = null;
  ts.forEachChild(sf, (n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name.text === "Database") databaseType = n.type;
  });
  const tables = member(member(databaseType, "public"), "Tables");
  const out = new Map();
  if (!tables || !ts.isTypeLiteralNode(tables)) return out;
  for (const m of tables.members) {
    if (!ts.isPropertySignature(m) || !m.name || !m.type) continue;
    const table = ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : null;
    if (!table) continue;
    const row = member(m.type, "Row");
    if (!row || !ts.isTypeLiteralNode(row)) continue;
    const cols = new Set();
    for (const rm of row.members) {
      if (ts.isPropertySignature(rm) && rm.name && (ts.isIdentifier(rm.name) || ts.isStringLiteral(rm.name))) {
        cols.add(rm.name.text);
      }
    }
    out.set(table, cols);
  }
  return out;
}

/**
 * Inspect ONE migrated file. Pure apart from the source text; exported so the
 * corruption cases can be proved without touching the real repository.
 */
export function inspectMigratedFile(relPath, source, tableColumns) {
  const violations = [];
  const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Bindings that hold a RAW (untyped) Supabase client, and those that hold a
  // typed one. `.from()` is only allowed on the latter.
  const untyped = new Set();
  const typed = new Set();
  let usesTypedEntryPoint = false;
  // SUPABASE-TABLE-TYPING-1C — bindings / factories typed as a bare loose
  // record. Harmless as a DOMAIN type; fatal as a WRITE PAYLOAD, because an
  // index signature satisfies nothing the generated Insert/Update asserts.
  const looseRecordBindings = new Set();
  const looseRecordFactories = new Set();
  const isLooseRecord = (typeNode) =>
    typeNode !== undefined &&
    /^Record<string,(unknown|any)>$/.test(typeNode.getText(sf).replace(/\s+/g, ""));

  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer) {
        const init = node.initializer.getText(sf);
        if (/\basTypedDb\s*\(/.test(init)) {
          typed.add(node.name.text);
          usesTypedEntryPoint = true;
        } else if (/getServiceRoleClient\s*\(|await\s+createClient\s*\(\)/.test(init)) {
          untyped.add(node.name.text);
        }
      }
      // An explicit `SupabaseClient<Database>` annotation also counts as typed.
      if (node.type && /SupabaseClient\s*<\s*Database\s*>/.test(node.type.getText(sf))) {
        typed.add(node.name.text);
        untyped.delete(node.name.text);
        usesTypedEntryPoint = true;
      }
      if (isLooseRecord(node.type)) looseRecordBindings.add(node.name.text);
    }
    if (ts.isFunctionDeclaration(node) && node.name && isLooseRecord(node.type)) {
      looseRecordFactories.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  /** Report every `as Json`-family assertion inside a write-payload subtree. */
  const flagJsonAssertions = (root) => {
    const walk = (n) => {
      if (ts.isAsExpression(n) && /^Json(\[\])?(\|null)?$/.test(n.type.getText(sf).replace(/\s+/g, ""))) {
        violations.push(
          `${relPath}:${line(n)}: \`as ${n.type.getText(sf).trim()}\` in a write payload asserts JSON-encodability nothing proved — construct the value with toJsonColumn() instead`,
        );
      }
      ts.forEachChild(n, walk);
    };
    walk(root);
  };

  const visit = (node) => {
    // 1. `.from()` must not run on an untyped binding.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "from"
    ) {
      const base = node.expression.expression;
      if (ts.isIdentifier(base) && untyped.has(base.text)) {
        violations.push(
          `${relPath}:${line(node)}: .from() on the UNTYPED client \`${base.text}\` — route table access through asTypedDb()`,
        );
      }
      if (
        ts.isCallExpression(base) &&
        ts.isIdentifier(base.expression) &&
        /^getServiceRoleClient$/.test(base.expression.text)
      ) {
        violations.push(
          `${relPath}:${line(node)}: .from() directly on getServiceRoleClient() — wrap it in asTypedDb()`,
        );
      }
    }

    // 2. Banned escape hatches.
    if (ts.isAsExpression(node)) {
      const text = node.type.getText(sf).trim();
      if (text === "any") {
        violations.push(`${relPath}:${line(node)}: \`as any\` is not allowed in a migrated repository`);
      }
      if (ts.isAsExpression(node.expression) && node.expression.type.getText(sf).trim() === "unknown") {
        violations.push(
          `${relPath}:${line(node)}: \`as unknown as ${text}\` double cast is not allowed in a migrated repository`,
        );
      }
    }
    if (ts.isTypeReferenceNode(node) && node.getText(sf).replace(/\s+/g, "") === "SupabaseClient<any>") {
      violations.push(`${relPath}:${line(node)}: SupabaseClient<any> defeats the typed client`);
    }

    // 2b. SUPABASE-TABLE-TYPING-1B — a decision-driving jsonb column cast
    // straight into a trusted domain type. `trigger_event` is what the engine
    // replays; run input/output/error drive retries and the failure UI. The
    // generated type for all of them is `Json`, which carries no field
    // information, so `row.trigger_event as TriggerEvent` asserts a shape
    // nothing has checked. Validation belongs in
    // core/database/workflowRunColumns.ts.
    if (ts.isAsExpression(node)) {
      const operand = node.expression.getText(sf);
      const target = node.type.getText(sf).replace(/\s+/g, " ").trim();
      const touchesJsonColumn = JSON_COLUMN_ACCESSORS.some((c) => operand.includes(c));
      const trusted = target !== "Json" && target !== "unknown" && !/^Json\b/.test(target);
      if (touchesJsonColumn && trusted) {
        violations.push(
          `${relPath}:${line(node)}: casts a decision-driving JSON column (${operand}) to \`${target}\` — validate it instead (core/database/workflowRunColumns.ts)`,
        );
      }
    }
    // 2c. SUPABASE-TABLE-TYPING-1C — `as Json` inside a WRITE PAYLOAD.
    //
    // Reading a jsonb column and keeping it as `Json` is opaque storage and
    // stays legal (1B). Writing is the other direction and is NOT symmetric: a
    // domain value is not assignable to `Json`, so `value as Json` asserts
    // JSON-encodability that nothing proved — an `undefined`, a BigInt or a
    // circular reference then reaches supabase-js and fails at serialization
    // time instead of at the boundary. core/database/jsonColumn.ts CONSTRUCTS
    // the value, which earns the type. So the ban is scoped to the payload:
    // the argument of an insert/update/upsert, and any object named with
    // `satisfies TableInsert<…>` / `TableUpdate<…>`.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["insert", "update", "upsert"].includes(node.expression.name.text) &&
      node.arguments.length > 0
    ) {
      flagJsonAssertions(node.arguments[0]);
    }
    if (
      ts.isSatisfiesExpression?.(node) &&
      /^Table(Insert|Update)</.test(node.type.getText(sf).replace(/\s+/g, ""))
    ) {
      flagJsonAssertions(node.expression);
    }

    // 2d. SUPABASE-TABLE-TYPING-1C — an insert/update payload built as a bare
    // `Record<string, unknown>`. An index signature is assignable to almost
    // anything, so the generated Insert/Update contract checks NOTHING: a
    // misspelled column, a dropped required field or a wrong-typed value all
    // pass. Name the payload and `satisfies TableInsert<"t">` /
    // `TableUpdate<"t">` instead.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["insert", "update", "upsert"].includes(node.expression.name.text) &&
      node.arguments.length > 0
    ) {
      const payload = node.arguments[0];
      const offender = ts.isIdentifier(payload)
        ? (looseRecordBindings.has(payload.text) ? payload.text : null)
        : ts.isCallExpression(payload) && ts.isIdentifier(payload.expression)
          ? (looseRecordFactories.has(payload.expression.text) ? `${payload.expression.text}()` : null)
          : null;
      if (offender) {
        violations.push(
          `${relPath}:${line(node)}: .${node.expression.name.text}() payload \`${offender}\` is typed Record<string, unknown> — an index signature defeats the generated Insert/Update contract; use \`satisfies TableInsert<"…">\` / \`TableUpdate<"…">\``,
        );
      }
    }

    // The same assertion wearing a `.single<T>()` / `.maybeSingle<T>()` generic.
    // Scoped to TABLE chains: an `.rpc(...).single<RpcRow<"fn">>()` generic is
    // correct and required, because PostgREST function results are not inferred
    // from the Database type the way `.from()` projections are.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "single" || node.expression.name.text === "maybeSingle") &&
      (node.typeArguments?.length ?? 0) > 0
    ) {
      const chain = node.expression.expression.getText(sf);
      if (chain.includes(".from(") && !chain.includes(".rpc(")) {
        violations.push(
          `${relPath}:${line(node)}: .${node.expression.name.text}<...>() overrides the generated inference on a table query — drop the type argument and let the query describe its own shape`,
        );
      }
    }

    // 3. A handwritten interface that duplicates a generated table Row.
    if (ts.isInterfaceDeclaration(node)) {
      const members = node.members
        .filter((m) => ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)))
        .map((m) => m.name.text);
      // Only DB-SHAPED interfaces are candidates. A domain type whose fields
      // happen to be named `id`/`name`/`type` is not a row duplicate, so require
      // a positive signal: a `Row`-suffixed name or a snake_case column.
      const dbShaped =
        /Row$/.test(node.name.text) || members.some((m) => m.includes("_"));
      if (dbShaped && members.length >= 3) {
        for (const [table, cols] of tableColumns) {
          const overlap = members.filter((m) => cols.has(m)).length;
          if (overlap === members.length && overlap >= 3) {
            violations.push(
              `${relPath}:${line(node)}: interface ${node.name.text} duplicates the generated \`${table}\` Row — use TableRow<"${table}"> (or a Pick<> projection)`,
            );
            break;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!usesTypedEntryPoint) {
    violations.push(
      `${relPath}: listed as migrated but never obtains a typed client (no asTypedDb() and no SupabaseClient<Database>)`,
    );
  }
  return violations;
}

function cmdCheck() {
  const manifestPath = resolve(ROOT, arg("manifest", DEFAULT_MANIFEST));
  if (!existsSync(manifestPath)) fail(`manifest missing: ${manifestPath} — absence is never success`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    fail(`manifest is not readable JSON: ${e.message}`);
  }
  const files = manifest.migratedFiles ?? [];
  if (!Array.isArray(files) || files.length === 0) {
    fail("manifest lists no migrated files — refusing to pass a vacuous check");
  }

  const seen = new Set();
  const violations = [];
  for (const rel of files) {
    if (seen.has(rel)) violations.push(`duplicate manifest entry: ${rel}`);
    seen.add(rel);
  }

  const typesPath = resolve(ROOT, "types/database.types.ts");
  if (!existsSync(typesPath)) fail("types/database.types.ts is missing");
  const tableColumns = generatedTableColumns(readFileSync(typesPath, "utf8"), typesPath);
  if (tableColumns.size === 0) fail("parsed zero tables from the generated types");

  for (const rel of seen) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) {
      violations.push(`manifest entry ${rel} does not exist — stale entry`);
      continue;
    }
    violations.push(...inspectMigratedFile(toRepoRelative(abs), readFileSync(abs, "utf8"), tableColumns));
  }

  if (violations.length > 0) {
    for (const v of violations) console.error(`TYPED-DB FAIL — ${v}`);
    process.exit(1);
  }
  console.log("TYPED-DB PASS");
  console.log(`  migrated repositories: ${seen.size}`);
  console.log(`  generated tables:      ${tableColumns.size}`);
  console.log("  every listed file routes table access through the typed client,");
  console.log("  declares no duplicate generated Row, and uses no any/double-cast escape hatch.");
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const command = process.argv[2];
  if (command === "check") cmdCheck();
  else fail(`unknown command: ${command ?? "(none)"} — expected check`);
}
