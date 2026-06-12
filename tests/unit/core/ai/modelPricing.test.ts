/**
 * @jest-environment node
 *
 * Slice 4.AI-35D — model pricing + cost estimation helper.
 *
 * Pins: the confirmed Sonnet price reproduces the AI-COST-INCIDENT-1 figure
 * ($0.9245 for 271,359 in / 7,364 out), unknown models return null (never a
 * guessed cost), and edge cases (zero/negative/NaN tokens, missing id) don't
 * throw.
 */
import {
  MODEL_PRICING,
  estimateModelCostMicros,
  estimateModelCostUsd,
  formatUsd,
  getModelPrice,
} from "@/core/ai/modelPricing";

describe("getModelPrice", () => {
  it("returns the confirmed Sonnet 4.6 price", () => {
    expect(getModelPrice("claude-sonnet-4-6")).toEqual({
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
    });
  });

  it("returns undefined for unknown / unpriced models and undefined id", () => {
    expect(getModelPrice("gpt-4.1-mini")).toBeUndefined();
    expect(getModelPrice("claude-haiku-4-5-20251001")).toBeUndefined();
    expect(getModelPrice(undefined)).toBeUndefined();
  });

  it("only lists models with a confirmed price (no guessed OpenAI/Haiku rows)", () => {
    expect(Object.keys(MODEL_PRICING)).toEqual(["claude-sonnet-4-6"]);
  });
});

describe("estimateModelCostUsd", () => {
  it("reproduces the AI-COST-INCIDENT-1 Sonnet figure", () => {
    const est = estimateModelCostUsd("claude-sonnet-4-6", {
      inputTokens: 271_359,
      outputTokens: 7_364,
    });
    expect(est).not.toBeNull();
    // 271359/1e6*3 + 7364/1e6*15 = 0.814077 + 0.11046 = 0.924537
    expect(est!.totalCostUsd).toBeCloseTo(0.924537, 6);
    expect(est!.inputCostUsd).toBeCloseTo(0.814077, 6);
    expect(est!.outputCostUsd).toBeCloseTo(0.11046, 6);
    expect(est!.modelId).toBe("claude-sonnet-4-6");
    expect(est!.inputTokens).toBe(271_359);
    expect(est!.outputTokens).toBe(7_364);
  });

  it("costs a single narrowed call (~10.8k in) at ~Sonnet narrowed rate", () => {
    const est = estimateModelCostUsd("claude-sonnet-4-6", { inputTokens: 10_820, outputTokens: 392 });
    expect(est!.totalCostUsd).toBeCloseTo(0.03834, 5);
  });

  it("returns null for an unpriced model (caller shows tokens only — never a guess)", () => {
    expect(estimateModelCostUsd("gpt-4.1-mini", { inputTokens: 50, outputTokens: 10 })).toBeNull();
    expect(estimateModelCostUsd(undefined, { inputTokens: 50, outputTokens: 10 })).toBeNull();
  });

  it("treats missing/negative/NaN token halves as zero and never throws", () => {
    expect(estimateModelCostUsd("claude-sonnet-4-6", undefined)).toEqual({
      modelId: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
    });
    const neg = estimateModelCostUsd("claude-sonnet-4-6", { inputTokens: -5, outputTokens: Number.NaN });
    expect(neg!.inputTokens).toBe(0);
    expect(neg!.outputTokens).toBe(0);
    expect(neg!.totalCostUsd).toBe(0);
  });
});

describe("estimateModelCostMicros (AI-CREDITS-2 — ledger unit)", () => {
  it("returns integer micro-USD for a priced model", () => {
    // 0.924537 USD → 924537 micros.
    expect(
      estimateModelCostMicros("claude-sonnet-4-6", { inputTokens: 271_359, outputTokens: 7_364 }),
    ).toBe(924_537);
  });

  it("returns null for an unpriced model or missing id (recorded as null, never guessed)", () => {
    expect(estimateModelCostMicros("gpt-4.1-mini", { inputTokens: 50, outputTokens: 10 })).toBeNull();
    expect(estimateModelCostMicros(undefined, { inputTokens: 50, outputTokens: 10 })).toBeNull();
  });

  it("is a whole integer (the column is integer micros)", () => {
    const micros = estimateModelCostMicros("claude-sonnet-4-6", {
      inputTokens: 10_820,
      outputTokens: 392,
    });
    expect(micros).not.toBeNull();
    expect(Number.isInteger(micros)).toBe(true);
  });
});

describe("formatUsd", () => {
  it("formats to 4 decimal places with a leading $", () => {
    expect(formatUsd(0.924537)).toBe("$0.9245");
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(0.1227)).toBe("$0.1227");
  });
});
