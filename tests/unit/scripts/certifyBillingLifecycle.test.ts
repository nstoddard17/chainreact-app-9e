/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-3 — safety properties of the Stripe certification
 * script (`npm run certify:billing`).
 *
 * This script creates and cancels real Stripe subscriptions. Its refusal gate is therefore
 * a safety control, not a convenience, and it is asserted two ways:
 *   1. BEHAVIOURALLY — the script is actually executed in a child process with hostile env
 *      combinations, and must exit(2) before making any network request;
 *   2. STRUCTURALLY — its source may not contain a bypass, may not touch `vercel.json`, and
 *      may not enable the purge flag.
 *
 * A mocked assertion would not be worth much here: the whole point is that the real binary
 * refuses. Note these runs make NO Stripe call — every case terminates at the gate, which is
 * exactly the property under test.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(process.cwd(), "scripts/certify-billing-lifecycle.mjs");

interface RunResult {
  status: number;
  output: string;
}

/**
 * Run the script with a controlled environment. `cwd` is a scratch dir with no .env files so
 * the script's own env loading cannot pick up developer credentials and turn a refusal case
 * into a live run.
 */
function runScript(env: Record<string, string | undefined>): RunResult {
  try {
    const output = execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, STRIPE_SECRET_KEY: undefined, ...env },
      cwd: tmpdir(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return { status: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? -1,
      output: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    };
  }
}

describe("refusal gate (executed, not mocked)", () => {
  it("exits 2 with no key — before any network request", () => {
    const r = runScript({ STRIPE_SECRET_KEY: undefined });
    expect(r.status).toBe(2);
    expect(r.output).toMatch(/REFUSED/);
    expect(r.output).toMatch(/not set/i);
    // Never reached the certification body.
    expect(r.output).not.toMatch(/PASS|FAIL/);
  });

  it("exits 2 for a LIVE key — before any network request", () => {
    const r = runScript({ STRIPE_SECRET_KEY: "sk_live_certification_guard_probe" });
    expect(r.status).toBe(2);
    expect(r.output).toMatch(/REFUSED/);
    expect(r.output).toMatch(/not a TEST-mode key/i);
    expect(r.output).toMatch(/no override/i);
    expect(r.output).not.toMatch(/PASS|FAIL/);
  });

  it("exits 2 for a restricted LIVE key too", () => {
    const r = runScript({ STRIPE_SECRET_KEY: "rk_live_certification_guard_probe" });
    expect(r.status).toBe(2);
    expect(r.output).toMatch(/REFUSED/);
  });

  it("does not echo the supplied key in any refusal output", () => {
    const probe = "sk_live_SHOULD_NEVER_BE_ECHOED_9999";
    const r = runScript({ STRIPE_SECRET_KEY: probe });
    expect(r.output).not.toContain(probe);
    expect(r.output).not.toContain("SHOULD_NEVER_BE_ECHOED");
  });

  it("PROVIDER-integration Stripe credentials cannot satisfy platform billing", () => {
    // `.env.local` legitimately holds STRIPE_CLIENT_ID / STRIPE_CLIENT_SECRET /
    // STRIPE_WEBHOOK_SECRET for the WORKFLOW provider. Those must never be mistaken for
    // platform-billing config: with only those set, the script still refuses.
    const r = runScript({
      STRIPE_SECRET_KEY: undefined,
      STRIPE_CLIENT_ID: "ca_provider_client_id",
      STRIPE_CLIENT_SECRET: "sk_provider_oauth_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_provider_endpoint_secret",
    });
    expect(r.status).toBe(2);
    expect(r.output).toMatch(/REFUSED/);
  });
});

describe("structural safety", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("only a test-mode key can proceed past the gate", () => {
    expect(code).toMatch(/\^\(sk\|rk\)_test_/);
    // Exactly one place decides, and it exits rather than warning.
    expect(code).toMatch(/process\.exit\(2\)/);
  });

  it("has no override / force / skip-gate escape hatch", () => {
    expect(code).not.toMatch(/FORCE|--force|ALLOW_LIVE|SKIP_GUARD|process\.argv/i);
  });

  it("cannot enable purging", () => {
    // Targets BEHAVIOUR, not the word: the script legitimately names the purge guard in a
    // human-readable check label ("a canceled subscription reads back as terminal (purge may
    // proceed)"). What must be absent is any ability to flip the flag or invoke purge code.
    expect(code).not.toMatch(/ENABLE_ACCOUNT_PURGE_CRON/);
    expect(code).not.toMatch(/purgeAccount|purgeDuePendingAccounts|purge-pending-deletions/);
    // It never writes env at all, so it cannot turn the flag on for a later process.
    expect(code).not.toMatch(/process\.env\.[A-Z_]+\s*=/);
  });

  it("cannot modify vercel.json or any repo config", () => {
    expect(code).not.toMatch(/vercel\.json/);
    expect(code).not.toMatch(/writeFileSync|appendFileSync|rmSync|unlinkSync/);
  });

  it("reads env files but never writes one", () => {
    expect(code).toMatch(/readFileSync/);
    expect(code).not.toMatch(/writeFile/);
  });

  it("prints only truncated id suffixes", () => {
    // The `tail` helper is the only id formatter, and it emits at most the last 4 chars.
    expect(code).toMatch(/id\.slice\(-4\)/);
  });

  it("cleans up every object it creates", () => {
    // Customers deleted and products deactivated in a finally block.
    expect(code).toMatch(/finally/);
    expect(code).toMatch(/\/v1\/customers\/\$\{id\}/);
    expect(code).toMatch(/active:\s*["']false["']/);
  });

  it("targets the platform Stripe surface, not the workflow provider's OAuth flow", () => {
    expect(code).toMatch(/STRIPE_SECRET_KEY/);
    expect(code).not.toMatch(/STRIPE_CLIENT_ID|STRIPE_CLIENT_SECRET/);
  });
});

describe("npm wiring", () => {
  it("is exposed as certify:billing", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts["certify:billing"]).toBe(
      "node scripts/certify-billing-lifecycle.mjs",
    );
  });
});
