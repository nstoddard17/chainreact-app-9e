/**
 * Protects the internal MCP server's secret-redaction layer.
 *
 * Business rule: every byte returned to the AI host passes through
 * redactSecrets. A credential accidentally present in a doc must never leave
 * the machine verbatim. Failure = secret exfiltration.
 */
import { redactSecrets } from "@/scripts/mcp/security/redact";

describe("internal MCP secret redaction", () => {
  it("redacts a JWT-shaped token", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redactSecrets(`token here: ${jwt} end`);
    expect(out).not.toContain(jwt);
    expect(out).toContain("[REDACTED:jwt]");
  });

  it("redacts a Slack bot token", () => {
    // Assembled at runtime so no full literal Slack-bot-token string lives in
    // source — avoids GitHub secret-scanning false positives while still
    // exercising redaction of a real Slack-bot-token-shaped value.
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    const out = redactSecrets(`slack: ${slackToken} end`);
    expect(out).not.toContain(slackToken);
    expect(out).toContain("[REDACTED:slack-token]");
  });

  it("redacts a Stripe live secret key", () => {
    const out = redactSecrets("key sk_live_abcd1234ABCD5678efgh here");
    expect(out).not.toContain("sk_live_abcd1234ABCD5678efgh");
    expect(out).toContain("[REDACTED:stripe-key]");
  });

  it("redacts the value of a *_API_KEY assignment but keeps the key name", () => {
    const out = redactSecrets("MY_API_KEY=abcdefgh12345678ZZ");
    expect(out).not.toContain("abcdefgh12345678ZZ");
    expect(out).toContain("MY_API_KEY=");
    expect(out).toContain("[REDACTED:secret]");
  });

  it("leaves ordinary documentation prose untouched", () => {
    const prose = "The provider registry aggregates manifests at load time.";
    expect(redactSecrets(prose)).toBe(prose);
  });
});
