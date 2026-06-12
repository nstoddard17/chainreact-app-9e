/**
 * @jest-environment node
 *
 * Tests for `deriveConnectionDiagnosis` (Slice 4.MCP-STAGE-2B-2, CS-1).
 *
 * Table-driven coverage of every `ConnectionStatus`, the precedence ladder when
 * multiple conditions are true, determinism with a fixed `now`, and a no-leak
 * proof that a FULL integration-row-shaped object (with token blobs +
 * connectedByUserId etc.) can never surface those fields in the result.
 */
import {
  deriveConnectionDiagnosis,
  type ConnectionDiagnosisManifest,
  type ConnectionDiagnosisRow,
  type ConnectionStatus,
} from "@/services/integrations/connectionDiagnosis";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const PAST = "2026-06-11T11:00:00.000Z"; // before NOW → expired
const FUTURE = "2026-06-11T13:00:00.000Z"; // after NOW → not expired

// `slack` classifies `account`; `gmail` classifies `personal`
// (core/integrations/credentialSharing.ts).
function manifest(
  over: Partial<ConnectionDiagnosisManifest> = {},
): ConnectionDiagnosisManifest {
  return {
    id: "slack",
    isEnabled: true,
    refreshable: true,
    requiredScopes: ["channels:read", "groups:read"],
    ...over,
  };
}

function row(over: Partial<ConnectionDiagnosisRow> = {}): ConnectionDiagnosisRow {
  return {
    scopes: ["channels:read", "groups:read"],
    accessTokenExpiresAt: FUTURE,
    disconnectedAt: null,
    ...over,
  };
}

describe("deriveConnectionDiagnosis — status per case", () => {
  const cases: Array<{
    name: string;
    run: () => ReturnType<typeof deriveConnectionDiagnosis>;
    status: ConnectionStatus;
    extra?: (r: ReturnType<typeof deriveConnectionDiagnosis>) => void;
  }> = [
    {
      name: "PROVIDER_UNKNOWN when manifest is null",
      run: () => deriveConnectionDiagnosis(null, null, 0, NOW),
      status: "PROVIDER_UNKNOWN",
      extra: (r) => {
        expect(r.providerEnabled).toBe(false);
        expect(r.refreshable).toBe(false);
        expect(r.credentialClass).toBe("personal");
        expect(r.hasActiveRow).toBe(false);
        expect(r.tokenExpired).toBeNull();
      },
    },
    {
      name: "NO_ACCOUNT_ACCESS via precondition (no row inspected)",
      run: () => deriveConnectionDiagnosis(manifest(), null, 0, NOW, "NO_ACCOUNT_ACCESS"),
      status: "NO_ACCOUNT_ACCESS",
      extra: (r) => expect(r.hasActiveRow).toBe(false),
    },
    {
      name: "NOT_WORKFLOW_OWNER via precondition short-circuits even with a row",
      run: () =>
        deriveConnectionDiagnosis(manifest(), row(), 1, NOW, "NOT_WORKFLOW_OWNER"),
      status: "NOT_WORKFLOW_OWNER",
    },
    {
      name: "DISCONNECTED when no row",
      run: () => deriveConnectionDiagnosis(manifest(), null, 0, NOW),
      status: "DISCONNECTED",
      extra: (r) => {
        expect(r.hasActiveRow).toBe(false);
        expect(r.activeConnectionCount).toBe(0);
      },
    },
    {
      name: "DISCONNECTED when the row is soft-disconnected",
      run: () =>
        deriveConnectionDiagnosis(manifest(), row({ disconnectedAt: PAST }), 0, NOW),
      status: "DISCONNECTED",
      extra: (r) => expect(r.hasActiveRow).toBe(false),
    },
    {
      name: "PROVIDER_DISABLED when manifest.isEnabled is false (row present)",
      run: () =>
        deriveConnectionDiagnosis(manifest({ isEnabled: false }), row(), 1, NOW),
      status: "PROVIDER_DISABLED",
      extra: (r) => expect(r.providerEnabled).toBe(false),
    },
    {
      name: "RECONNECT_REQUIRED when expired AND not refreshable",
      run: () =>
        deriveConnectionDiagnosis(
          manifest({ refreshable: false }),
          row({ accessTokenExpiresAt: PAST }),
          1,
          NOW,
        ),
      status: "RECONNECT_REQUIRED",
      extra: (r) => {
        expect(r.tokenExpired).toBe(true);
        expect(r.refreshable).toBe(false);
      },
    },
    {
      name: "TOKEN_EXPIRED when expired AND refreshable",
      run: () =>
        deriveConnectionDiagnosis(
          manifest({ refreshable: true }),
          row({ accessTokenExpiresAt: PAST }),
          1,
          NOW,
        ),
      status: "TOKEN_EXPIRED",
      extra: (r) => {
        expect(r.tokenExpired).toBe(true);
        expect(r.refreshable).toBe(true);
      },
    },
    {
      name: "MISSING_SCOPES when a required scope is absent",
      run: () =>
        deriveConnectionDiagnosis(manifest(), row({ scopes: ["channels:read"] }), 1, NOW),
      status: "MISSING_SCOPES",
      extra: (r) => {
        expect(r.scopesSatisfied).toBe(false);
        expect(r.missingScopeCount).toBe(1);
        expect(r.missingScopes).toEqual(["groups:read"]);
      },
    },
    {
      name: "CONNECTED when active, not expired, scopes satisfied",
      run: () => deriveConnectionDiagnosis(manifest(), row(), 1, NOW),
      status: "CONNECTED",
      extra: (r) => {
        expect(r.scopesSatisfied).toBe(true);
        expect(r.missingScopeCount).toBe(0);
        expect(r.missingScopes).toEqual([]);
        expect(r.tokenExpired).toBe(false);
        expect(r.hasActiveRow).toBe(true);
      },
    },
    {
      name: "CONNECTED with tokenExpired null when provider exposes no expiry",
      run: () =>
        deriveConnectionDiagnosis(manifest(), row({ accessTokenExpiresAt: null }), 1, NOW),
      status: "CONNECTED",
      extra: (r) => expect(r.tokenExpired).toBeNull(),
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = c.run();
      expect(result.status).toBe(c.status);
      c.extra?.(result);
    });
  }
});

describe("deriveConnectionDiagnosis — precedence (multiple conditions true)", () => {
  it("expired + missing scopes → expiry wins (RECONNECT_REQUIRED, non-refreshable)", () => {
    const r = deriveConnectionDiagnosis(
      manifest({ refreshable: false }),
      row({ accessTokenExpiresAt: PAST, scopes: [] }),
      1,
      NOW,
    );
    expect(r.status).toBe("RECONNECT_REQUIRED");
    // scope facts still reported, but did not decide the status.
    expect(r.scopesSatisfied).toBe(false);
    expect(r.missingScopeCount).toBe(2);
  });

  it("expired + missing scopes → expiry wins (TOKEN_EXPIRED, refreshable)", () => {
    const r = deriveConnectionDiagnosis(
      manifest({ refreshable: true }),
      row({ accessTokenExpiresAt: PAST, scopes: [] }),
      1,
      NOW,
    );
    expect(r.status).toBe("TOKEN_EXPIRED");
  });

  it("no row + provider disabled → DISCONNECTED wins (no-row is the clearer message)", () => {
    const r = deriveConnectionDiagnosis(manifest({ isEnabled: false }), null, 0, NOW);
    expect(r.status).toBe("DISCONNECTED");
    expect(r.providerEnabled).toBe(false); // fact still reported
  });

  it("provider disabled + expired → PROVIDER_DISABLED wins over expiry", () => {
    const r = deriveConnectionDiagnosis(
      manifest({ isEnabled: false }),
      row({ accessTokenExpiresAt: PAST }),
      1,
      NOW,
    );
    expect(r.status).toBe("PROVIDER_DISABLED");
  });

  it("precondition wins over every derivable status", () => {
    const r = deriveConnectionDiagnosis(
      manifest({ isEnabled: false }),
      row({ accessTokenExpiresAt: PAST, scopes: [] }),
      5,
      NOW,
      "NO_ACCOUNT_ACCESS",
    );
    expect(r.status).toBe("NO_ACCOUNT_ACCESS");
  });
});

describe("deriveConnectionDiagnosis — activeConnectionCount + credentialClass", () => {
  it("echoes the active connection count verbatim", () => {
    expect(deriveConnectionDiagnosis(manifest(), row(), 3, NOW).activeConnectionCount).toBe(3);
    expect(deriveConnectionDiagnosis(manifest(), null, 0, NOW).activeConnectionCount).toBe(0);
  });

  it("classifies account vs personal providers", () => {
    expect(deriveConnectionDiagnosis(manifest({ id: "slack" }), row(), 1, NOW).credentialClass).toBe("account");
    expect(
      deriveConnectionDiagnosis(
        manifest({ id: "gmail", requiredScopes: ["https://www.googleapis.com/auth/gmail.send"] }),
        row({ scopes: ["https://www.googleapis.com/auth/gmail.send"] }),
        1,
        NOW,
      ).credentialClass,
    ).toBe("personal");
  });
});

describe("deriveConnectionDiagnosis — determinism", () => {
  it("is deterministic for a fixed now (same inputs → identical output)", () => {
    const a = deriveConnectionDiagnosis(manifest(), row({ accessTokenExpiresAt: PAST }), 1, NOW);
    const b = deriveConnectionDiagnosis(manifest(), row({ accessTokenExpiresAt: PAST }), 1, NOW);
    expect(a).toEqual(b);
  });

  it("the SAME row flips expired purely on the supplied now", () => {
    const justExpiry = (now: Date) =>
      deriveConnectionDiagnosis(manifest({ refreshable: false }), row({ accessTokenExpiresAt: "2026-06-11T12:00:00.000Z" }), 1, now).tokenExpired;
    expect(justExpiry(new Date("2026-06-11T11:59:59.000Z"))).toBe(false); // before expiry
    expect(justExpiry(new Date("2026-06-11T12:00:00.000Z"))).toBe(true); // at expiry (<=)
    expect(justExpiry(new Date("2026-06-11T12:00:01.000Z"))).toBe(true); // after
  });

  it("treats an unparseable expiry as unknown (null), never throws", () => {
    const r = deriveConnectionDiagnosis(manifest(), row({ accessTokenExpiresAt: "not-a-date" }), 1, NOW);
    expect(r.tokenExpired).toBeNull();
    expect(r.status).toBe("CONNECTED"); // unknown expiry does not block
  });
});

describe("deriveConnectionDiagnosis — no-leak", () => {
  it("a full integration-row-shaped object cannot surface secret fields", () => {
    // Structural typing lets a FULL record (with secrets) be passed where the
    // narrow row type is expected. The function must read only the 3 safe fields.
    const fullRow = {
      id: "int-1",
      accountId: "acct-team",
      connectedByUserId: "creator-SECRET-42",
      provider: "slack",
      providerAccountId: "T01SECRET",
      displayName: "Acme Secret Workspace",
      accessTokenEncrypted: "enc:VERYSECRETCIPHER",
      refreshTokenEncrypted: "enc:REFRESHSECRET",
      accessTokenExpiresAt: FUTURE,
      scopes: ["channels:read", "groups:read"],
      accountMetadata: { team: "AcmeSecretTeam" },
      disconnectedAt: null,
      createdAt: "2026-05-22T00:00:00Z",
      updatedAt: "2026-05-22T00:00:00Z",
    };
    const result = deriveConnectionDiagnosis(manifest(), fullRow, 1, NOW);
    const json = JSON.stringify(result);
    for (const forbidden of [
      "VERYSECRETCIPHER",
      "REFRESHSECRET",
      "enc:",
      "creator-SECRET-42",
      "T01SECRET",
      "Acme Secret Workspace",
      "AcmeSecretTeam",
      FUTURE, // exact expiry timestamp must not appear
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const key of [
      "accessTokenEncrypted",
      "refreshTokenEncrypted",
      "connectedByUserId",
      "providerAccountId",
      "displayName",
      "accountMetadata",
      "id",
      "accountId",
    ]) {
      expect(result).not.toHaveProperty(key);
    }
    // Only the safe derived keys are present.
    expect(Object.keys(result).sort()).toEqual(
      [
        "activeConnectionCount",
        "credentialClass",
        "hasActiveRow",
        "missingScopeCount",
        "missingScopes",
        "providerEnabled",
        "refreshable",
        "scopesSatisfied",
        "status",
        "tokenExpired",
      ].sort(),
    );
  });
});
