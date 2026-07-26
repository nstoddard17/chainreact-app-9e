import {
  formatAgeSeconds,
  formatInsightTick,
  formatInsightValue,
} from "@/features/analytics/insights/formatInsightValue";

describe("formatInsightValue", () => {
  it("counts render as whole en-US numbers", () => {
    expect(formatInsightValue(1234567, { unit: "count" })).toBe("1,234,567");
    expect(formatInsightValue(0, { unit: "count" })).toBe("0");
  });

  it("percent values are 0..1 fractions rendered honestly", () => {
    expect(formatInsightValue(0.937, { unit: "percent" })).toBe("93.7%");
    expect(formatInsightValue(1, { unit: "percent" })).toBe("100%");
    expect(formatInsightValue(0, { unit: "percent" })).toBe("0%");
  });

  it("durations use understandable units", () => {
    expect(formatInsightValue(417, { unit: "milliseconds" })).toBe("417 ms");
    expect(formatInsightValue(12_300, { unit: "milliseconds" })).toBe("12.3 s");
    expect(formatInsightValue(252_000, { unit: "milliseconds" })).toBe("4 min 12 s");
    expect(formatInsightValue(2 * 3_600_000, { unit: "milliseconds" })).toBe("2 hr");
  });

  it("currency uses the result's ISO code — never an assumed USD", () => {
    expect(formatInsightValue(1234.5, { unit: "currency", currency: "USD" })).toBe("$1,234.50");
    expect(formatInsightValue(980, { unit: "currency", currency: "EUR" })).toBe("€980.00");
    // No currency on the result → plain number, no symbol.
    expect(formatInsightValue(1234.5, { unit: "currency" })).toBe("1,234.5");
  });

  it("zero-decimal currencies render correctly", () => {
    expect(formatInsightValue(5000, { unit: "currency", currency: "JPY" })).toBe("¥5,000");
  });

  it("null is unavailable, not zero", () => {
    expect(formatInsightValue(null, { unit: "count" })).toBe("—");
    expect(formatInsightValue(null, { unit: "currency", currency: "USD" })).toBe("—");
  });

  it("generic units carry their declared suffix", () => {
    expect(formatInsightValue(12.5, { unit: "gallons" })).toBe("12.5 gal");
    expect(formatInsightValue(340, { unit: "miles" })).toBe("340 mi");
    expect(formatInsightValue(7.25, { unit: "hours" })).toBe("7.25 hrs");
    expect(formatInsightValue(3.14159, { unit: "decimal" })).toBe("3.14");
  });
});

describe("formatInsightTick", () => {
  it("compacts large numbers and prefixes currency symbols", () => {
    expect(formatInsightTick(1500, { unit: "count" })).toBe("1.5K");
    expect(formatInsightTick(2000, { unit: "currency", currency: "USD" })).toBe("$2K");
    expect(formatInsightTick(0.5, { unit: "percent" })).toBe("50%");
    expect(formatInsightTick(90_000, { unit: "milliseconds" })).toBe("2m");
  });
});

describe("formatAgeSeconds", () => {
  it("friendly ages", () => {
    expect(formatAgeSeconds(20)).toBe("just now");
    expect(formatAgeSeconds(300)).toBe("5 minutes ago");
    expect(formatAgeSeconds(3 * 3600)).toBe("3 hours ago");
    expect(formatAgeSeconds(60 * 60 * 24 * 2)).toBe("2 days ago");
  });
});
