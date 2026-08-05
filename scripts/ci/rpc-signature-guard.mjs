/**
 * RPC-SIGNATURE-DRIFT-GUARD-1 — the guard against Postgres RPC signatures
 * drifting away from their TypeScript callers.
 *
 * WHY THIS EXISTS
 * ---------------
 * Migration 20260808000000 added `p_ai_credits_limit` to apply_business_upgrade
 * / apply_business_downgrade and DROPPED the old overloads. The repository
 * callers were updated; the integration tests were not. Nothing caught it,
 * because:
 *   - `types/database.types.ts` is generated and drift-checked, but NOTHING in
 *     the repository imported it — every Supabase client was untyped, so
 *     `.rpc(name, args)` accepted any string and any object;
 *   - `db:types:check` proves schema → types, never types → callers.
 * The stale tests therefore compiled, ran, and asserted only PostgREST's
 * "could not find the function" response instead of atomicity or idempotency.
 *
 * THE THREE SOURCES, AND WHO IS AUTHORITATIVE
 * -------------------------------------------
 *   1. The migrated LOCAL database (pg_proc) — AUTHORITATIVE. Read from the
 *      catalog, never by parsing migration SQL text.
 *   2. types/database.types.ts — the generated bridge callers type against.
 *      Compared to (1): names, argument names, required/optional, and mapped
 *      argument types must agree.
 *   3. TypeScript `.rpc()` call sites — extracted with the TypeScript AST (not
 *      a regex), compared to (1).
 *
 * WHAT EACH LAYER CATCHES
 * -----------------------
 *   tsc (`satisfies RpcArgs<"fn">` at call sites) → argument VALUE types.
 *   this guard                                   → function existence, argument
 *      names, required-argument omissions, stale/removed arguments, overload
 *      ambiguity, removed functions, and generated-types-vs-database drift.
 *
 * Subcommands:
 *   inventory --out <file>          catalog → deterministic JSON
 *   callers   --out <file>          TS AST scan → deterministic JSON
 *   check --inventory <f> --callers <f> --types <f> [--dynamic <f>]
 *   run --out-dir <dir>             inventory + callers + check (what db-ci runs)
 *
 * LOOPBACK ONLY: the inventory is read through `docker exec` against the local
 * ephemeral Supabase database container. There is no connection string, no
 * hosted project, and no credential anywhere in this script.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import ts from "typescript";

const ROOT = resolve(import.meta.dirname, "..", "..");

/** Directories scanned for `.rpc()` call sites. Nothing is excluded — an
 *  unscanned directory would be exactly the silent skip this guard forbids. */
export const SCAN_DIRS = [
  "repositories",
  "services",
  "app",
  "core",
  "workflow-engine",
  "lib",
  "utils",
  "tests",
  "scripts",
];

const DEFAULT_TYPES = "types/database.types.ts";
const DEFAULT_DYNAMIC = "scripts/ci/rpc-dynamic-callers.json";

/**
 * Postgres type -> the TypeScript type Supabase's generator emits. Used ONLY to
 * compare the generated types against the catalog. An unmapped type is reported
 * as explicitly unchecked, never silently ignored.
 */
const PG_TO_TS = {
  uuid: "string",
  text: "string",
  "character varying": "string",
  citext: "string",
  "timestamp with time zone": "string",
  "timestamp without time zone": "string",
  date: "string",
  "time with time zone": "string",
  "time without time zone": "string",
  integer: "number",
  bigint: "number",
  smallint: "number",
  numeric: "number",
  "double precision": "number",
  real: "number",
  boolean: "boolean",
  json: "Json",
  jsonb: "Json",
};

export function pgTypeToTs(pgType) {
  if (typeof pgType !== "string") return null;
  if (pgType.endsWith("[]")) {
    const base = pgTypeToTs(pgType.slice(0, -2));
    return base ? `${base}[]` : null;
  }
  return PG_TO_TS[pgType] ?? null;
}

function fail(message) {
  console.error(`RPC-GUARD FAIL — ${message}`);
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

export function toRepoRelative(absPath, root = ROOT) {
  const normalizedRoot = root.split(sep).join("/").replace(/\/+$/, "");
  const normalized = String(absPath).split(sep).join("/");
  if (!normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) return normalized;
  return normalized.slice(normalizedRoot.length + 1);
}

/* ───────────────────────── Layer 2: catalog inventory ───────────────────── */

const INVENTORY_SQL = `
WITH fns AS (
  SELECT p.oid, n.nspname AS schema, p.proname AS name,
         p.pronargs, p.pronargdefaults, p.prosecdef,
         pg_get_function_identity_arguments(p.oid) AS identity_args,
         pg_get_function_result(p.oid) AS returns,
         COALESCE(p.proallargtypes::oid[], p.proargtypes::oid[]) AS all_types,
         p.proargnames, p.proargmodes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_function_result(p.oid) <> 'trigger'
),
expanded AS (
  SELECT f.oid, x.ord,
         COALESCE(f.proargnames[x.ord], '') AS argname,
         format_type(x.t, NULL) AS argtype,
         COALESCE(f.proargmodes[x.ord], 'i') AS argmode
  FROM fns f, unnest(f.all_types) WITH ORDINALITY AS x(t, ord)
),
inputs AS (
  SELECT oid, ord, argname, argtype,
         row_number() OVER (PARTITION BY oid ORDER BY ord) AS in_pos
  FROM expanded WHERE argmode IN ('i','b','v')
)
SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.name, r."identityArgs"), '[]'::json)
FROM (
  SELECT f.schema, f.name,
         f.identity_args AS "identityArgs",
         f.returns,
         f.prosecdef AS "securityDefiner",
         f.pronargs AS "nArgs",
         f.pronargdefaults AS "nDefaults",
         (SELECT count(*) FROM fns f2 WHERE f2.name = f.name) AS "overloadCount",
         COALESCE((SELECT json_agg(json_build_object(
                     'name', i.argname, 'type', i.argtype,
                     'required', i.in_pos <= (f.pronargs - f.pronargdefaults)) ORDER BY i.in_pos)
                   FROM inputs i WHERE i.oid = f.oid), '[]'::json) AS args,
         json_build_object(
           'anon', has_function_privilege('anon', f.oid, 'EXECUTE'),
           'authenticated', has_function_privilege('authenticated', f.oid, 'EXECUTE'),
           'service_role', has_function_privilege('service_role', f.oid, 'EXECUTE')
         ) AS "executableRoles"
  FROM fns f
) r;
`;

/** The local Supabase database container. Fails closed — never guesses a host. */
function findLocalDbContainer() {
  let out;
  try {
    out = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  } catch (e) {
    fail(`could not list docker containers (is the local Supabase stack running?): ${e.message}`);
  }
  const names = out.split(/\r?\n/).map((s) => s.trim()).filter((n) => /^supabase_db_/.test(n));
  if (names.length === 0) {
    fail("no running supabase_db_* container — start the local stack (npm run supabase:test:start)");
  }
  if (names.length > 1) {
    fail(`ambiguous local database: ${names.join(", ")} — refusing to guess which stack to inspect`);
  }
  return names[0];
}

function cmdInventory() {
  const out = arg("out");
  const container = findLocalDbContainer();
  let stdout;
  try {
    // SQL goes in on STDIN, not `-c`: a multi-line -c argument is mangled by
    // the Windows shell layer, and stdin behaves identically on both platforms.
    stdout = execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-q", "-v", "ON_ERROR_STOP=1"],
      {
        input: INVENTORY_SQL,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === "win32",
      },
    );
  } catch (e) {
    fail(`catalog query failed against ${container}: ${e.message}`);
  }
  let functions;
  try {
    functions = JSON.parse(stdout.trim());
  } catch {
    fail("catalog query returned output that is not JSON — refusing to continue on an unreadable inventory");
  }
  if (!Array.isArray(functions) || functions.length === 0) {
    fail("catalog inventory is EMPTY — a migrated database always has public functions; absence is never success");
  }
  functions.sort((a, b) => (a.name === b.name ? a.identityArgs.localeCompare(b.identityArgs) : a.name.localeCompare(b.name)));
  writeFileSync(out, JSON.stringify({ source: "pg_proc", schema: "public", count: functions.length, functions }, null, 2));
  console.log(`RPC-GUARD inventory: ${functions.length} public functions read from the local catalog (${container}).`);
}

/* ────────────────── Layer 3a: TypeScript caller extraction ──────────────── */

function listSourceFiles() {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
        walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        files.push(p);
      }
    }
  };
  for (const d of SCAN_DIRS) {
    const abs = resolve(ROOT, d);
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs);
  }
  return files.sort();
}

/**
 * Extract every `<expr>.rpc(...)` call from one source file using the TypeScript
 * AST. Exported for direct testing.
 *
 * Resolution rules — each call lands in exactly ONE bucket, never dropped:
 *   - `resolved`   : name is a string literal AND the argument object's keys are
 *                    fully known (object literal, with any `...SPREAD` of a
 *                    file-local const object literal inlined).
 *   - `unresolved` : anything else (computed name, non-literal argument object,
 *                    unresolvable spread). Must be declared in the dynamic
 *                    caller manifest or the guard fails.
 */
export function extractRpcCalls(fileName, sourceText) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const calls = [];

  // File-local `const X = { ... }` object literals, so a `...X` spread inside an
  // rpc argument object can be resolved rather than declared unresolvable.
  // A name declared twice with different literals is AMBIGUOUS (stored as
  // null): resolving it by name could silently check the wrong key set.
  const localObjects = new Map();
  const collectLocals = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      let init = node.initializer;
      // `{...} satisfies T` / `{...} as T` still describe the same literal.
      while (ts.isSatisfiesExpression?.(init) || ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) {
        init = init.expression;
      }
      const name = node.name.text;
      if (ts.isObjectLiteralExpression(init)) {
        localObjects.set(name, localObjects.has(name) ? null : init);
      } else {
        localObjects.set(name, null);
      }
    }
    ts.forEachChild(node, collectLocals);
  };
  collectLocals(sf);

  /** Keys of an object literal, inlining resolvable spreads. Returns null when
   *  any part cannot be statically resolved. */
  const keysOf = (obj, depth = 0) => {
    if (depth > 4) return null;
    const keys = [];
    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
        const n = prop.name;
        if (ts.isIdentifier(n) || ts.isStringLiteral(n)) keys.push(n.text);
        else return null; // computed key
      } else if (ts.isSpreadAssignment(prop)) {
        if (!ts.isIdentifier(prop.expression)) return null;
        const target = localObjects.get(prop.expression.text);
        if (!target) return null;
        const inner = keysOf(target, depth + 1);
        if (inner === null) return null;
        keys.push(...inner);
      } else {
        return null; // method / accessor
      }
    }
    return keys;
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "rpc"
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const [nameArg, rawArgsArg] = node.arguments;
      const base = { file: toRepoRelative(fileName), line };
      // `{...} satisfies RpcArgs<"fn">` — the compile-time contract this guard
      // wants callers to carry — still describes the same object literal.
      let argsArg = rawArgsArg;
      while (
        argsArg &&
        (ts.isSatisfiesExpression?.(argsArg) || ts.isAsExpression(argsArg) || ts.isParenthesizedExpression(argsArg))
      ) {
        argsArg = argsArg.expression;
      }

      if (!nameArg || !ts.isStringLiteral(nameArg)) {
        calls.push({ ...base, resolved: false, reason: "rpc name is not a string literal" });
      } else if (!argsArg) {
        calls.push({ ...base, resolved: true, rpc: nameArg.text, argNames: [] });
      } else {
        // Either an inline object literal, or an identifier bound to one in the
        // same file — which is exactly the `const args = {...} satisfies
        // RpcArgs<"fn">` pattern this guard wants callers to use.
        let objectLiteral = null;
        if (ts.isObjectLiteralExpression(argsArg)) objectLiteral = argsArg;
        else if (ts.isIdentifier(argsArg)) objectLiteral = localObjects.get(argsArg.text) ?? null;

        if (!objectLiteral) {
          calls.push({
            ...base, resolved: false, rpc: nameArg.text,
            reason: ts.isIdentifier(argsArg)
              ? `argument object \`${argsArg.text}\` is not a resolvable file-local object literal`
              : "argument object is not an object literal",
          });
          ts.forEachChild(node, visit);
          return;
        }
        const keys = keysOf(objectLiteral);
        if (keys === null) {
          calls.push({
            ...base, resolved: false, rpc: nameArg.text,
            reason: "argument object contains an unresolvable spread or computed key",
          });
        } else {
          calls.push({ ...base, resolved: true, rpc: nameArg.text, argNames: keys.sort() });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return calls;
}

function cmdCallers() {
  const out = arg("out");
  const files = listSourceFiles();
  const calls = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    if (!text.includes(".rpc(")) continue; // cheap prefilter; AST still decides
    calls.push(...extractRpcCalls(f, text));
  }
  calls.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  const resolved = calls.filter((c) => c.resolved);
  writeFileSync(out, JSON.stringify({ scanned: files.length, count: calls.length, calls }, null, 2));
  console.log(
    `RPC-GUARD callers: ${calls.length} .rpc() call sites (${resolved.length} statically resolved, ${calls.length - resolved.length} unresolved) across ${files.length} scanned files.`,
  );
}

/* ────────── Layer 3b: generated-types parsing (AST, not regex) ──────────── */

/**
 * Parse `public.Functions` out of the generated database types with the
 * TypeScript AST. Returns { fnName: { args: [{name, optional, tsType}] } }.
 * Exported for direct testing.
 */
export function parseGeneratedFunctions(sourceText, fileName = "database.types.ts") {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = {};

  const memberNamed = (typeNode, name) => {
    if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return null;
    for (const m of typeNode.members) {
      if (ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) && m.name.text === name) {
        return m.type ?? null;
      }
    }
    return null;
  };

  let databaseType = null;
  ts.forEachChild(sf, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "Database") databaseType = node.type;
  });
  if (!databaseType) return null;

  const publicSchema = memberNamed(databaseType, "public");
  const functions = memberNamed(publicSchema, "Functions");
  if (!functions || !ts.isTypeLiteralNode(functions)) return null;

  for (const m of functions.members) {
    if (!ts.isPropertySignature(m) || !m.name || !m.type) continue;
    const fnName = ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : null;
    if (!fnName) continue;
    const argsType = memberNamed(m.type, "Args");
    const args = [];
    let argsResolvable = true;
    if (argsType && ts.isTypeLiteralNode(argsType)) {
      for (const a of argsType.members) {
        if (!ts.isPropertySignature(a) || !a.name) continue;
        const argName = ts.isIdentifier(a.name) || ts.isStringLiteral(a.name) ? a.name.text : null;
        if (!argName) continue;
        args.push({
          name: argName,
          optional: a.questionToken !== undefined,
          tsType: a.type ? a.type.getText(sf).trim() : "unknown",
        });
      }
    } else {
      // e.g. `Args: Record<string, never>` — no named arguments.
      argsResolvable = argsType !== null;
    }
    out[fnName] = { args, argsResolvable };
  }
  return out;
}

/* ────────────────────────── Layer 3c: comparison ────────────────────────── */

/**
 * Generated types vs the migrated database. Pure; exported for testing.
 * Catches: a function present in one and not the other, an argument name
 * difference, a required/optional difference, and a mapped argument-type
 * difference. Unmappable Postgres types are RETURNED as explicit `unchecked`
 * entries, never silently dropped.
 */
export function compareTypesToInventory(inventory, generated) {
  const violations = [];
  const unchecked = [];
  if (generated === null) {
    return { violations: ["generated database types could not be parsed (public.Functions not found)"], unchecked };
  }
  const catalogNames = new Set(inventory.functions.map((f) => f.name));
  const generatedNames = new Set(Object.keys(generated));

  for (const n of catalogNames) {
    if (!generatedNames.has(n)) {
      violations.push(`generated types are MISSING function ${n}, which exists in the database — regenerate types/database.types.ts`);
    }
  }
  for (const n of generatedNames) {
    if (!catalogNames.has(n)) {
      violations.push(`generated types declare function ${n}, which does NOT exist in the database — regenerate types/database.types.ts`);
    }
  }

  for (const fn of inventory.functions) {
    const g = generated[fn.name];
    if (!g) continue;
    if (fn.overloadCount > 1) continue; // reported separately; arg comparison is ambiguous
    const gByName = new Map(g.args.map((a) => [a.name, a]));
    for (const a of fn.args) {
      const ga = gByName.get(a.name);
      if (!ga) {
        violations.push(`${fn.name}: database argument ${a.name} is absent from the generated types`);
        continue;
      }
      if (ga.optional === a.required) {
        violations.push(
          `${fn.name}.${a.name}: database says ${a.required ? "REQUIRED" : "OPTIONAL"} but generated types say ${ga.optional ? "OPTIONAL" : "REQUIRED"}`,
        );
      }
      const expected = pgTypeToTs(a.type);
      if (expected === null) {
        unchecked.push(`${fn.name}.${a.name}: Postgres type "${a.type}" has no TypeScript mapping — type not compared`);
      } else if (ga.tsType !== expected) {
        violations.push(
          `${fn.name}.${a.name}: database type ${a.type} maps to \`${expected}\` but generated types say \`${ga.tsType}\``,
        );
      }
    }
    for (const ga of g.args) {
      if (!fn.args.some((a) => a.name === ga.name)) {
        violations.push(`${fn.name}: generated types declare argument ${ga.name}, which the database does not have`);
      }
    }
  }
  return { violations, unchecked };
}

/**
 * TypeScript call sites vs the migrated database. Pure; exported for testing.
 * `dynamic` is the documented contract for call sites that cannot be resolved
 * statically.
 */
export function compareCallersToInventory(callers, inventory, dynamic) {
  const violations = [];
  const byName = new Map();
  for (const f of inventory.functions) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }

  // Declared by FILE plus an exact expected count, not by line: line numbers
  // churn with unrelated edits, but a NEW unresolved call site in an
  // already-declared file must still fail closed.
  const declaredFiles = new Map((dynamic?.unresolvedCallers ?? []).map((d) => [d.file, d]));
  const unresolvedByFile = new Map();

  for (const call of callers.calls) {
    const where = `${call.file}:${call.line}`;

    if (!call.resolved) {
      unresolvedByFile.set(call.file, (unresolvedByFile.get(call.file) ?? 0) + 1);
      const declared = declaredFiles.get(call.file);
      if (!declared) {
        violations.push(
          `${where}: unresolved .rpc() call (${call.reason}) is not declared in the dynamic-caller manifest — an unclassified caller is never silently skipped`,
        );
        continue;
      }
      const names = declared.rpcs ?? [];
      if (names.length === 0) {
        violations.push(`${where}: dynamic-caller manifest entry for ${call.file} declares no rpcs`);
      }
      for (const n of names) {
        if (!byName.has(n)) {
          violations.push(`${where}: dynamic-caller manifest declares rpc ${n}, which does not exist in the database`);
        }
      }
      // When the function name IS statically known (only the arguments are
      // not), the manifest must name it.
      if (call.rpc && !names.includes(call.rpc)) {
        violations.push(
          `${where}: call targets ${call.rpc}() but the manifest entry for ${call.file} declares only [${names.join(", ")}]`,
        );
      }
      continue;
    }

    const overloads = byName.get(call.rpc);
    if (!overloads) {
      violations.push(`${where}: calls unknown function ${call.rpc}() — it does not exist in the database`);
      continue;
    }
    if (overloads.length > 1) {
      violations.push(
        `${where}: ${call.rpc}() has ${overloads.length} overloads in the database — PostgREST named-argument resolution is ambiguous`,
      );
      continue;
    }
    const fn = overloads[0];
    const known = new Set(fn.args.map((a) => a.name));
    const passed = new Set(call.argNames);
    for (const a of call.argNames) {
      if (!known.has(a)) {
        violations.push(`${where}: ${call.rpc}() has no argument ${a} — stale or misnamed (database takes: ${fn.args.map((x) => x.name).join(", ") || "none"})`);
      }
    }
    for (const a of fn.args) {
      if (a.required && !passed.has(a.name)) {
        violations.push(`${where}: ${call.rpc}() requires argument ${a.name}, which the caller does not pass`);
      }
    }
  }

  for (const [file, entry] of declaredFiles) {
    const actual = unresolvedByFile.get(file) ?? 0;
    if (actual === 0) {
      violations.push(
        `dynamic-caller manifest entry ${file} (${entry.reason ?? "no reason given"}) matches no unresolved call site — the manifest is stale`,
      );
    } else if (entry.unresolvedCount !== actual) {
      violations.push(
        `dynamic-caller manifest declares ${entry.unresolvedCount} unresolved call(s) in ${file}, but ${actual} were found — re-classify the new site instead of widening the entry`,
      );
    }
  }
  return violations;
}

/* ─────────────────────────────── check / run ────────────────────────────── */

function readJson(path, label) {
  if (!existsSync(path)) fail(`${label} artifact missing: ${path} — absence is never success`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`${label} artifact is not readable JSON (${path}): ${e.message}`);
  }
}

function runCheck({ inventoryPath, callersPath, typesPath, dynamicPath }) {
  const inventory = readJson(inventoryPath, "inventory");
  const callers = readJson(callersPath, "callers");
  if (!Array.isArray(inventory.functions) || inventory.functions.length === 0) {
    fail("inventory contains zero functions — refusing to pass a vacuous comparison");
  }
  if (!Array.isArray(callers.calls)) fail("callers artifact has no call list");
  if (!existsSync(typesPath)) fail(`generated database types missing: ${typesPath}`);
  const dynamic = existsSync(dynamicPath) ? readJson(dynamicPath, "dynamic-caller manifest") : { unresolvedCallers: [] };

  const generated = parseGeneratedFunctions(readFileSync(typesPath, "utf8"), typesPath);
  const { violations: typeViolations, unchecked } = compareTypesToInventory(inventory, generated);
  const callerViolations = compareCallersToInventory(callers, inventory, dynamic);

  const overloaded = inventory.functions.filter((f) => f.overloadCount > 1);
  const all = [...typeViolations, ...callerViolations];

  if (all.length > 0) {
    for (const v of all) console.error(`RPC-GUARD FAIL — ${v}`);
    process.exit(1);
  }

  const resolved = callers.calls.filter((c) => c.resolved);
  const unresolved = callers.calls.length - resolved.length;
  const calledFns = new Set(resolved.map((c) => c.rpc));
  console.log("RPC-GUARD PASS");
  console.log(`  database functions:      ${inventory.functions.length} (public, non-trigger)`);
  console.log(`  generated type entries:  ${Object.keys(generated).length} — names, argument names, required/optional and mapped types all agree`);
  console.log(`  .rpc() call sites:       ${callers.calls.length} across ${callers.scanned} scanned files`);
  console.log(`    statically resolved:   ${resolved.length} (covering ${calledFns.size} distinct functions)`);
  console.log(`    declared unresolved:   ${unresolved} (every one accounted for in the manifest)`);
  console.log(`  overloaded functions:    ${overloaded.length}${overloaded.length ? ` (${overloaded.map((f) => f.name).join(", ")})` : ""}`);
  if (unchecked.length > 0) {
    console.log(`  argument types NOT compared (no TS mapping): ${unchecked.length}`);
    for (const u of unchecked) console.log(`    - ${u}`);
  }
}

function cmdCheck() {
  runCheck({
    inventoryPath: arg("inventory"),
    callersPath: arg("callers"),
    typesPath: resolve(ROOT, arg("types", DEFAULT_TYPES)),
    dynamicPath: resolve(ROOT, arg("dynamic", DEFAULT_DYNAMIC)),
  });
}

function cmdRun() {
  const outDir = arg("out-dir", ROOT);
  const inventoryPath = resolve(outDir, "rpc-inventory.json");
  const callersPath = resolve(outDir, "rpc-callers.json");
  process.argv.push("--out", inventoryPath);
  cmdInventory();
  process.argv.splice(process.argv.indexOf("--out"), 2);
  process.argv.push("--out", callersPath);
  cmdCallers();
  process.argv.splice(process.argv.indexOf("--out"), 2);
  runCheck({
    inventoryPath,
    callersPath,
    typesPath: resolve(ROOT, DEFAULT_TYPES),
    dynamicPath: resolve(ROOT, DEFAULT_DYNAMIC),
  });
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const command = process.argv[2];
  if (command === "inventory") cmdInventory();
  else if (command === "callers") cmdCallers();
  else if (command === "check") cmdCheck();
  else if (command === "run") cmdRun();
  else fail(`unknown command: ${command ?? "(none)"} — expected inventory | callers | check | run`);
}
