/** @jest-environment node */
/**
 * SCOPE-GATE-REFINEMENT-1 — provider-specific scope-assertion semantics.
 *
 * Proves the refinement is a NARROW, provider-specific correction: absent
 * scope metadata is reported honestly as `scopes_not_asserted` (never as proof
 * of a missing scope), real deficiencies still fail, providers with reliable
 * scope reporting stay strict, and unlisted providers fail closed.
 */
import { evaluateScopes } from "@/scripts/integrations-transplant/scopeAssertion";
import { buildPlan, runApply } from "@/scripts/integrations-transplant/orchestrator";
import {
  FakeSourceReader,
  makeConfig,
  makeDeps,
  makeSourceRow,
  okProbe,
} from "./helpers";

const GMAIL_REQUIRED = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

describe("evaluateScopes — unit semantics", () => {
  it("(1) empty scope metadata for an audited provider is NOT missing_scopes", () => {
    for (const provider of ["asana", "notion", "trello", "dropbox", "hubspot"]) {
      const result = evaluateScopes({
        provider,
        requiredScopes: ["some:scope", "other:scope"],
        grantedScopes: [],
      });
      expect(result.status).toBe("scopes_not_asserted");
      expect(result.missingCount).toBe(0);
    }
  });

  it("(2) an explicit, trustworthy scope deficiency still yields scopes_missing", () => {
    // google-calendar's real production shape: Google reliably echoes grants.
    const result = evaluateScopes({
      provider: "google-calendar",
      requiredScopes: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      grantedScopes: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid",
      ],
    });
    expect(result.status).toBe("scopes_missing");
    expect(result.missingCount).toBe(1);
  });

  it("(3) providers with reliable scope reporting remain strict", () => {
    expect(
      evaluateScopes({
        provider: "gmail",
        requiredScopes: GMAIL_REQUIRED,
        grantedScopes: [GMAIL_REQUIRED[0]!],
      }).status,
    ).toBe("scopes_missing");
    expect(
      evaluateScopes({
        provider: "slack",
        requiredScopes: ["chat:write"],
        grantedScopes: ["chat:write", "channels:read"],
      }).status,
    ).toBe("scopes_verified");
  });

  it("(3b) an UNLISTED provider fails closed — empty grants are still strict", () => {
    const result = evaluateScopes({
      provider: "some-unknown-provider",
      requiredScopes: ["a:scope"],
      grantedScopes: [],
    });
    expect(result.status).toBe("scopes_missing");
  });

  it("a provider_optional provider with REAL scope data keeps the strict comparison", () => {
    // dropbox is 'provider_optional': empty ⇒ not_asserted, but non-empty is
    // genuine evidence and a gap must still be reported.
    expect(
      evaluateScopes({
        provider: "dropbox",
        requiredScopes: ["files.content.read", "files.content.write"],
        grantedScopes: ["files.content.read"],
      }).status,
    ).toBe("scopes_missing");
    expect(
      evaluateScopes({
        provider: "dropbox",
        requiredScopes: ["files.content.read"],
        grantedScopes: ["files.content.read"],
      }).status,
    ).toBe("scopes_verified");
  });

  it("no required scopes ⇒ scopes_not_applicable", () => {
    expect(
      evaluateScopes({ provider: "fleetio", requiredScopes: [], grantedScopes: [] }).status,
    ).toBe("scopes_not_applicable");
  });

  describe("documented per-provider normalizations", () => {
    it("monday: comma-joined single element (upstream split defect) is recovered", () => {
      const required = ["me:read", "boards:read", "boards:write", "workspaces:read"];
      // Exactly how the column looks in production: ONE element, comma-joined.
      const granted = ["me:read,boards:read,boards:write,workspaces:read"];
      expect(evaluateScopes({ provider: "monday", requiredScopes: required, grantedScopes: granted }).status)
        .toBe("scopes_verified");
      // ...and a genuine gap is still caught after normalization.
      expect(
        evaluateScopes({
          provider: "monday",
          requiredScopes: [...required, "assets:read"],
          grantedScopes: granted,
        }).status,
      ).toBe("scopes_missing");
    });

    it("shopify: write_<resource> satisfies read_<resource>, and only for shopify", () => {
      expect(
        evaluateScopes({
          provider: "shopify",
          requiredScopes: ["read_orders", "write_orders", "read_checkouts"],
          grantedScopes: ["write_orders", "write_checkouts"],
        }).status,
      ).toBe("scopes_verified");
      // A read requirement with NO write counterpart granted still fails.
      expect(
        evaluateScopes({
          provider: "shopify",
          requiredScopes: ["read_locations"],
          grantedScopes: ["write_orders"],
        }).status,
      ).toBe("scopes_missing");
      // The implication is NOT global.
      expect(
        evaluateScopes({
          provider: "gmail",
          requiredScopes: ["read_orders"],
          grantedScopes: ["write_orders"],
        }).status,
      ).toBe("scopes_missing");
    });
  });
});

describe("plan + artifact integration", () => {
  const notionRow = () =>
    makeSourceRow({
      provider: "notion",
      provider_account_id: "bot-id-1234",
      display_name: "Workspace",
      scopes: [],
      refresh_token_encrypted: null,
      access_token_expires_at: null,
    });

  function notionDeps(probeIdentity = "bot-id-1234") {
    return makeDeps({
      source: new FakeSourceReader(undefined, [notionRow()]),
      probes: { notion: okProbe(probeIdentity) },
      providerInfo: () => ({
        registered: true,
        enabled: true,
        requiredScopes: ["read_content", "update_content", "insert_content"],
      }),
    });
  }

  it("(1/5) an audited provider with empty scopes is PLANNED and reported scopes_not_asserted", async () => {
    const { deps } = notionDeps();
    const plan = await buildPlan(deps, makeConfig({ providerAllowlist: ["notion"] }));
    expect(plan.items[0]).toMatchObject({
      intendedAction: "insert",
      status: "planned",
      scopeStatus: "scopes_not_asserted",
    });
  });

  it("(6) the dry-run artifact distinguishes scopes_not_asserted from scopes_missing", async () => {
    const notion = notionRow();
    const gcal = makeSourceRow({
      provider: "google-calendar",
      provider_account_id: "user@example.test",
      display_name: "user@example.test",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    const { deps } = makeDeps({
      source: new FakeSourceReader(undefined, [notion, gcal]),
      probes: { notion: okProbe("bot-id-1234"), "google-calendar": okProbe("user@example.test") },
      providerInfo: (provider) => ({
        registered: true,
        enabled: true,
        requiredScopes:
          provider === "notion"
            ? ["read_content"]
            : [
                "https://www.googleapis.com/auth/calendar.events",
                "https://www.googleapis.com/auth/calendar.readonly",
              ],
      }),
    });
    const { runDryRun } = await import("@/scripts/integrations-transplant/orchestrator");
    const { report, serialized } = await runDryRun(
      deps,
      makeConfig({ providerAllowlist: ["notion", "google-calendar"] }),
      "op-scope",
    );
    const byProvider = Object.fromEntries(report.items.map((i) => [i.provider, i]));
    expect(byProvider.notion).toMatchObject({
      scopeStatus: "scopes_not_asserted",
      status: "planned",
    });
    expect(byProvider["google-calendar"]).toMatchObject({
      scopeStatus: "scopes_missing",
      status: "reconnect_required",
      reason: "missing_required_scopes",
    });
    // The distinction survives serialization.
    expect(serialized).toContain("scopes_not_asserted");
    expect(serialized).toContain("scopes_missing");
  });

  it("(4) identity-probe failure prevents destination persistence for a scopes_not_asserted provider", async () => {
    // The credential is judged by the probe precisely BECAUSE scopes carry no
    // evidence — a mismatched identity must block the write entirely.
    const { deps, dest } = notionDeps("a-different-bot-id");
    const config = makeConfig({ providerAllowlist: ["notion"] });
    const fp = (await buildPlan(deps, config)).fingerprint;
    const { report } = await runApply(deps, config, "op-scope-apply", fp);
    expect(report.items[0]).toMatchObject({
      status: "verification_failed",
      reason: "provider_identity_mismatch",
      scopeStatus: "scopes_not_asserted",
    });
    expect(dest.rows).toHaveLength(0);
    expect(dest.mutationCalls).toEqual([]);
  });
});
