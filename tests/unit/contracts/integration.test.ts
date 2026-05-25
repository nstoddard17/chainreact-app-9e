import {
  ProviderManifestSchema,
  TokenIngestVerificationError,
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
