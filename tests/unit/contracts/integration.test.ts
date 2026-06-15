import {
  ProviderManifestSchema,
  TokenIngestVerificationError,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";

const baseValid = {
  id: "slack",
  displayName: "Slack",
  tokenScope: "workspace",
  accountIdField: "team_id",
  scopes: { required: ["chat:write"], optional: [], deprecated: [] },
  capabilities: { oauth: true, webhookTrigger: true, pollingTrigger: false, actions: true },
  healthCheckIntervalMs: 60_000,
  refreshable: false,
};

describe("ProviderManifestSchema", () => {
  it("accepts a well-formed manifest", () => {
    const result = ProviderManifestSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it("applies defaults for isEnabled / isExperimental / oauthFlows / capabilities", () => {
    const minimal = {
      id: "slack",
      displayName: "Slack",
      tokenScope: "workspace",
      accountIdField: "team_id",
      scopes: { required: ["chat:write"] },
      capabilities: { oauth: true },
      healthCheckIntervalMs: 60_000,
    };
    const m = ProviderManifestSchema.parse(minimal);
    expect(m.isEnabled).toBe(true);
    expect(m.isExperimental).toBe(false);
    expect(m.oauthFlows).toEqual([]);
    expect(m.refreshable).toBe(false);
    expect(m.capabilities.webhookTrigger).toBe(false);
    expect(m.scopes.optional).toEqual([]);
    expect(m.scopes.deprecated).toEqual([]);
  });

  it("rejects an id with uppercase or special chars", () => {
    expect(ProviderManifestSchema.safeParse({ ...baseValid, id: "Slack" }).success).toBe(false);
    expect(ProviderManifestSchema.safeParse({ ...baseValid, id: "slack!" }).success).toBe(false);
    expect(ProviderManifestSchema.safeParse({ ...baseValid, id: "1slack" }).success).toBe(false);
  });

  it("requires accountIdField when tokenScope is 'workspace'", () => {
    const m = { ...baseValid, accountIdField: undefined };
    const r = ProviderManifestSchema.safeParse(m);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "accountIdField")).toBe(true);
    }
  });

  it("does NOT require accountIdField when tokenScope is 'user'", () => {
    const m = { ...baseValid, tokenScope: "user", accountIdField: undefined };
    const r = ProviderManifestSchema.safeParse(m);
    expect(r.success).toBe(true);
  });

  it("requires at least one scope.required when capabilities.oauth is true", () => {
    const m = { ...baseValid, scopes: { required: [], optional: [], deprecated: [] } };
    const r = ProviderManifestSchema.safeParse(m);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "scopes.required")).toBe(true);
    }
  });

  it("rejects healthCheckIntervalMs of 0 or negative", () => {
    expect(
      ProviderManifestSchema.safeParse({ ...baseValid, healthCheckIntervalMs: 0 }).success,
    ).toBe(false);
    expect(
      ProviderManifestSchema.safeParse({ ...baseValid, healthCheckIntervalMs: -1 }).success,
    ).toBe(false);
  });

  it("defaults authFlow to 'code_callback' when omitted", () => {
    const m = ProviderManifestSchema.parse(baseValid);
    expect(m.authFlow).toBe("code_callback");
  });

  it("accepts authFlow: 'token_ingest' on non-refreshable user-scope providers", () => {
    const r = ProviderManifestSchema.safeParse({
      ...baseValid,
      tokenScope: "user",
      accountIdField: undefined,
      authFlow: "token_ingest",
    });
    expect(r.success).toBe(true);
  });

  it("rejects authFlow values outside the enum", () => {
    const r = ProviderManifestSchema.safeParse({
      ...baseValid,
      authFlow: "oauth1a",
    });
    expect(r.success).toBe(false);
  });

  it("rejects refreshable=true on token_ingest providers", () => {
    const r = ProviderManifestSchema.safeParse({
      ...baseValid,
      tokenScope: "user",
      accountIdField: undefined,
      authFlow: "token_ingest",
      refreshable: true,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.join(".") === "refreshable"),
      ).toBe(true);
    }
  });

  it("preserves pre-Slice-17 manifests through the new authFlow default (no migration needed)", () => {
    const m = ProviderManifestSchema.parse({
      id: "slack",
      displayName: "Slack",
      tokenScope: "workspace",
      accountIdField: "team_id",
      scopes: { required: ["chat:write"], optional: [], deprecated: [] },
      capabilities: { oauth: true },
      healthCheckIntervalMs: 60_000,
      refreshable: false,
    });
    expect(m.authFlow).toBe("code_callback");
  });
});

describe("TokenIngestVerificationError", () => {
  it("constructs with provider + reason; carries reason as a field", () => {
    const err = new TokenIngestVerificationError("trello", "invalid token");
    expect(err.name).toBe("TokenIngestVerificationError");
    expect(err.reason).toBe("invalid token");
    expect(err.message).toContain("trello");
    expect(err.message).toContain("invalid token");
  });

  it("is an Error instance for instanceof catch dispatch", () => {
    const err = new TokenIngestVerificationError("trello", "rejected");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof TokenIngestVerificationError).toBe(true);
  });
});

describe("isRefreshAuthRequiredCode (V2-READY-32)", () => {
  it("classifies invalid_grant as a definite reconnect-required code", () => {
    expect(isRefreshAuthRequiredCode("invalid_grant")).toBe(true);
  });

  it.each([
    // config-class OAuth2 errors — re-auth does NOT fix these
    "invalid_client",
    "unauthorized_client",
    "invalid_request",
    "invalid_scope",
    "unsupported_grant_type",
    // transient transport / server / network
    "HTTP 429",
    "HTTP 500",
    "HTTP 502",
    "HTTP 503",
    "temporarily_unavailable",
    "server_error",
    // unknown / empty
    "",
    "something_else",
  ])("does NOT classify '%s' as reconnect-required", (code) => {
    expect(isRefreshAuthRequiredCode(code)).toBe(false);
  });
});

describe("RefreshAuthRequiredError (V2-READY-32)", () => {
  it("carries provider + code and is an Error for instanceof dispatch", () => {
    const err = new RefreshAuthRequiredError("google", "invalid_grant");
    expect(err.name).toBe("RefreshAuthRequiredError");
    expect(err.provider).toBe("google");
    expect(err.code).toBe("invalid_grant");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof RefreshAuthRequiredError).toBe(true);
  });

  it("no-leak: message exposes only the provider slug + standard code (no body/token/scope/email)", () => {
    const err = new RefreshAuthRequiredError("airtable", "invalid_grant");
    const serialized = `${err.message} ${JSON.stringify({ p: err.provider, c: err.code })}`;
    // Only the safe slug + OAuth2 code appear.
    expect(err.message).toContain("airtable");
    expect(err.message).toContain("invalid_grant");
    // Defensive: nothing token/scope/email/account-shaped leaks.
    expect(serialized).not.toMatch(/xoxb|Bearer |refresh_token=|@|acct_|scope=/i);
  });
});
