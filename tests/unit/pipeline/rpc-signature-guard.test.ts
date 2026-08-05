/**
 * @jest-environment node
 *
 * RPC-SIGNATURE-DRIFT-GUARD-1 — behavioral fail-closed proofs for the RPC
 * signature guard (scripts/ci/rpc-signature-guard.mjs).
 *
 * The regression this guard exists to stop was invisible precisely because
 * every layer independently looked fine: the migration was valid, the
 * repository caller was updated, the generated types were accurate, and the
 * stale test still compiled and "passed". So each corruption class is proved
 * here against the REAL CLI with crafted artifacts — a guard that is only
 * exercised on a healthy repository proves nothing about what it rejects.
 *
 * The catalog half (`inventory`) is not stubbed here: it reads the live local
 * database and is proved by the counterfactual mutations recorded in the batch
 * report, plus the db-ci run itself.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const GUARD = resolve(ROOT, "scripts/ci/rpc-signature-guard.mjs");

interface CatalogArg {
  name: string;
  type: string;
  required: boolean;
}
interface CatalogFn {
  schema: string;
  name: string;
  identityArgs: string;
  returns: string;
  returnsSetof?: boolean;
  returnColumns?: Array<{ name: string; type: string }> | null;
  securityDefiner: boolean;
  nArgs: number;
  nDefaults: number;
  overloadCount: number;
  args: CatalogArg[];
  executableRoles: { anon: boolean; authenticated: boolean; service_role: boolean };
}

/** A minimal but realistic catalog inventory. */
function inventory(overrides: CatalogFn[] = []) {
  const base: CatalogFn[] = [
    {
      schema: "public",
      name: "apply_business_upgrade",
      identityArgs: "p_account_id uuid, p_ai_credits_limit integer",
      returns: "jsonb",
      securityDefiner: true,
      nArgs: 2,
      nDefaults: 0,
      overloadCount: 1,
      args: [
        { name: "p_account_id", type: "uuid", required: true },
        { name: "p_ai_credits_limit", type: "integer", required: true },
      ],
      executableRoles: { anon: false, authenticated: false, service_role: true },
    },
  ];
  return { source: "pg_proc", schema: "public", count: base.length + overrides.length, functions: [...base, ...overrides] };
}

/** Generated types matching the inventory above. */
const MATCHING_TYPES = `
export type Json = string | number | boolean | null
export type Database = {
  public: {
    Tables: { [_ in never]: never }
    Functions: {
      apply_business_upgrade: {
        Args: { p_account_id: string; p_ai_credits_limit: number }
        Returns: Json
      }
    }
  }
}
`;

const callers = (calls: Record<string, unknown>[]) => ({ scanned: 1, count: calls.length, calls });

const okCall = {
  file: "repositories/accountBilling.ts",
  line: 58,
  resolved: true,
  rpc: "apply_business_upgrade",
  argsContract: 'RpcArgs<"apply_business_upgrade">',
  argNames: ["p_account_id", "p_ai_credits_limit"],
  result: { kind: "validated", passedTo: ["parseRpcResult"], casts: [], annotations: [] },
};

/** Same call site, but handling its result in some other way. */
const callWithResult = (result: Record<string, unknown>) => ({ ...okCall, result });

describe("rpc-signature-guard check — fail-closed corruption proofs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rpc-guard-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const DEFAULT_CONTRACTS = {
    approvedValidators: ["parseRpcResult"],
    requireRuntimeValidation: [] as string[],
    exemptions: [] as unknown[],
  };

  function check({
    inv = inventory(),
    calls = callers([okCall]),
    types = MATCHING_TYPES,
    dynamic = { unresolvedCallers: [] },
    contracts = DEFAULT_CONTRACTS,
    compat = { unmappedReturnTypes: [] as unknown[] },
    omit = [] as string[],
  }: {
    inv?: unknown;
    calls?: unknown;
    types?: string;
    dynamic?: unknown;
    contracts?: unknown;
    compat?: unknown;
    omit?: string[];
  } = {}) {
    const invPath = join(dir, "inv.json");
    const callersPath = join(dir, "callers.json");
    const typesPath = join(dir, "types.ts");
    const dynamicPath = join(dir, "dynamic.json");
    const contractsPath = join(dir, "contracts.json");
    const compatPath = join(dir, "compat.json");
    if (!omit.includes("inventory")) writeFileSync(invPath, JSON.stringify(inv));
    if (!omit.includes("callers")) writeFileSync(callersPath, JSON.stringify(calls));
    if (!omit.includes("types")) writeFileSync(typesPath, types);
    writeFileSync(dynamicPath, JSON.stringify(dynamic));
    if (!omit.includes("contracts")) writeFileSync(contractsPath, JSON.stringify(contracts));
    writeFileSync(compatPath, JSON.stringify(compat));
    return spawnSync(
      process.execPath,
      [
        GUARD, "check",
        "--inventory", invPath, "--callers", callersPath, "--types", typesPath,
        "--dynamic", dynamicPath, "--contracts", contractsPath, "--compat", compatPath,
      ],
      { encoding: "utf8", cwd: ROOT },
    );
  }

  it("PASSES when database, generated types and callers all agree", () => {
    const r = check();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("RPC-GUARD PASS");
  });

  it("fails when a caller targets a function that does not exist", () => {
    const r = check({
      calls: callers([{ ...okCall, rpc: "apply_business_upgrde", argNames: ["p_account_id"] }]),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("calls unknown function apply_business_upgrde()");
  });

  it("fails when a caller passes a STALE argument the database removed", () => {
    const r = check({
      calls: callers([{ ...okCall, argNames: ["p_account_id", "p_ai_credits_limit", "p_legacy_limit"] }]),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("has no argument p_legacy_limit");
  });

  it("fails when a caller OMITS a required argument", () => {
    const r = check({ calls: callers([{ ...okCall, argNames: ["p_account_id"] }]) });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("requires argument p_ai_credits_limit");
  });

  it("does NOT fail when a caller omits a DEFAULTED argument", () => {
    const inv = inventory();
    inv.functions[0]!.args[1]!.required = false;
    inv.functions[0]!.nDefaults = 1;
    const types = MATCHING_TYPES.replace("p_ai_credits_limit: number", "p_ai_credits_limit?: number");
    const r = check({ inv, types, calls: callers([{ ...okCall, argNames: ["p_account_id"] }]) });
    expect(r.status).toBe(0);
  });

  it("fails when a guarded function gains an unexpected OVERLOAD", () => {
    const inv = inventory([
      {
        schema: "public",
        name: "apply_business_upgrade",
        identityArgs: "p_account_id uuid",
        returns: "jsonb",
        securityDefiner: true,
        nArgs: 1,
        nDefaults: 0,
        overloadCount: 2,
        args: [{ name: "p_account_id", type: "uuid", required: true }],
        executableRoles: { anon: false, authenticated: false, service_role: true },
      },
    ]);
    inv.functions[0]!.overloadCount = 2;
    const r = check({ inv });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("overloads in the database");
    expect(r.stderr).toContain("ambiguous");
  });

  it("fails when the generated types are MISSING a database function", () => {
    const r = check({
      types: MATCHING_TYPES.replace("apply_business_upgrade:", "some_other_function:"),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("generated types are MISSING function apply_business_upgrade");
  });

  it("fails when the generated types declare a function the database dropped", () => {
    const types = MATCHING_TYPES.replace(
      "    }\n  }\n}",
      "      ghost_function: { Args: { p_x: string }; Returns: Json }\n    }\n  }\n}",
    );
    const r = check({ types });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("generated types declare function ghost_function");
  });

  it("fails when a generated argument NAME disagrees with the database", () => {
    const r = check({
      types: MATCHING_TYPES.replace("p_ai_credits_limit: number", "p_ai_credit_limit: number"),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("database argument p_ai_credits_limit is absent from the generated types");
  });

  it("fails when a generated argument TYPE disagrees with the database", () => {
    const r = check({
      types: MATCHING_TYPES.replace("p_ai_credits_limit: number", "p_ai_credits_limit: string"),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("maps to `number` but generated types say `string`");
  });

  it("fails when required/optional disagrees between database and types", () => {
    const r = check({
      types: MATCHING_TYPES.replace("p_ai_credits_limit: number", "p_ai_credits_limit?: number"),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("database says REQUIRED but generated types say OPTIONAL");
  });

  it("fails on an EMPTY inventory rather than passing a vacuous comparison", () => {
    const r = check({ inv: { source: "pg_proc", schema: "public", count: 0, functions: [] } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("zero functions");
  });

  it.each(["inventory", "callers", "types"])("fails closed when the %s artifact is missing", (which) => {
    const r = check({ omit: [which] });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/missing|absence is never success/);
  });

  it("fails when an UNRESOLVED caller is not declared in the dynamic manifest", () => {
    const r = check({
      calls: callers([
        okCall,
        { file: "tests/integration/x.test.ts", line: 9, resolved: false, reason: "rpc name is not a string literal" },
      ]),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("is not declared in the dynamic-caller manifest");
  });

  it("accepts a declared unresolved caller, but only for functions that exist", () => {
    const calls = callers([
      okCall,
      { file: "tests/integration/x.test.ts", line: 9, resolved: false, reason: "dynamic name" },
    ]);
    const ok = check({
      calls,
      dynamic: {
        unresolvedCallers: [
          { file: "tests/integration/x.test.ts", unresolvedCount: 1, rpcs: ["apply_business_upgrade"], reason: "helper" },
        ],
      },
    });
    expect(ok.status).toBe(0);

    const ghost = check({
      calls,
      dynamic: {
        unresolvedCallers: [
          { file: "tests/integration/x.test.ts", unresolvedCount: 1, rpcs: ["no_such_fn"], reason: "helper" },
        ],
      },
    });
    expect(ghost.status).not.toBe(0);
    expect(ghost.stderr).toContain("does not exist in the database");
  });

  it("fails when a NEW unresolved call appears in an already-declared file", () => {
    const r = check({
      calls: callers([
        okCall,
        { file: "tests/integration/x.test.ts", line: 9, resolved: false, reason: "dynamic name" },
        { file: "tests/integration/x.test.ts", line: 40, resolved: false, reason: "dynamic name" },
      ]),
      dynamic: {
        unresolvedCallers: [
          { file: "tests/integration/x.test.ts", unresolvedCount: 1, rpcs: ["apply_business_upgrade"], reason: "helper" },
        ],
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("but 2 were found");
  });

  it("fails when the dynamic manifest is stale (declares a site that no longer exists)", () => {
    const r = check({
      dynamic: {
        unresolvedCallers: [
          { file: "tests/integration/gone.test.ts", unresolvedCount: 1, rpcs: ["apply_business_upgrade"], reason: "gone" },
        ],
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("the manifest is stale");
  });

  it("rejects an unknown subcommand rather than silently doing nothing", () => {
    const r = spawnSync(process.execPath, [GUARD, "not-a-command"], { encoding: "utf8", cwd: ROOT });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("unknown command");
  });

  // ── RPC-RETURN-CONTRACT-GUARD-1: the RETURN side ────────────────────────
  // A typed argument object proves nothing about the value coming back.

  it("fails when a jsonb return became a scalar in the database", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "integer";
    const r = check({ inv });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("database returns integer (expected number)");
  });

  it("fails when a void function's generated Returns is not undefined", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "void";
    const r = check({ inv });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("database returns void");
  });

  it("fails when a set-returning function is generated as a single object", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "TABLE(outcome text)";
    inv.functions[0]!.returnsSetof = true;
    inv.functions[0]!.returnColumns = [{ name: "outcome", type: "text" }];
    const types = MATCHING_TYPES.replace("Returns: Json", "Returns: { outcome: string }");
    const r = check({ inv, types });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("set-returning");
  });

  it("accepts a set-returning function generated as an array of rows", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "TABLE(outcome text)";
    inv.functions[0]!.returnsSetof = true;
    inv.functions[0]!.returnColumns = [{ name: "outcome", type: "text" }];
    const types = MATCHING_TYPES.replace("Returns: Json", "Returns: { outcome: string }[]");
    const r = check({ inv, types });
    expect(r.status).toBe(0);
  });

  it("fails when a returned COLUMN is missing from the generated Returns", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "TABLE(outcome text, run_id uuid)";
    inv.functions[0]!.returnsSetof = true;
    inv.functions[0]!.returnColumns = [
      { name: "outcome", type: "text" },
      { name: "run_id", type: "uuid" },
    ];
    const types = MATCHING_TYPES.replace("Returns: Json", "Returns: { outcome: string }[]");
    const r = check({ inv, types });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("returned column run_id is absent");
  });

  it("fails when a returned column's TYPE disagrees", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "TABLE(runs bigint)";
    inv.functions[0]!.returnsSetof = true;
    inv.functions[0]!.returnColumns = [{ name: "runs", type: "bigint" }];
    const types = MATCHING_TYPES.replace("Returns: Json", "Returns: { runs: string }[]");
    const r = check({ inv, types });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("maps to number but generated Returns say string");
  });

  it("ignores NULLABILITY differences, which neither side is authoritative about", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "TABLE(outcome text)";
    inv.functions[0]!.returnsSetof = true;
    inv.functions[0]!.returnColumns = [{ name: "outcome", type: "text" }];
    const types = MATCHING_TYPES.replace("Returns: Json", "Returns: { outcome: string | null }[]");
    const r = check({ inv, types });
    expect(r.status).toBe(0);
  });

  it("FAILS CLOSED on a Postgres return type with no TypeScript mapping", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "some_custom_domain";
    const r = check({ inv });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("no TypeScript mapping");
    expect(r.stderr).toContain("return-compatibility manifest");
  });

  it("accepts an unmapped return type ONLY when the compatibility manifest declares it", () => {
    const inv = inventory();
    inv.functions[0]!.returns = "some_custom_domain";
    const r = check({
      inv,
      compat: {
        unmappedReturnTypes: [
          { pgType: "some_custom_domain", generatedAs: "Json", reason: "reviewed" },
        ],
      },
    });
    expect(r.status).toBe(0);
  });

  it("fails when the compatibility manifest is stale", () => {
    const r = check({
      compat: {
        unmappedReturnTypes: [{ pgType: "never_returned", generatedAs: "Json", reason: "old" }],
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("the manifest is stale");
  });

  // ── Result-flow enforcement ─────────────────────────────────────────────

  it("fails a HANDWRITTEN result cast", () => {
    const r = check({
      calls: callers([
        callWithResult({
          kind: "cast",
          handwritten: ["{ ok: boolean; applied: boolean; reason: string }"],
          passedTo: [],
        }),
      ]),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("asserted with a handwritten type");
  });

  it("fails a production caller that binds its result with NO contract", () => {
    const r = check({ calls: callers([callWithResult({ kind: "inferred", passedTo: [] })]) });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("binds its result with no contract");
  });

  it("accepts a production caller that annotates its result with a generated contract", () => {
    const r = check({
      calls: callers([
        callWithResult({ kind: "contract", annotations: ['RpcRows<"apply_business_upgrade">'], passedTo: [] }),
      ]),
    });
    expect(r.status).toBe(0);
  });

  it("does NOT require a fake variable when the result is intentionally ignored", () => {
    const r = check({ calls: callers([callWithResult({ kind: "ignored", passedTo: [] })]) });
    expect(r.status).toBe(0);
  });

  it("never counts an unapproved callee (e.g. expect) as validation", () => {
    const r = check({
      calls: callers([callWithResult({ kind: "validated", passedTo: ["expect"] })]),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("binds its result with no contract");
  });

  it("requires RUNTIME validation for a high-risk result — typing alone is not enough", () => {
    const r = check({
      calls: callers([
        callWithResult({ kind: "contract", annotations: ['RpcReturns<"apply_business_upgrade">'], passedTo: [] }),
      ]),
      contracts: { ...DEFAULT_CONTRACTS, requireRuntimeValidation: ["apply_business_upgrade"] },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("must be validated at runtime");
  });

  it("accepts a high-risk result that IS runtime-validated", () => {
    const r = check({
      contracts: { ...DEFAULT_CONTRACTS, requireRuntimeValidation: ["apply_business_upgrade"] },
    });
    expect(r.status).toBe(0);
  });

  it("lets an explicit exemption cover a cast, and fails when the exemption is stale", () => {
    const exemption = {
      file: "repositories/accountBilling.ts",
      rpc: "apply_business_upgrade",
      reason: "reviewed",
      expectedHandling: "documented",
    };
    const covered = check({
      calls: callers([callWithResult({ kind: "cast", handwritten: ["X"], passedTo: [] })]),
      contracts: { ...DEFAULT_CONTRACTS, exemptions: [exemption] },
    });
    expect(covered.status).toBe(0);

    const stale = check({
      contracts: {
        ...DEFAULT_CONTRACTS,
        exemptions: [{ ...exemption, file: "repositories/gone.ts" }],
      },
    });
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toContain("the manifest is stale");
  });

  it("fails closed when the result-contract manifest is missing", () => {
    const r = check({ omit: ["contracts"] });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("result-contract manifest missing");
  });
});

describe("rpc-signature-guard callers — real AST extraction over the real repository", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rpc-callers-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("extracts every .rpc() call site and classifies each as resolved or unresolved", () => {
    const out = join(dir, "callers.json");
    const r = spawnSync(process.execPath, [GUARD, "callers", "--out", out], { encoding: "utf8", cwd: ROOT });
    expect(r.status).toBe(0);
    const result = JSON.parse(readFileSync(out, "utf8"));

    expect(result.calls.length).toBeGreaterThan(20);
    // Every call is classified — a call that is neither resolved nor given a
    // reason would be the silent skip this guard forbids.
    for (const c of result.calls) {
      expect(typeof c.file).toBe("string");
      expect(typeof c.line).toBe("number");
      if (c.resolved) expect(Array.isArray(c.argNames)).toBe(true);
      else expect(typeof c.reason).toBe("string");
    }

    // The RPC that caused the original drift is statically resolved from the
    // production repository, INCLUDING through its `satisfies` contract.
    const prod = result.calls.filter(
      (c: { file: string; rpc?: string }) =>
        c.file === "repositories/accountBilling.ts" && c.rpc === "apply_business_upgrade",
    );
    expect(prod).toHaveLength(1);
    expect(prod[0].resolved).toBe(true);
    expect(prod[0].argNames).toContain("p_ai_credits_limit");

    // And the test-side call sites resolve THROUGH a spread of a file-local
    // const — the exact shape the stale suites used.
    const testCalls = result.calls.filter(
      (c: { file: string; resolved: boolean }) =>
        c.file === "tests/integration/billing/apply-business-upgrade.test.ts" && c.resolved,
    );
    expect(testCalls.length).toBeGreaterThan(0);
    for (const c of testCalls) expect(c.argNames).toContain("p_ai_credits_limit");
  });

  it("every unresolved call site in the repository is declared in the committed manifest", () => {
    const out = join(dir, "callers.json");
    spawnSync(process.execPath, [GUARD, "callers", "--out", out], { encoding: "utf8", cwd: ROOT });
    const result = JSON.parse(readFileSync(out, "utf8"));
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "scripts/ci/rpc-dynamic-callers.json"), "utf8"));

    const declared = new Map<string, number>(
      manifest.unresolvedCallers.map((d: { file: string; unresolvedCount: number }) => [d.file, d.unresolvedCount]),
    );
    const actual = new Map<string, number>();
    for (const c of result.calls) {
      if (!c.resolved) actual.set(c.file, (actual.get(c.file) ?? 0) + 1);
    }
    expect([...actual.entries()].sort()).toEqual([...declared.entries()].sort());
    // Every declared entry carries the contract fields that make it reviewable.
    for (const entry of manifest.unresolvedCallers) {
      expect(entry.rpcs.length).toBeGreaterThan(0);
      expect(entry.reason).toBeTruthy();
      expect(entry.argumentCoverage).toBeTruthy();
    }
  });
});
