/**
 * @jest-environment node
 *
 * Guidance subsystem boundaries (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 * Proves: Hermes cannot mutate workflows (no service-guidance file imports a mutation / repo /
 * service-role / DB path); the fallback policy stays OFF (no broad OpenAI fallback wired).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decideGuidanceFallback, isHermesOpenAiFallbackEnabled, HERMES_OPENAI_FALLBACK_FLAG } from "@/services/ai-guidance/guidanceFallbackPolicy";

const DIR = resolve(process.cwd(), "services/ai-guidance");

const FORBIDDEN = [
  /repositories\//,
  /updateDraftDefinition|applyRepairPatch|executeWorkflowPatch|saveDraftDefinition|createWorkflow/,
  /lifecycleOrchestrator|activateWorkflow|deactivateWorkflow|registerTrigger|runWorkflow/,
  /serviceRoleClient|SUPABASE_SERVICE_ROLE|@\/utils\/supabase|supabase\.from/,
];

describe("ai-guidance — no workflow mutation / DB / service-role surface", () => {
  it("no service-guidance source file imports a mutation, repository, DB, or service-role path", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      for (const pat of FORBIDDEN) {
        expect({ file: f, matched: pat.test(src) }).toEqual({ file: f, matched: false });
      }
    }
  });
});

describe("guidance fallback policy — broad fallback NOT wired", () => {
  const savedFlag = process.env[HERMES_OPENAI_FALLBACK_FLAG];
  afterEach(() => { if (savedFlag === undefined) delete process.env[HERMES_OPENAI_FALLBACK_FLAG]; else process.env[HERMES_OPENAI_FALLBACK_FLAG] = savedFlag; });

  it("defaults OFF — no fallback for any unavailable reason", () => {
    delete process.env[HERMES_OPENAI_FALLBACK_FLAG];
    expect(isHermesOpenAiFallbackEnabled()).toBe(false);
    for (const reason of ["PROVIDER_NOT_CONFIGURED", "PROVIDER_ERROR", "TIMEOUT", "INVALID_RESPONSE"] as const) {
      expect(decideGuidanceFallback({ hermesUnavailableReason: reason }).useFallback).toBe(false);
    }
  });

  it("flag ON but seam not confirmed clean → still no fallback", () => {
    process.env[HERMES_OPENAI_FALLBACK_FLAG] = "true";
    expect(decideGuidanceFallback({ hermesUnavailableReason: "TIMEOUT" }).useFallback).toBe(false);
  });

  it("PROVIDER_DISABLED never falls back, even with flag + clean seam", () => {
    process.env[HERMES_OPENAI_FALLBACK_FLAG] = "true";
    expect(decideGuidanceFallback({ hermesUnavailableReason: "PROVIDER_DISABLED", seamClean: true }).useFallback).toBe(false);
  });

  it("only flag ON + explicit clean seam would enable fallback (wiring exists, unused today)", () => {
    process.env[HERMES_OPENAI_FALLBACK_FLAG] = "true";
    expect(decideGuidanceFallback({ hermesUnavailableReason: "TIMEOUT", seamClean: true }).useFallback).toBe(true);
  });
});
