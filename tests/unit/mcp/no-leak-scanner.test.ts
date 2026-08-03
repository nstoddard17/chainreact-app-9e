/** @jest-environment node */
/**
 * Phase C-1 no_leak_scanner — local dev aid that flags forbidden leak shapes in
 * diagnostic DTOs / sample JSON.
 *
 * Business rule: it must catch credential keys/values, raw config/output, trigger
 * payloads, stack traces, raw DB errors, and connection strings — and must NEVER
 * echo a sensitive-looking VALUE back in its own output.
 */
import { buildRegistry } from "@/scripts/mcp/tools";
import { noLeakScannerTools, scanForLeaks } from "@/scripts/mcp/tools/noLeakScanner";

const tool = noLeakScannerTools.find((t) => t.name === "no_leak_scanner")!;
const call = (json: unknown): string => tool.handler({ json }) as string;
const cats = (v: unknown) => scanForLeaks(v).violations.map((x) => x.category);

// Assembled at runtime so this SOURCE file holds NO literal Slack-token-shaped
// string (secret scanners would block it), while the assembled VALUE still matches
// our scanner's slack-token regex (scripts/mcp/security/redact.ts) — detection is
// genuinely exercised. MUST NOT be written as a literal xox?-... string.
const FAKE_SLACK_TOKEN_FIXTURE = ["xoxb", "123456789012", "abcdEFGHijkl"].join("-");

describe("scanForLeaks — forbidden keys", () => {
  it("flags credential key names", () => {
    for (const key of ["access_token", "refresh_token", "client_secret", "private_key", "password", "apiKey", "authorization"]) {
      const r = scanForLeaks({ [key]: "whatever" });
      expect(r.passed).toBe(false);
      expect(r.violations[0]?.category).toBe("credential-key");
    }
  });
  it("flags raw config/output keys", () => {
    expect(cats({ config: { a: 1 } })).toContain("raw-config-or-output");
    expect(cats({ output: "x" })).toContain("raw-config-or-output");
  });
  it("flags stack / raw error.message / event payload keys", () => {
    expect(cats({ stack: "..." })).toContain("stack-trace");
    expect(cats({ error: { message: "boom" } })).toContain("raw-error-message");
    expect(cats({ triggerEvent: {} })).toContain("raw-event-payload");
  });
});

describe("scanForLeaks — forbidden values (no raw echo)", () => {
  it("flags credential-shaped values via the egress redactor and withholds the raw value", () => {
    const r = scanForLeaks({ note: `token is ${FAKE_SLACK_TOKEN_FIXTURE}` });
    expect(r.passed).toBe(false);
    const v = r.violations[0]!;
    expect(v.category).toBe("credential-value:slack-token");
    expect(v.severity).toBe("error");
    // The raw secret is NEVER present in the violation record.
    expect(JSON.stringify(r)).not.toContain(FAKE_SLACK_TOKEN_FIXTURE);
  });
  it("flags stack traces, raw DB errors, and connection strings", () => {
    expect(cats({ x: "    at Object.<anonymous> (/app/foo.ts:12:5)" })).toContain("stack-trace-value");
    expect(cats({ x: 'relation "workflows" does not exist' })).toContain("raw-db-error");
    expect(cats({ x: "postgres://user:pw@host:5432/db" })).toContain("connection-string");
  });
});

describe("scanForLeaks — clean input passes", () => {
  it("passes a safe sanitized DTO (ids / enums / field names only)", () => {
    const safe = {
      workflowId: "wf-1",
      access: "OK",
      structurallyValid: false,
      findings: [
        { kind: "MISSING_REQUIRED_FIELDS", severity: "error", nodeId: "a1", missingFields: ["Channel", "Message"] },
        { kind: "UNREACHABLE_NODE", severity: "error", nodeId: "a2", displayName: "Send Email" },
      ],
    };
    expect(scanForLeaks(safe).passed).toBe(true);
  });
});

describe("no_leak_scanner handler", () => {
  it("accepts a JSON string and an object; rejects junk", () => {
    expect(call('{"password":"x"}')).toMatch(/passed=false/);
    expect(call({ access: "OK" })).toMatch(/passed=true/);
    expect(tool.handler({ json: "{not json" })).toMatch(/not valid JSON/);
    expect(tool.handler({})).toMatch(/'json' is required/);
  });
  it("renders violations without the raw sensitive value", () => {
    const out = call({ secret: "sk-ABCDEFGHIJKLMNOPQRSTUVWX" });
    expect(out).toMatch(/passed=false/);
    expect(out).toContain("credential-key");
    expect(out).not.toContain("sk-ABCDEFGHIJKLMNOPQRSTUVWX");
  });
});

describe("registry wiring", () => {
  it("registers no_leak_scanner with a unique name", () => {
    const names = buildRegistry().list().map((t) => t.name);
    expect(names).toContain("no_leak_scanner");
    expect(new Set(names).size).toBe(names.length);
  });
});
