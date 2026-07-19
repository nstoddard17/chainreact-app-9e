/**
 * Sensitive-literal tokenize/rebind (REACT-CONFIG-COVERAGE-1).
 *
 * Pins the local placeholder flow: recipient-class literals (emails/phones) are replaced by stable
 * typed tokens before text crosses to Hermes, and the exact original value is rebound into model
 * output (text + deep config structures) before validation/preview. Also pins the conservative
 * phone detection (no mangling of ordinary ids/amounts) and false/0 preservation on deep rebind.
 */
import {
  containsRawSensitiveLiteral,
  containsSensitiveLiteralToken,
  rebindSensitiveLiteralsDeep,
  rebindSensitiveLiteralsInText,
  tokenizeSensitiveLiterals,
} from "@/core/security/sensitiveLiterals";

describe("tokenizeSensitiveLiterals", () => {
  it("replaces an email with a typed token and keeps the exact original in the binding", () => {
    const r = tokenizeSensitiveLiterals("When I get an email from vendor@example.com, post it to Slack");
    expect(r.text).toBe("When I get an email from [[EMAIL_1]], post it to Slack");
    expect(r.bindings).toEqual([{ token: "[[EMAIL_1]]", kind: "email", value: "vendor@example.com" }]);
    expect(containsRawSensitiveLiteral(r.text)).toBe(false);
  });

  it("maps the same email (case-insensitive) to the same token across threaded calls", () => {
    const first = tokenizeSensitiveLiterals("from vendor@example.com");
    const second = tokenizeSensitiveLiterals("I said Vendor@Example.com earlier", first.bindings);
    expect(second.text).toBe("I said [[EMAIL_1]] earlier");
    expect(second.bindings).toHaveLength(1);
  });

  it("numbers distinct emails separately", () => {
    const r = tokenizeSensitiveLiterals("cc a@x.com and b@y.com");
    expect(r.text).toBe("cc [[EMAIL_1]] and [[EMAIL_2]]");
    expect(r.bindings).toHaveLength(2);
  });

  it("tokenizes international and US-style phone numbers", () => {
    const r = tokenizeSensitiveLiterals("call +1 415-555-0100 or (415) 555-0100");
    expect(r.text).not.toContain("415-555-0100");
    expect(r.bindings.some((b) => b.kind === "phone")).toBe(true);
  });

  it("does NOT tokenize plain digit runs (ids/amounts stay intact)", () => {
    const r = tokenizeSensitiveLiterals("order 1234567890 costs 42000");
    expect(r.text).toBe("order 1234567890 costs 42000");
    expect(r.bindings).toHaveLength(0);
  });
});

describe("rebind", () => {
  const bindings = tokenizeSensitiveLiterals("vendor@example.com").bindings;

  it("rebinds a token in text and leaves unknown tokens alone", () => {
    expect(rebindSensitiveLiteralsInText("filter [[EMAIL_1]] and [[EMAIL_9]]", bindings)).toBe(
      "filter vendor@example.com and [[EMAIL_9]]",
    );
  });

  it("deep-rebinds through nested config structures without touching false/0", () => {
    const input = {
      steps: [
        {
          config: { from: ["[[EMAIL_1]]"], subjectExactMatch: false, maxResults: 0, note: null },
        },
      ],
    };
    const out = rebindSensitiveLiteralsDeep(input, bindings);
    expect(out.steps[0]!.config.from).toEqual(["vendor@example.com"]);
    expect(out.steps[0]!.config.subjectExactMatch).toBe(false);
    expect(out.steps[0]!.config.maxResults).toBe(0);
    expect(out.steps[0]!.config.note).toBeNull();
    // input untouched
    expect(input.steps[0]!.config.from).toEqual(["[[EMAIL_1]]"]);
  });

  it("containsSensitiveLiteralToken detects un-rebound tokens", () => {
    expect(containsSensitiveLiteralToken("x [[PHONE_2]] y")).toBe(true);
    expect(containsSensitiveLiteralToken("plain text")).toBe(false);
  });
});
