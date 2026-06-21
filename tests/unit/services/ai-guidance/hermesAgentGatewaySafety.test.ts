/**
 * @jest-environment node
 *
 * Hermes Agent gateway — boundary/safety guards (HERMES-AGENT-PROD-CLIENT).
 * Proves: the gateway source contains NO direct-model path (no direct Nous, no chat/completions
 * model client, no `new OpenAI`), and NO browser/client (`"use client"`) module imports the
 * server-only gateway client.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const GATEWAY_DIR = resolve(process.cwd(), "services/ai-guidance/gateway");

describe("gateway source — no direct model / direct-Nous path", () => {
  it("no gateway file references a hosted-model API directly", () => {
    const files = readdirSync(GATEWAY_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(2);
    // Patterns target real USAGE (imports / URLs / env reads) — not documentation prose.
    const forbidden = [
      /nousresearch|inference-api\.nousresearch/i, // direct Nous endpoint string
      /["'`][^"'`]*chat\/completions/, // a chat/completions URL/path literal
      /new OpenAI\b/,
      /api\.openai\.com/,
      /@\/services\/ai\/modelClients/, // importing a direct model client
      // Reading any Render-only secret in ChainReact code (those live only on Render).
      /process\.env(\.|\[\s*["'])\s*(OPENAI_API_KEY|API_SERVER_KEY|HERMES_AGENT_INTERNAL_TOKEN|HERMES_AGENT_PRIVATE_URL)/,
    ];
    for (const f of files) {
      const src = readFileSync(join(GATEWAY_DIR, f), "utf8");
      for (const pat of forbidden) {
        expect({ file: f, matched: pat.test(src) }).toEqual({ file: f, matched: false });
      }
    }
  });
});

describe("gateway client — no browser/client module imports it", () => {
  const ROOTS = ["app", "components", "hooks", "stores"].map((d) => resolve(process.cwd(), d));
  const GATEWAY_IMPORT = /ai-guidance\/gateway/;

  function walk(dir: string): string[] {
    let out: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const e of entries) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) out = out.concat(walk(p));
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  }

  it("no file with a \"use client\" directive imports the server-only gateway", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        const head = src.slice(0, 200);
        const isClient = /^\s*["']use client["']/.test(head) || /\n\s*["']use client["']/.test(head);
        if (isClient && GATEWAY_IMPORT.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
