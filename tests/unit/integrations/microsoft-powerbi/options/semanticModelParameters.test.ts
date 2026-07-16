/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/semanticModelParameters.ts`.
 * Cascading resolver: requiredDeps ["workspaceId", "semanticModelId"];
 * value = label = parameter NAME — current parameter VALUES must never
 * surface (they can carry connection strings).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockParametersList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/datasets/parametersList",
  () => ({
    parametersList: (...args: unknown[]) => mockParametersList(...args),
  }),
);

import { microsoftPowerBiSemanticModelParametersResolver } from "@/integrations/microsoft-powerbi/options/semanticModelParameters";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-powerbi",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Power BI)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-07-15T12:00:00Z",
  scopes: ["offline_access"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { workspaceId: "ws-1", semanticModelId: "ds-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockParametersList.mockReset();
});

describe("microsoftPowerBiSemanticModelParametersResolver — shape", () => {
  it("declares source, provider, requiredDeps (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiSemanticModelParametersResolver.source).toBe(
      "microsoft-powerbi:semantic_model_parameters",
    );
    expect(microsoftPowerBiSemanticModelParametersResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(
      microsoftPowerBiSemanticModelParametersResolver.requiresIntegration,
    ).toBe(true);
    expect(
      microsoftPowerBiSemanticModelParametersResolver.requiredDeps,
    ).toEqual(["workspaceId", "semanticModelId"]);
  });
});

describe("microsoftPowerBiSemanticModelParametersResolver — mapping", () => {
  it("maps parameter name → value AND label via the deps, pinned to providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockParametersList.mockResolvedValueOnce([
      { name: "ServerName" },
      { name: "DatabaseName" },
    ]);

    const result =
      await microsoftPowerBiSemanticModelParametersResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "ServerName", label: "ServerName" },
      { value: "DatabaseName", label: "DatabaseName" },
    ]);
    expect(result.hasMore).toBe(false);

    const wrapperCall = mockParametersList.mock.calls[0]![0];
    expect(wrapperCall.groupId).toBe("ws-1");
    expect(wrapperCall.datasetId).toBe("ds-1");

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });

  it("applies case-insensitive q filter against the name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { name: "ServerName" },
      { name: "DatabaseName" },
      { name: "ApiBase" },
    ]);

    const result =
      await microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ q: "NAME" }),
      );
    expect(result.items.map((i) => i.value)).toEqual([
      "ServerName",
      "DatabaseName",
    ]);
  });
});

describe("microsoftPowerBiSemanticModelParametersResolver — deps + errors", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is empty, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ deps: { workspaceId: "", semanticModelId: "ds-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when semanticModelId is empty, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", semanticModelId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when no integration in context", async () => {
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth failures to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("401"),
    );
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("returns empty items (not an error) when the parent model is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("semantic model ds-1"),
    );
    const result =
      await microsoftPowerBiSemanticModelParametersResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("maps other failures to PROVIDER_ERROR with a static safe message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("HTTP 500 something internal Server=secret-host"),
    );
    let caught: unknown;
    try {
      await microsoftPowerBiSemanticModelParametersResolver.resolve(ctx());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(
      "secret-host",
    );
  });
});
