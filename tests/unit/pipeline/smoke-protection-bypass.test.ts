/**
 * @jest-environment node
 *
 * V2-DEV-SMOKE-PROTECTION-BYPASS-1 — automated smoke passes Vercel
 * Authentication on the protected dev Preview via the supported
 * Protection Bypass header, without weakening protection and without the
 * secret ever reaching source, logs, or artifacts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SECRET_VAR = "VERCEL_AUTOMATION_BYPASS_SECRET";

function withEnv<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env[SECRET_VAR];
  if (value === undefined) delete process.env[SECRET_VAR];
  else process.env[SECRET_VAR] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[SECRET_VAR];
    else process.env[SECRET_VAR] = prev;
  }
}

/* eslint-disable @typescript-eslint/no-require-imports */
function loadHelpers() {
  jest.resetModules();
  return require("@/tests/smoke/helpers/env") as typeof import("../../smoke/helpers/env");
}

describe("vercelBypassHeaders — Playwright context access to the protected preview", () => {
  it("returns the supported bypass + set-cookie headers when the secret is present", () => {
    withEnv("synthetic-bypass-value", () => {
      const headers = loadHelpers().vercelBypassHeaders();
      expect(headers).toEqual({
        "x-vercel-protection-bypass": "synthetic-bypass-value",
        "x-vercel-set-bypass-cookie": "true",
      });
    });
  });

  it("returns undefined when no secret is configured (unprotected origins unchanged)", () => {
    withEnv(undefined, () => {
      expect(loadHelpers().vercelBypassHeaders()).toBeUndefined();
      expect(loadHelpers().vercelProtectionBypass()).toBeUndefined();
    });
  });

  it("treats a blank value as absent (fail closed, not an empty header)", () => {
    withEnv("   ", () => {
      expect(loadHelpers().vercelBypassHeaders()).toBeUndefined();
    });
  });
});

describe("smoke config wiring (text pins — the config imports @playwright/test)", () => {
  const config = readFileSync(resolve(__dirname, "../../../playwright.smoke.config.ts"), "utf8");

  it("feeds the bypass headers into the browser-context via extraHTTPHeaders", () => {
    expect(config).toContain("extraHTTPHeaders: vercelBypassHeaders()");
  });

  it("forces traces OFF whenever a bypass is active — headers must never reach artifacts", () => {
    expect(config).toContain('trace: vercelProtectionBypass() ? "off" : "retain-on-failure"');
  });

  it("contains no literal secret material and never logs the value", () => {
    expect(config).not.toMatch(/x-vercel-protection-bypass["']?\s*:\s*["'][^"']+["']/);
    for (const file of ["../../smoke/helpers/env.ts"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8");
      expect(src).not.toMatch(/console\.(log|info|warn|error)/);
    }
  });
});
