/**
 * @jest-environment node
 *
 * Tests for `dollarsToCents` — Stripe wire-format amount conversion.
 */
import { dollarsToCents } from "@/integrations/_shared/stripe/amount";

describe("dollarsToCents", () => {
  it("converts whole-dollar amounts", () => {
    expect(dollarsToCents(20)).toBe(2000);
    expect(dollarsToCents(1)).toBe(100);
    expect(dollarsToCents(0)).toBe(0);
  });

  it("converts fractional-dollar amounts with rounding", () => {
    // 20.99 * 100 = 2098.9999999999995 in JS floating-point.
    // parseInt would truncate to 2098. Math.round gives the right
    // 2099 for "$20.99".
    expect(dollarsToCents(20.99)).toBe(2099);
    expect(dollarsToCents(0.5)).toBe(50);
    expect(dollarsToCents(0.01)).toBe(1);
  });

  it("accepts string input (workflow variable resolution edge case)", () => {
    // V2 variable resolution often yields strings for declared-number
    // fields. The helper tolerates this rather than forcing every
    // caller to parseFloat first.
    expect(dollarsToCents("20.99")).toBe(2099);
    expect(dollarsToCents("100")).toBe(10000);
  });

  it("uses Math.round (away-from-zero half rule) for clean inputs", () => {
    // 0.005 * 100 = 0.5 exactly → Math.round → 1 (away-from-zero).
    expect(dollarsToCents(0.005)).toBe(1);
    // Workflow authors who hit the floating-point rounding edge cases
    // (e.g. dollar values like 1.235 → cents output may differ by 1
    // depending on IEEE 754 representation) should pre-quantize their
    // amounts to cents-resolvable values upstream. Same behavior as V1.
  });

  it("throws on NaN", () => {
    expect(() => dollarsToCents(NaN)).toThrow(/not a finite number/);
  });

  it("throws on Infinity / -Infinity", () => {
    expect(() => dollarsToCents(Infinity)).toThrow(/not a finite number/);
    expect(() => dollarsToCents(-Infinity)).toThrow(/not a finite number/);
  });

  it("throws on non-numeric strings", () => {
    expect(() => dollarsToCents("not-a-number")).toThrow(/not a finite number/);
    expect(() => dollarsToCents("")).toThrow(/not a finite number/);
  });

  it("throws on negative amounts (Stripe rejects these)", () => {
    // Failing here gives a typed handler-side error rather than a
    // Stripe 400. Surface the violation at the schema layer.
    expect(() => dollarsToCents(-1)).toThrow(/negative/);
    expect(() => dollarsToCents("-5.50")).toThrow(/negative/);
  });

  it("returns integer (no fractional cents in output)", () => {
    const result = dollarsToCents(20.99);
    expect(Number.isInteger(result)).toBe(true);
  });
});
