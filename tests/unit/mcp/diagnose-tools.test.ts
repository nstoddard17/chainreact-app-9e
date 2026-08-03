/** @jest-environment node */
/**
 * Stage 2A CS-2 — static option-source + connection-requirements diagnosis.
 *
 * Proves:
 *   - diagnose_option_source covers EVERY closed OptionsSourceErrorCode (tied to
 *     the app's runtime ALL_OPTIONS_SOURCE_ERROR_CODES so a new code can't land
 *     unmapped);
 *   - slack:channels is reported registered, requires a Slack integration, and
 *     the PROVIDER_ERROR / INTEGRATION_DISCONNECTED / OWNER_MUST_CONNECT /
 *     NOT_WORKFLOW_OWNER paths are explained;
 *   - explain_provider_connection_requirements surfaces required scopes + the
 *     option sources that need the connection, and rejects bad provider ids.
 */
import { ALL_OPTIONS_SOURCE_ERROR_CODES } from "@/services/options/types";
import {
  diagnosisTools,
  OPTION_SOURCE_DIAGNOSES,
} from "@/scripts/mcp/tools/diagnose";

const diagnose = diagnosisTools.find((t) => t.name === "diagnose_option_source")!;
const explain = diagnosisTools.find(
  (t) => t.name === "explain_provider_connection_requirements",
)!;

describe("diagnose_option_source — taxonomy coverage", () => {
  it("maps EXACTLY the app's closed OptionsSourceErrorCode set (no drift)", () => {
    const covered = Object.keys(OPTION_SOURCE_DIAGNOSES).sort();
    const expected = [...ALL_OPTIONS_SOURCE_ERROR_CODES].sort();
    expect(covered).toEqual(expected);
  });

  it("every code has a non-empty cause and at least one next-check", () => {
    for (const code of ALL_OPTIONS_SOURCE_ERROR_CODES) {
      const d = OPTION_SOURCE_DIAGNOSES[code];
      expect(d).toBeDefined();
      expect(d!.cause.length).toBeGreaterThan(0);
      expect(d!.nextChecks.length).toBeGreaterThan(0);
    }
  });

  it("the full guide for slack:channels names every error code", async () => {
    const out = String(await diagnose.handler({ source: "slack:channels" }));
    for (const code of ALL_OPTIONS_SOURCE_ERROR_CODES) {
      expect(out).toContain(code);
    }
  });

  it("focuses a single code when `code` is passed", async () => {
    const out = String(
      await diagnose.handler({ source: "slack:channels", code: "provider_error" }),
    );
    expect(out).toContain("observed code:");
    expect(out).toContain("PROVIDER_ERROR");
    // The focused view should not dump the entire guide.
    expect(out).not.toContain("Error-code guide");
  });
});

describe("diagnose_option_source — slack:channels specifics", () => {
  let out = "";
  beforeAll(async () => {
    out = String(await diagnose.handler({ source: "slack:channels" }));
  });

  it("reports slack:channels as a registered source", () => {
    expect(out).toContain("source: slack:channels");
    expect(out).toContain("registered: YES");
    expect(out).toContain("provider: slack");
  });

  it("states it requires a Slack integration and has no required deps", () => {
    expect(out).toMatch(/requiresIntegration: true/);
    expect(out).toContain("active slack connection");
    expect(out).toContain("requiredDeps: (none");
  });

  it("explains the PROVIDER_ERROR auth/scope path", () => {
    expect(out).toMatch(/PROVIDER_ERROR[\s\S]*scope/i);
  });

  it("explains the INTEGRATION_DISCONNECTED account path", () => {
    expect(out).toMatch(/INTEGRATION_DISCONNECTED[\s\S]*account/i);
  });

  it("explains the OWNER_MUST_CONNECT and NOT_WORKFLOW_OWNER creator/owner cases", () => {
    expect(out).toMatch(/OWNER_MUST_CONNECT[\s\S]*creator/i);
    expect(out).toMatch(/NOT_WORKFLOW_OWNER[\s\S]*owner/i);
  });
});

describe("diagnose_option_source — unknown + bad input", () => {
  it("reports an unregistered source as not registered (SOURCE_NOT_FOUND path)", async () => {
    const out = String(await diagnose.handler({ source: "slack:ghost" }));
    expect(out).toContain("registered: NO");
    // Suggests sibling Slack sources.
    expect(out).toContain("slack:channels");
  });

  it("requires a source", async () => {
    expect(String(await diagnose.handler({}))).toContain("'source' is required");
  });
});

describe("explain_provider_connection_requirements", () => {
  it("surfaces Slack required scopes, refreshable state, and dependent sources", async () => {
    const out = String(await explain.handler({ provider: "slack" }));
    expect(out).toContain("connection requirements for provider: slack");
    expect(out).toContain("required scopes:");
    expect(out).toContain("channels:read"); // a known Slack required scope
    expect(out).toContain("chat:write");
    // SLACK-TOKEN-ROTATION-1 — Slack implements a real refreshToken().
    expect(out).toContain("refreshable: true");
    // authFlow falls back to oauthFlows (v2) — never a bare null.
    expect(out).toContain("authFlow: v2");
    expect(out).not.toContain("authFlow: null");
    // Lists the option-sources that need the connection.
    expect(out).toContain("slack:channels");
  });

  it("emits CLEAN scopes with no comment-prose leakage (Stage-2A parser fix)", async () => {
    const out = String(await explain.handler({ provider: "slack" }));
    // Isolate the rendered scope lines.
    const reqLine =
      out.split("\n").find((l) => l.startsWith("required scopes:")) ?? "";
    const optLine =
      out.split("\n").find((l) => l.startsWith("optional scopes:")) ?? "";

    // Required scopes render as a clean comma-separated list of token scopes.
    expect(reqLine).toContain("channels:read");
    expect(reqLine).toContain("files:write");
    expect(optLine).toContain("chat:write.public");

    // None of the previously-leaked comment fragments appear anywhere.
    for (const junk of [
      "xoxp",
      "invite the bot first",
      "plan §",
      "Slack 2.",
      "scope additions",
      "//",
    ]) {
      expect(out).not.toContain(junk);
    }
    // The optional line must not be polluted by prose words (has spaces beyond
    // the "optional scopes:" label + comma-separated tokens). Scopes never
    // contain spaces, so any leaked prose would add stray alpha words.
    expect(optLine).not.toMatch(/decision|plan|bot|invite/i);
  });

  it("rejects an invalid provider id", async () => {
    const out = String(await explain.handler({ provider: "../etc" }));
    expect(out).toContain("invalid provider id");
  });

  it("reports a clear error for an unknown provider", async () => {
    const out = String(await explain.handler({ provider: "nope" }));
    expect(out).toContain("no manifest found");
  });
});
