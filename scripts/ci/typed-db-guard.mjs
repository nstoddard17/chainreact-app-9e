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

  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer.getText(sf);
      if (/\basTypedDb\s*\(/.test(init)) {
        typed.add(node.name.text);
        usesTypedEntryPoint = true;
      } else if (/getServiceRoleClient\s*\(|await\s+createClient\s*\(\)/.test(init)) {
        untyped.add(node.name.text);
      }
      // An explicit `SupabaseClient<Database>` annotation also counts as typed.
      if (node.type && /SupabaseClient\s*<\s*Database\s*>/.test(node.type.getText(sf))) {
        typed.add(node.name.text);
        untyped.delete(node.name.text);
        usesTypedEntryPoint = true;
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

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
