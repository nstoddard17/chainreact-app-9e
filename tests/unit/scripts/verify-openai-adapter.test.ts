/**
 * @jest-environment node
 *
 * Tests for scripts/trash/verify-openai-adapter.ts (Slice 4.AI-34B).
 *
 * The script is a dev-only LIVE probe. These tests pin its safety properties
 * WITHOUT making a live call:
 *   1. it can never print the API key / Authorization header / Bearer token
 *      (static source scan of every console line),
 *   2. it reads the key server-side (never a NEXT_PUBLIC_ var) and gates on
 *      ENABLE_OPENAI_PROVIDER / --force,
 *   3. its pure summary helpers copy ONLY allow-listed, key-free fields and
 *      print arg SHAPE (never arg values).
 *
 * Importing the module does NOT fire main() — it is guarded on JEST_WORKER_ID,
 * which Jest sets in every worker. Only the pure helpers run here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatSafeSummary, toSafeSummary } from "@/scripts/trash/verify-openai-adapter";
import type { ModelResult } from "@/core/ai/modelTypes";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/trash/verify-openai-adapter.ts");
const SOURCE = readFileSync(SCRIPT_PATH, "utf8");
const CONSOLE_LINES = SOURCE.split(/\r?\n/).filter((line) => /console\./.test(line));

describe("no-secrets — static source scan", () => {
  it("has console output to scan (guards against a vacuous pass)", () => {
    expect(CONSOLE_LINES.length).toBeGreaterThan(0);
  });

  it("never references the apiKey identifier, Authorization header, or Bearer token on a console line", () => {
    for (const line of CONSOLE_LINES) {
      expect(line).not.toMatch(/apiKey/);
      expect(line).not.toMatch(/Bearer/i);
      expect(line).not.toMatch(/authorization/i);
      expect(line).not.toMatch(/OPENAI_API_KEY/);
    }
  });

  it("reads the key server-side via MODEL_API_KEY_ENV.openai and never a NEXT_PUBLIC_ var", () => {
    expect(SOURCE).toContain("MODEL_API_KEY_ENV.openai");
    expect(SOURCE).not.toMatch(/NEXT_PUBLIC_/);
  });

  it("gates execution on ENABLE_OPENAI_PROVIDER (isOpenAiProviderEnabled) or --force", () => {
    expect(SOURCE).toContain("isOpenAiProviderEnabled");
    expect(SOURCE).toContain("--force");
  });

  it("guards main() on JEST_WORKER_ID so importing under Jest never fires a live call", () => {
    expect(SOURCE).toContain("JEST_WORKER_ID");
  });

  it("goes through the normal factory abstraction (createModelClientForModel), not a direct adapter import", () => {
    expect(SOURCE).toContain("createModelClientForModel");
    expect(SOURCE).not.toContain("createOpenAiModelClient");
  });
});

describe("toSafeSummary / formatSafeSummary — only safe fields", () => {
  const success: ModelResult = {
    ok: true,
    modelId: "gpt-4.1-mini",
    feature: "discovery",
    text: '{"ok":true,"message":"adapter verified"}',
    finishReason: "stop",
    usage: { inputTokens: 98, outputTokens: 11 },
    latencyMs: 700,
  };
  const failure: ModelResult = {
    ok: false,
    modelId: "gpt-4.1",
    feature: "discovery",
    failureCode: "PROVIDER_ERROR",
    message: "OpenAI API error (HTTP 401): invalid_request_error",
    retryable: false,
    latencyMs: 42,
  };

  it("maps a success result to provider/tokens/finishReason/argShape (openai resolved via getModelById)", () => {
    const summary = toSafeSummary(success, "fast");
    expect(summary.success).toBe(true);
    expect(summary.provider).toBe("openai");
    expect(summary.inputTokens).toBe(98);
    expect(summary.outputTokens).toBe(11);
    expect(summary.finishReason).toBe("stop");
    expect(summary.argParsed).toBe(true);
    expect(summary.argShape).toBe("{ ok: boolean, message: string }");
  });

  it("maps a failure result to failureCode/retryable/message and omits token fields", () => {
    const summary = toSafeSummary(failure, "strong");
    expect(summary.success).toBe(false);
    expect(summary.failureCode).toBe("PROVIDER_ERROR");
    expect(summary.retryable).toBe(false);
    expect(summary.inputTokens).toBeUndefined();
    expect(summary.outputTokens).toBeUndefined();
    expect(summary.argShape).toBeUndefined();
  });

  it("prints the arg SHAPE, never the arg VALUES — a secret-shaped value in the result text never reaches output", () => {
    const leaky: ModelResult = { ...success, text: '{"ok":true,"token":"sk-LEAKME-secret"}' };
    const out = formatSafeSummary(toSafeSummary(leaky, "fast"));
    expect(out).not.toContain("sk-LEAKME-secret");
    expect(out).toContain("{ ok: boolean, token: string }");
  });
});
