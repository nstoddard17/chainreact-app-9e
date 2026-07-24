/** @jest-environment node */
import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import { resolveModelRoute } from "@/services/ai/processor/resolveModelRoute";

describe("resolveModelRoute (phase-1 env routing)", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = Object.values(AI_PROCESSOR_ENV);
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("routes to the configured provider", () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    process.env[AI_PROCESSOR_ENV.provider] = "first_party";
    const route = resolveModelRoute({
      feature: "document_analysis",
      tier: "strong",
      task: "analyze_document",
    });
    expect(route).toEqual({ provider: "first_party", tier: "strong" });
  });

  it("defaults to gateway when unset/disabled (client enforces DISABLED)", () => {
    const route = resolveModelRoute({
      feature: "data_transform",
      tier: "fast",
      task: "transform_data",
    });
    expect(route).toEqual({ provider: "gateway", tier: "fast" });
  });

  it("accepts feature/tier/task — the future routing dimensions — without a vendor name in sight", () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    process.env[AI_PROCESSOR_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[AI_PROCESSOR_ENV.gatewayToken] = "tok";
    const route = resolveModelRoute({
      feature: "schema_suggestion",
      tier: "fast",
      task: "suggest_schema",
    });
    expect(route.provider).toBe("gateway");
    // No vendor/model identifiers leak into the workflow-facing route today.
    expect(route.modelHint).toBeUndefined();
  });
});
