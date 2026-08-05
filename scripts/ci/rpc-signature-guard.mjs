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
const DEFAULT_CONTRACTS = "scripts/ci/rpc-result-contracts.json";
const DEFAULT_COMPAT = "scripts/ci/rpc-return-compat.json";

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
         p.prorettype, p.proretset,
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
),
-- OUT / TABLE columns: the structural half of the RETURN contract.
outcols AS (
  SELECT oid, ord, argname, argtype,
         row_number() OVER (PARTITION BY oid ORDER BY ord) AS out_pos
  FROM expanded WHERE argmode IN ('t','o')
),
-- A function returning a named composite (e.g. account_invitations) has no
-- OUT columns; its structure comes from the type's own attributes.
compcols AS (
  SELECT f.oid, a.attnum AS out_pos, a.attname AS argname,
         format_type(a.atttypid, a.atttypmod) AS argtype
  FROM fns f
  JOIN pg_type t ON t.oid = f.prorettype
  JOIN pg_class c ON c.oid = t.typrelid AND c.relkind IN ('r','c','v','m','p','f')
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE NOT EXISTS (SELECT 1 FROM outcols o WHERE o.oid = f.oid)
),
allout AS (
  SELECT oid, out_pos, argname, argtype FROM outcols
  UNION ALL
  SELECT oid, out_pos, argname, argtype FROM compcols
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
         f.proretset AS "returnsSetof",
         COALESCE((SELECT json_agg(json_build_object('name', o.argname, 'type', o.argtype)
                                   ORDER BY o.out_pos)
                   FROM allout o WHERE o.oid = f.oid), 'null'::json) AS "returnColumns",
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
  const localContracts = new Map();
  const collectLocals = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      let init = node.initializer;
      // `{...} satisfies T` / `{...} as T` still describe the same literal.
      while (ts.isSatisfiesExpression?.(init) || ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) {
        init = init.expression;
      }
      const name = node.name.text;
      // Remember a `satisfies RpcArgs<"fn">` (or an explicit type annotation)
      // carried by the declaration, so an identifier argument keeps its
      // compile-time contract when the call site references it.
      const contractText = [
        ts.isSatisfiesExpression?.(node.initializer) ? node.initializer.type.getText(sf) : null,
        node.type ? node.type.getText(sf) : null,
      ]
        .filter(Boolean)
        .join(" ");
      if (contractText) localContracts.set(name, contractText);
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

  /**
   * How the caller handles the RPC RESULT. RPC-RETURN-CONTRACT-GUARD-1: the
   * input side being typed proves nothing about the value coming back — a
   * changed return shape still compiles behind `data as { ... }`.
   *
   * Buckets (every call lands in exactly one):
   *   ignored   — `data` is never bound; the caller cannot misuse it.
   *   contract  — the result is described by RpcReturns<"fn"> (an `as`, a type
   *               annotation, or a `.single<...>()` type argument mentioning it).
   *   validated — the result is passed to a registered runtime validator/mapper.
   *   cast      — a HANDWRITTEN `as { ... }` / `.single<HandRolled>()`. This is
   *               the gap: it silently survives a return-shape change.
   *   inferred  — `data` is bound and used with no explicit contract at all.
   */
  const classifyResult = (callNode) => {
    // Walk out through the postgrest chain: .rpc(...).single<T>() etc.
    let outer = callNode;
    const chain = [];
    const chainTypeArgs = [];
    for (;;) {
      const parent = outer.parent;
      if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === outer) {
        const callParent = parent.parent;
        if (callParent && ts.isCallExpression(callParent) && callParent.expression === parent) {
          chain.push(parent.name.text);
          for (const ta of callParent.typeArguments ?? []) chainTypeArgs.push(ta.getText(sf));
          outer = callParent;
          continue;
        }
      }
      break;
    }
    for (const ta of callNode.typeArguments ?? []) chainTypeArgs.push(ta.getText(sf));

    // Walk out through `await` / parentheses to the variable declaration.
    let expr = outer;
    while (expr.parent && (ts.isAwaitExpression(expr.parent) || ts.isParenthesizedExpression(expr.parent))) {
      expr = expr.parent;
    }
    const decl = expr.parent && ts.isVariableDeclaration(expr.parent) ? expr.parent : null;

    let dataBinding = null;
    if (decl && ts.isObjectBindingPattern(decl.name)) {
      for (const el of decl.name.elements) {
        const source = el.propertyName ?? el.name;
        if ((ts.isIdentifier(source) || ts.isStringLiteral(source)) && source.text === "data") {
          if (ts.isIdentifier(el.name)) dataBinding = el.name.text;
        }
      }
    } else if (decl && ts.isIdentifier(decl.name)) {
      // `const res = await client.rpc(...)` — res.data is the result.
      dataBinding = decl.name.text;
    }

    // Any generated-type-backed result contract counts: RpcReturns (raw),
    // RpcRow / RpcRows (set-returning, nulls permitted), RpcScalar.
    const mentionsContract = (text) =>
      /\bRpc(Returns|Rows|Row|Scalar)\s*</.test(text ?? "");
    const explicitTypes = [...chainTypeArgs];

    if (dataBinding === null) {
      return { kind: "ignored", chain, explicitTypes };
    }

    // Scope the search to the ENCLOSING FUNCTION. `data` is rebound in every
    // repository function, so a file-wide walk would attribute one function's
    // cast to a sibling's call and make the classification meaningless.
    let scope = decl ?? outer;
    for (let n = scope; n; n = n.parent) {
      if (
        ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
        ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isSourceFile(n)
      ) {
        scope = n;
        break;
      }
    }

    // Follow ALIASES of the result within the scope. Repositories routinely do
    //   const rows: RpcRows<"fn"> = Array.isArray(data) ? data : [];
    //   const first = rows[0];
    //   const row = parseRpcResult("fn", schema, first);
    // Tracking only `data` would miss both the contract and the validation and
    // report a validated call as unprotected.
    const tracked = new Set([dataBinding]);
    for (let pass = 0; pass < 5; pass++) {
      const before = tracked.size;
      const alias = (n) => {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
          const init = n.initializer.getText(sf);
          for (const t of tracked) {
            if (new Set(init.split(/[^A-Za-z0-9_$]+/)).has(t)) {
              tracked.add(n.name.text);
              break;
            }
          }
        }
        ts.forEachChild(n, alias);
      };
      alias(scope);
      if (tracked.size === before) break;
    }

    // Collect every explicit typing / consumption of the tracked bindings.
    const casts = [];
    const annotations = [];
    const passedTo = [];
    const collect = (n) => {
      if (ts.isIdentifier(n) && tracked.has(n.text)) {
        const p = n.parent;
        if (p && ts.isAsExpression(p) && p.expression === n) casts.push(p.type.getText(sf));
        else if (p && ts.isSatisfiesExpression?.(p) && p.expression === n) annotations.push(p.type.getText(sf));
        else if (p && ts.isCallExpression(p) && p.arguments.includes(n) && ts.isIdentifier(p.expression)) {
          passedTo.push(p.expression.text);
        } else if (p && ts.isCallExpression(p) && p.arguments.includes(n) && ts.isPropertyAccessExpression(p.expression)) {
          passedTo.push(p.expression.name.text);
        }
      }
      // `const row: RpcReturns<"fn"> = data` / `(data ?? []) as X`
      const mentionsTracked = (text) => {
        const tokens = new Set(String(text).split(/[^A-Za-z0-9_$]+/));
        return [...tracked].some((t) => tokens.has(t));
      };
      if (ts.isVariableDeclaration(n) && n.type && n.initializer) {
        if (mentionsTracked(n.initializer.getText(sf))) annotations.push(n.type.getText(sf));
      }
      if (ts.isAsExpression(n) && mentionsTracked(n.expression.getText(sf))) {
        casts.push(n.type.getText(sf));
      }
      ts.forEachChild(n, collect);
    };
    collect(scope);

    const uniq = (a) => [...new Set(a)];
    const allTypeText = [...explicitTypes, ...casts, ...annotations];
    const base = {
      chain,
      explicitTypes: uniq(explicitTypes),
      casts: uniq(casts),
      annotations: uniq(annotations),
      passedTo: uniq(passedTo),
    };

    if (allTypeText.some(mentionsContract)) return { kind: "contract", ...base };
    const handwritten = [...explicitTypes, ...casts].filter((t) => !mentionsContract(t));
    if (handwritten.length > 0) return { kind: "cast", ...base, handwritten: uniq(handwritten) };
    if (base.passedTo.length > 0) return { kind: "validated", ...base };
    return { kind: "inferred", ...base };
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "rpc"
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const [nameArg, rawArgsArg] = node.arguments;
      // Does the argument object carry its `satisfies RpcArgs<"fn">` contract —
      // inline, or on the file-local const it references?
      const argContractTexts = [];
      for (let n = rawArgsArg; n; ) {
        if (ts.isSatisfiesExpression?.(n) || ts.isAsExpression(n)) {
          argContractTexts.push(n.type.getText(sf));
          n = n.expression;
        } else if (ts.isParenthesizedExpression(n)) {
          n = n.expression;
        } else {
          if (ts.isIdentifier(n) && localContracts.has(n.text)) {
            argContractTexts.push(localContracts.get(n.text));
          }
          break;
        }
      }
      const base = {
        file: toRepoRelative(fileName),
        line,
        argsContract: argContractTexts.find((t) => /\bRpcArgs\s*</.test(t)) ?? null,
        result: classifyResult(node),
      };
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
    const returnsType = memberNamed(m.type, "Returns");
    let returnsIsArray = false;
    let returnsMembers = null;
    let base = returnsType;
    if (base && ts.isArrayTypeNode(base)) {
      returnsIsArray = true;
      base = base.elementType;
    }
    if (base && ts.isTypeLiteralNode(base)) {
      returnsMembers = [];
      for (const rm of base.members) {
        if (!ts.isPropertySignature(rm) || !rm.name) continue;
        const rn = ts.isIdentifier(rm.name) || ts.isStringLiteral(rm.name) ? rm.name.text : null;
        if (!rn) continue;
        returnsMembers.push({
          name: rn,
          tsType: rm.type ? rm.type.getText(sf).replace(/\s+/g, " ").trim() : "unknown",
        });
      }
    }
    out[fnName] = {
      args,
      argsResolvable,
      // Normalized to single-spaced text so it can be compared structurally.
      returnsText: returnsType ? returnsType.getText(sf).replace(/\s+/g, " ").trim() : null,
      returnsIsArray,
      returnsMembers,
    };
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

/* ────────── RPC-RETURN-CONTRACT-GUARD-1: the RESULT side ────────────────── */

/** Drop `| null` / `| undefined` members and collapse spacing. */
export function normalizeTsType(text) {
  return String(text ?? "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p !== "null" && p !== "undefined" && p !== "")
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Catalog RETURN types vs the generated `Returns`. Pure; exported for testing.
 *
 * The two sides spell the same contract differently, so the comparison is
 * STRUCTURAL, never raw-text:
 *   void                    -> `undefined`
 *   scalar                  -> the mapped scalar (uuid -> string)
 *   json / jsonb            -> `Json`
 *   TABLE(...) / SETOF comp -> an ARRAY of an object with those columns
 *   named composite         -> an object with the type's attributes
 *
 * NULLABILITY IS DELIBERATELY NOT COMPARED. PostgreSQL does not record
 * nullability for function output columns, and the generator emits table
 * columns with `| null` but function OUT columns without it — neither side is
 * authoritative, so comparing it would produce noise, not signal. That gap is
 * closed by RpcRow/RpcRows re-permitting null, and is stated in types/rpc.ts.
 *
 * An unmapped Postgres type FAILS CLOSED unless declared in the reviewed
 * compatibility manifest.
 */
export function compareReturnsToInventory(inventory, generated, compat) {
  const violations = [];
  const declared = new Map((compat?.unmappedReturnTypes ?? []).map((e) => [e.pgType, e]));
  const usedDeclarations = new Set();

  const mapType = (pgType, where) => {
    const mapped = pgTypeToTs(pgType);
    if (mapped !== null) return mapped;
    const entry = declared.get(pgType);
    if (entry) {
      usedDeclarations.add(pgType);
      return entry.generatedAs;
    }
    violations.push(
      `${where}: Postgres type "${pgType}" has no TypeScript mapping and is not declared in the return-compatibility manifest — refusing to assume it matches`,
    );
    return null;
  };

  for (const fn of inventory.functions) {
    const g = generated[fn.name];
    if (!g) continue; // absence is reported by the name comparison
    if (fn.overloadCount > 1) continue; // ambiguous; reported separately
    const got = normalizeTsType(g.returnsText);

    // 1. void
    if (fn.returns === "void") {
      if (got !== "" && got !== "undefined") {
        violations.push(`${fn.name}: database returns void but generated types say ${g.returnsText}`);
      }
      continue;
    }

    // 2. structured: TABLE(...), SETOF composite, or a named composite
    if (Array.isArray(fn.returnColumns) && fn.returnColumns.length > 0) {
      if (Boolean(g.returnsIsArray) !== Boolean(fn.returnsSetof)) {
        violations.push(
          `${fn.name}: database ${fn.returnsSetof ? "is set-returning (rows)" : "returns a single composite"} but generated types say ${g.returnsText}`,
        );
        continue;
      }
      if (!g.returnsMembers) {
        violations.push(
          `${fn.name}: database returns columns (${fn.returnColumns.map((c) => c.name).join(", ")}) but generated types say ${g.returnsText}`,
        );
        continue;
      }
      const genByName = new Map(g.returnsMembers.map((m) => [m.name, m]));
      for (const col of fn.returnColumns) {
        const gm = genByName.get(col.name);
        if (!gm) {
          violations.push(`${fn.name}: returned column ${col.name} is absent from the generated Returns`);
          continue;
        }
        const expected = mapType(col.type, `${fn.name}.${col.name}`);
        if (expected === null) continue;
        if (normalizeTsType(gm.tsType) !== normalizeTsType(expected)) {
          violations.push(
            `${fn.name}.${col.name}: database type ${col.type} maps to ${expected} but generated Returns say ${gm.tsType}`,
          );
        }
      }
      for (const gm of g.returnsMembers) {
        if (!fn.returnColumns.some((c) => c.name === gm.name)) {
          violations.push(
            `${fn.name}: generated Returns declare column ${gm.name}, which the database does not return`,
          );
        }
      }
      continue;
    }

    // 3. scalar / json
    const expected = mapType(fn.returns, fn.name);
    if (expected === null) continue;
    const want = normalizeTsType(fn.returnsSetof ? `${expected}[]` : expected);
    if (got !== want) {
      violations.push(
        `${fn.name}: database returns ${fn.returns} (expected ${want}) but generated types say ${g.returnsText}`,
      );
    }
  }

  for (const [pgType, entry] of declared) {
    if (!usedDeclarations.has(pgType)) {
      violations.push(
        `return-compatibility manifest declares "${pgType}" (${entry.reason ?? "no reason given"}) but no function returns it — the manifest is stale`,
      );
    }
  }
  return violations;
}

/**
 * How every static caller HANDLES its result. Pure; exported for testing.
 *
 * A typed argument object proves nothing about the value coming back: before
 * this arc, 18 of 19 production callers asserted their result with a
 * handwritten `data as { ... }` that no compiler and no database ever checked.
 *
 * Enforced:
 *   - a handwritten cast is a violation ANYWHERE (production or test);
 *   - a production caller that binds `data` must describe it with an
 *     RpcReturns/RpcRow/RpcRows/RpcScalar contract, or pass it to an approved
 *     runtime validator;
 *   - `passedTo` only counts when the callee is an APPROVED validator, so
 *     `expect(data)` in a test can never masquerade as validation;
 *   - a caller that never binds `data` is `ignored` and needs no fake variable;
 *   - a high-risk function listed in the manifest MUST be runtime-validated —
 *     compile-time typing alone is not sufficient;
 *   - exemptions must name a real call site (stale entries fail).
 */
export function verifyResultFlows(callers, contracts) {
  const violations = [];
  const approved = new Set(contracts?.approvedValidators ?? []);
  const requireValidation = new Set(contracts?.requireRuntimeValidation ?? []);
  const exemptions = new Map((contracts?.exemptions ?? []).map((e) => [`${e.file}::${e.rpc}`, e]));
  const matchedExemptions = new Set();
  const counts = { ignored: 0, contract: 0, validated: 0, cast: 0, inferred: 0, unresolved: 0 };

  for (const call of callers.calls) {
    if (!call.resolved) {
      counts.unresolved += 1;
      continue;
    }
    const where = `${call.file}:${call.line}`;
    const isTest = call.file.startsWith("tests/");
    const r = call.result ?? { kind: "inferred" };
    const key = `${call.file}::${call.rpc}`;
    const exemption = exemptions.get(key);
    if (exemption) matchedExemptions.add(key);

    // A site may be BOTH typed and validated — that is the ideal, so an approved
    // validator always wins the label. `passedTo` alone never counts: passing
    // `data` to `expect` is an assertion, not a contract.
    // ARGUMENT contract. The guard already proves the argument NAMES against the
    // catalog, but only `satisfies RpcArgs<"fn">` makes the compiler check the
    // argument VALUE TYPES — so a new call site must not silently opt out.
    if ((call.argNames ?? []).length > 0 && !call.argsContract && !exemption) {
      violations.push(
        `${where}: ${call.rpc}() passes an argument object with no \`satisfies RpcArgs<"${call.rpc}">\` contract — its argument value types are unchecked`,
      );
    }

    const validatedBy = (r.passedTo ?? []).filter((n) => approved.has(n));
    const kind =
      validatedBy.length > 0
        ? "validated"
        : r.kind === "passed" || r.kind === "validated"
          ? "inferred"
          : r.kind;
    counts[kind] = (counts[kind] ?? 0) + 1;

    if (kind === "cast") {
      if (!exemption) {
        violations.push(
          `${where}: ${call.rpc}() result is asserted with a handwritten type (${(r.handwritten ?? []).join(", ")}) — use RpcReturns/RpcRow/RpcRows/RpcScalar or an approved validator`,
        );
      }
      continue;
    }

    if (!isTest && requireValidation.has(call.rpc) && kind !== "validated" && kind !== "ignored" && !exemption) {
      violations.push(
        `${where}: ${call.rpc}() is a high-risk result and must be validated at runtime by an approved validator, not typed alone (saw "${kind}")`,
      );
      continue;
    }

    if (!isTest && kind === "inferred" && !exemption) {
      violations.push(
        `${where}: ${call.rpc}() binds its result with no contract — annotate it with RpcReturns/RpcRow/RpcRows/RpcScalar or validate it`,
      );
    }
  }

  for (const [key, entry] of exemptions) {
    if (!matchedExemptions.has(key)) {
      violations.push(
        `result-contract exemption ${key} (${entry.reason ?? "no reason given"}) matches no call site — the manifest is stale`,
      );
    }
  }
  return { violations, counts };
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

function runCheck({ inventoryPath, callersPath, typesPath, dynamicPath, contractsPath, compatPath }) {
  const inventory = readJson(inventoryPath, "inventory");
  const callers = readJson(callersPath, "callers");
  if (!Array.isArray(inventory.functions) || inventory.functions.length === 0) {
    fail("inventory contains zero functions — refusing to pass a vacuous comparison");
  }
  if (!Array.isArray(callers.calls)) fail("callers artifact has no call list");
  if (!existsSync(typesPath)) fail(`generated database types missing: ${typesPath}`);
  const dynamic = existsSync(dynamicPath) ? readJson(dynamicPath, "dynamic-caller manifest") : { unresolvedCallers: [] };
  if (!existsSync(contractsPath)) fail(`result-contract manifest missing: ${contractsPath}`);
  const contracts = readJson(contractsPath, "result-contract manifest");
  const compat = existsSync(compatPath) ? readJson(compatPath, "return-compatibility manifest") : { unmappedReturnTypes: [] };

  const generated = parseGeneratedFunctions(readFileSync(typesPath, "utf8"), typesPath);
  const { violations: typeViolations, unchecked } = compareTypesToInventory(inventory, generated);
  const callerViolations = compareCallersToInventory(callers, inventory, dynamic);
  const returnViolations = compareReturnsToInventory(inventory, generated, compat);
  const { violations: resultViolations, counts } = verifyResultFlows(callers, contracts);

  const overloaded = inventory.functions.filter((f) => f.overloadCount > 1);
  const all = [...typeViolations, ...callerViolations, ...returnViolations, ...resultViolations];

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
  console.log(`  RETURN types:            compared structurally against the catalog for all ${inventory.functions.length} functions`);
  console.log(
    `  result flows:            ${counts.contract} typed contract / ${counts.validated} runtime-validated / ${counts.ignored} result ignored / ${counts.inferred} inferred (tests) / ${counts.cast} handwritten casts`,
  );
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
    contractsPath: resolve(ROOT, arg("contracts", DEFAULT_CONTRACTS)),
    compatPath: resolve(ROOT, arg("compat", DEFAULT_COMPAT)),
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
    contractsPath: resolve(ROOT, DEFAULT_CONTRACTS),
    compatPath: resolve(ROOT, DEFAULT_COMPAT),
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
