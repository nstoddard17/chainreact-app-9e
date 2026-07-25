/**
 * ANALYTICS-CONNECTED-DATA-CD-4B — canonical decimal-safe money helpers.
 * These back every provider money path, so the failure they prevent (binary
 * float drift over a long scan) is pinned directly.
 */
import {
  currencyDecimals,
  majorUnitsToMinor,
  minorUnitsToMajor,
  roundToCurrency,
} from "@/core/analytics/money";

describe("currencyDecimals", () => {
  it.each([
    ["usd", 2], ["USD", 2], ["eur", 2], ["gbp", 2],
    ["jpy", 0], ["krw", 0], ["clp", 0],
    ["kwd", 3], ["bhd", 3], ["JOD", 3],
    ["zzz", 2], // unknown → the 2-decimal default
  ])("%s has %i minor-unit decimals", (currency, expected) => {
    expect(currencyDecimals(currency)).toBe(expected);
  });
});

describe("majorUnitsToMinor", () => {
  it.each([
    [362.07, "usd", 36207],
    [0.1, "usd", 10],
    [0.2, "usd", 20],
    [1.005, "usd", 101], // half-up at the cent, despite 1.005*100 < 100.5 in float
    [75.005, "usd", 7501], // …and the same direction when float lands above
    [1500, "jpy", 1500], // zero-decimal: unchanged
    [12.345, "kwd", 12345], // three-decimal
    [0, "usd", 0],
    [-25.5, "usd", -2550], // credits keep their sign
  ])("converts %p %s to %i minor units", (value, currency, expected) => {
    expect(majorUnitsToMinor(value, currency)).toBe(expected);
  });

  it("rejects a non-finite amount rather than coercing it to zero", () => {
    expect(majorUnitsToMinor(Number.NaN, "usd")).toBeNull();
    expect(majorUnitsToMinor(Number.POSITIVE_INFINITY, "usd")).toBeNull();
  });

  it("rejects an amount beyond exact integer arithmetic", () => {
    expect(majorUnitsToMinor(1e15, "usd")).toBeNull();
  });
});

describe("integer accumulation vs naive float addition", () => {
  it("keeps 0.1 + 0.2 exact where float addition does not", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the failure being prevented
    const minor = majorUnitsToMinor(0.1, "usd")! + majorUnitsToMinor(0.2, "usd")!;
    expect(minorUnitsToMajor(minor, "usd")).toBe(0.3);
  });

  it("stays exact across 2,000 fractional amounts", () => {
    let minor = 0;
    let naive = 0;
    for (let i = 0; i < 2000; i++) {
      minor += majorUnitsToMinor(0.07, "usd")!;
      naive += 0.07;
    }
    expect(minorUnitsToMajor(minor, "usd")).toBe(140);
    expect(naive).not.toBe(140); // float drift is real at this scale
  });
});

describe("roundToCurrency", () => {
  it.each([
    [75.005, "usd", 75.01],
    [1.005, "usd", 1.01],
    [1234.5678, "usd", 1234.57],
    [1234.5678, "jpy", 1235], // zero-decimal rounds to whole units
    [1.23456, "kwd", 1.235], // three-decimal keeps mils
  ])("rounds %p %s to %p", (value, currency, expected) => {
    expect(roundToCurrency(value, currency)).toBe(expected);
  });
});

describe("round trip", () => {
  it.each(["usd", "jpy", "kwd"])("major → minor → major is lossless for %s", (currency) => {
    for (const value of [0, 1, 12.5, 999.99]) {
      const minor = majorUnitsToMinor(value, currency);
      if (minor === null) continue;
      expect(roundToCurrency(minorUnitsToMajor(minor, currency), currency)).toBe(
        roundToCurrency(value, currency),
      );
    }
  });
});
