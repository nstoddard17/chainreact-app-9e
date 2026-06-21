/**
 * @jest-environment node
 *
 * React Agent capabilities submodule — boundary/safety guards (HERMES-AGENT-CAPABILITY).
 * Proves the workflow-guidance capability stays advisory + server-only: NO workflow-mutation
 * service/repository import, NO direct model vendor / Nous / private Hermes / Render-secret access,
 * and NO browser/client (`"use client"`) module imports the server-only capability.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "services/ai/reactAgent/capabilities");

describe("reactAgent capabilities — no mutation / direct-model / Render-secret surface", () => {
  it("no capability source references a forbidden surface", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const forbidden = [
      // workflow mutation / persistence
      /saveDraftDefinition|updateWorkflow|applyWorkflowPatch|lifecycleOrchestrator|activateWorkflow|deleteWorkflow|createWorkflow|repositories\//,
      // direct model vendor / Nous / private model API
      /nousresearch|inference-api\.nousresearch/i,
      /["'`][^"'`]*chat\/completions/,
      /new OpenAI\b/,
      /api\.openai\.com/,
      /@\/services\/ai\/modelClients/,
      // service-role / DB
      /service[_-]?role|SUPABASE_SERVICE_ROLE|@\/utils\/supabase|supabase\.from/i,
      // Render-only secrets must never be read in ChainReact code
      /process\.env(\.|\[\s*["'])\s*(OPENAI_API_KEY|API_SERVER_KEY|HERMES_AGENT_INTERNAL_TOKEN|HERMES_AGENT_PRIVATE_URL)/,
    ];
    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      for (const pat of forbidden) {
        expect({ file: f, matched: pat.test(src) }).toEqual({ file: f, matched: false });
      }
    }
  });
});

describe("reactAgent capabilities — no browser/client module imports the server-only capability", () => {
  const ROOTS = ["app", "components", "hooks", "stores"].map((d) => resolve(process.cwd(), d));
  const CAP_IMPORT = /reactAgent\/capabilities/;

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

  it('no "use client" file imports the capability', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        const head = src.slice(0, 200);
        const isClient = /^\s*["']use client["']/.test(head) || /\n\s*["']use client["']/.test(head);
        if (isClient && CAP_IMPORT.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
