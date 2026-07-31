/**
 * @jest-environment node
 *
 * SUPABASE-ENV-PIPELINE-1 — failure-path proof for the environment-target
 * contract (scripts/lib/env-target.mjs) AND the real guarded scripts.
 *
 * These tests spawn the actual modules/scripts in a child Node process with a
 * hostile environment and assert they FAIL CLOSED — not that a mock of them
 * would. No network, no database: every scenario must be rejected before any
 * connection is attempted.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "../../..");
const PROD_REF = "qcepijemjlkssfkvzlio";
const V1_REF = "xzwsdwllmrnrgbltibxt";
const DEV_REF = "abcdefghij0123456789"; // synthetic 20-char ref
const DEV_DB_URL = `postgresql://postgres.${DEV_REF}:pw@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;
const PROD_DB_URL = `postgresql://postgres.${PROD_REF}:pw@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

/** Run resolveDbTarget in a real Node process; returns the parsed result. */
function resolveTarget(
  env: Record<string, string>,
  opts: { expectedTarget: string; requireConfirm?: boolean },
): { ok: boolean; target: string | null; ref: string | null; reason: string } {
  const code = `import("./scripts/lib/env-target.mjs").then((m) => {
    const r = m.resolveDbTarget(process.env, ${JSON.stringify(opts)});
    console.log("RESULT:" + JSON.stringify(r));
  });`;
  const out = spawnSync(process.execPath, ["-e", code], {
    cwd: REPO,
    encoding: "utf8",
    // Strip repo-level env leakage so each case controls its own world.
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env },
  });
  const line = out.stdout.split(/\r?\n/).find((l) => l.startsWith("RESULT:"));
  if (!line) throw new Error(`no RESULT line; stderr=${out.stderr}`);
  return JSON.parse(line.slice("RESULT:".length));
}

/** Run a real guarded script; returns {status, output}. */
function runScript(script: string, env: Record<string, string>): { status: number | null; output: string } {
  const out = spawnSync(process.execPath, [script], {
    cwd: REPO,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env },
    timeout: 30_000,
  });
  return { status: out.status, output: `${out.stdout}\n${out.stderr}` };
}

describe("resolveDbTarget — fail-closed matrix", () => {
  it("rejects a missing CHAINREACT_DB_TARGET (no guessing)", () => {
    const r = resolveTarget({ SUPABASE_DEV_PROJECT_REF: DEV_REF }, { expectedTarget: "development" });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("CHAINREACT_DB_TARGET");
  });

  it("rejects an unknown target value", () => {
    const r = resolveTarget(
      { CHAINREACT_DB_TARGET: "staging", SUPABASE_DEV_PROJECT_REF: DEV_REF },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not a known environment");
  });

  it("rejects a declared target that contradicts the command's target (ambiguity)", () => {
    const r = resolveTarget(
      { CHAINREACT_DB_TARGET: "local", SUPABASE_DEV_PROJECT_REF: DEV_REF },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("ambiguous");
  });

  it("NEVER resolves production through the dev-tooling API", () => {
    const r = resolveTarget({ CHAINREACT_DB_TARGET: "production" }, { expectedTarget: "production" });
    expect(r.ok).toBe(false);
  });

  it("rejects the PRODUCTION ref as the development project", () => {
    const r = resolveTarget(
      { CHAINREACT_DB_TARGET: "development", SUPABASE_DEV_PROJECT_REF: PROD_REF },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("PRODUCTION");
  });

  it("rejects the V1 legacy ref as the development project", () => {
    const r = resolveTarget(
      { CHAINREACT_DB_TARGET: "development", SUPABASE_DEV_PROJECT_REF: V1_REF },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed dev ref", () => {
    const r = resolveTarget(
      { CHAINREACT_DB_TARGET: "development", SUPABASE_DEV_PROJECT_REF: "not-a-ref" },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a dev DB URL that targets PRODUCTION even when the declared ref is a dev ref", () => {
    const r = resolveTarget(
      {
        CHAINREACT_DB_TARGET: "development",
        SUPABASE_DEV_PROJECT_REF: DEV_REF,
        SUPABASE_DEV_DB_URL: PROD_DB_URL,
      },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(PROD_REF);
  });

  it("rejects an unparseable dev DB URL (ambiguous target)", () => {
    const r = resolveTarget(
      {
        CHAINREACT_DB_TARGET: "development",
        SUPABASE_DEV_PROJECT_REF: DEV_REF,
        SUPABASE_DEV_DB_URL: "postgresql://localhost:5432/foo",
      },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a mismatched SUPABASE_DEV_URL app ref", () => {
    const r = resolveTarget(
      {
        CHAINREACT_DB_TARGET: "development",
        SUPABASE_DEV_PROJECT_REF: DEV_REF,
        SUPABASE_DEV_URL: `https://${PROD_REF}.supabase.co`,
      },
      { expectedTarget: "development" },
    );
    expect(r.ok).toBe(false);
  });

  it("requires DEV_RESET_CONFIRM to equal the dev ref for destructive commands", () => {
    const base = {
      CHAINREACT_DB_TARGET: "development",
      SUPABASE_DEV_PROJECT_REF: DEV_REF,
      SUPABASE_DEV_DB_URL: DEV_DB_URL,
    };
    expect(resolveTarget(base, { expectedTarget: "development", requireConfirm: true }).ok).toBe(false);
    expect(
      resolveTarget(
        { ...base, DEV_RESET_CONFIRM: "yes" },
        { expectedTarget: "development", requireConfirm: true },
      ).ok,
    ).toBe(false);
    const ok = resolveTarget(
      { ...base, DEV_RESET_CONFIRM: DEV_REF },
      { expectedTarget: "development", requireConfirm: true },
    );
    expect(ok.ok).toBe(true);
    expect(ok.ref).toBe(DEV_REF);
  });

  it("accepts a fully-consistent development target", () => {
    const r = resolveTarget(
      {
        CHAINREACT_DB_TARGET: "development",
        SUPABASE_DEV_PROJECT_REF: DEV_REF,
        SUPABASE_DEV_DB_URL: DEV_DB_URL,
        SUPABASE_DEV_URL: `https://${DEV_REF}.supabase.co`,
      },
      { expectedTarget: "development" },
    );
    expect(r).toMatchObject({ ok: true, target: "development", ref: DEV_REF });
  });

  it("rejects target=local when the process points at a non-loopback Supabase", () => {
    const r = resolveTarget(
      { CHAINREACT_DB_TARGET: "local", NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` },
      { expectedTarget: "local" },
    );
    expect(r.ok).toBe(false);
  });

  it("accepts target=local on loopback", () => {
    const r = resolveTarget(
      { CHAINREACT_DB_TARGET: "local", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
      { expectedTarget: "local" },
    );
    expect(r.ok).toBe(true);
  });
});

describe("real script guards (spawned, no DB touched)", () => {
  it("dev:reset refuses the production ref outright", () => {
    const { status, output } = runScript("scripts/dev-reset.mjs", {
      CHAINREACT_DB_TARGET: "development",
      SUPABASE_DEV_PROJECT_REF: PROD_REF,
      SUPABASE_DEV_DB_URL: PROD_DB_URL,
      DEV_RESET_CONFIRM: PROD_REF,
    });
    expect(status).toBe(1);
    expect(output).toContain("ABORT");
    expect(output).toContain("PRODUCTION");
  });

  it("dev:reset refuses to run without an explicit target", () => {
    const { status, output } = runScript("scripts/dev-reset.mjs", {});
    expect(status).toBe(1);
    expect(output).toContain("CHAINREACT_DB_TARGET");
  });

  it("dev:reset refuses without the ref-retyped confirmation", () => {
    const { status, output } = runScript("scripts/dev-reset.mjs", {
      CHAINREACT_DB_TARGET: "development",
      SUPABASE_DEV_PROJECT_REF: DEV_REF,
      SUPABASE_DEV_DB_URL: DEV_DB_URL,
    });
    expect(status).toBe(1);
    expect(output).toContain("DEV_RESET_CONFIRM");
  });

  it("db:push:dev refuses a production-targeting DB URL", () => {
    const { status, output } = runScript("scripts/db-push-dev.mjs", {
      CHAINREACT_DB_TARGET: "development",
      SUPABASE_DEV_PROJECT_REF: DEV_REF,
      SUPABASE_DEV_DB_URL: PROD_DB_URL,
    });
    expect(status).toBe(1);
    expect(output).toContain("ABORT");
  });

  it("db:push:dev refuses when the DB URL is missing entirely", () => {
    const { status, output } = runScript("scripts/db-push-dev.mjs", {
      CHAINREACT_DB_TARGET: "development",
      SUPABASE_DEV_PROJECT_REF: DEV_REF,
    });
    expect(status).toBe(1);
    expect(output).toContain("SUPABASE_DEV_DB_URL");
  });

  it("dev:bootstrap refuses a non-loopback local target", () => {
    const { status, output } = runScript("scripts/dev-bootstrap.mjs", {
      CHAINREACT_DB_TARGET: "local",
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "dummy",
      DEV_BOOTSTRAP_PASSWORD: "synthetic-password-123",
    });
    expect(status).toBe(1);
    expect(output).toContain("ABORT");
  });

  it("dev:bootstrap requires a bootstrap password (never defaults)", () => {
    const { status, output } = runScript("scripts/dev-bootstrap.mjs", {
      CHAINREACT_DB_TARGET: "local",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "dummy",
    });
    expect(status).toBe(1);
    expect(output).toContain("DEV_BOOTSTRAP_PASSWORD");
  });
});
