/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/semanticModelRefreshes.ts`.
 * Depends on `workspaceId` + `semanticModelId`; value = refresh requestId,
 * label = `<startTime> · <status>`, sorted in-progress first then newest.
 * Entries without a requestId (non-enhanced refreshes) are skipped.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockRefreshesList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/datasets/refreshesList", () => ({
  refreshesList: (...args: unknown[]) => mockRefreshesList(...args),
}));

import { microsoftPowerBiSemanticModelRefreshesResolver } from "@/integrations/microsoft-powerbi/options/semanticModelRefreshes";
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
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { workspaceId: "ws-1", semanticModelId: "model-1" },
    ...overrides,
  };
}

function refresh(
  refreshRequestId: string | null,
  startTime: string | null,
  status: string,
): Record<string, unknown> {
  return {
    refreshRequestId,
    refreshType: "ViaEnhancedApi",
    status,
    startTime,
    endTime: null,
    errorCode: null,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRefreshesList.mockReset();
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — shape", () => {
  it("declares requiredDeps=['workspaceId','semanticModelId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiSemanticModelRefreshesResolver.source).toBe(
      "microsoft-powerbi:semantic_model_refreshes",
    );
    expect(microsoftPowerBiSemanticModelRefreshesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(
      microsoftPowerBiSemanticModelRefreshesResolver.requiresIntegration,
    ).toBe(true);
    expect(
      microsoftPowerBiSemanticModelRefreshesResolver.requiredDeps,
    ).toEqual(["workspaceId", "semanticModelId"]);
  });
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — mapping + sorting", () => {
  it("labels `<startTime> · <status>` and sorts in-progress first, then newest", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [
        refresh("req-new-done", "2026-07-15T11:00:00Z", "Completed"),
        refresh("req-progress-old", "2026-07-15T01:00:00Z", "Unknown"),
        refresh("req-old-done", "2026-07-14T03:00:00Z", "Failed"),
        refresh("req-progress-new", "2026-07-15T12:00:00Z", "Unknown"),
      ],
      hasMore: false,
    });

    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());

    expect(result.items.map((i) => i.value)).toEqual([
      "req-progress-new",
      "req-progress-old",
      "req-new-done",
      "req-old-done",
    ]);
    expect(result.items[0]!.label).toBe("2026-07-15T12:00:00Z · Unknown");
    expect(result.hasMore).toBe(false);
  });

  it("skips refreshes with no requestId (non-enhanced refreshes can't be targeted)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [
        refresh(null, "2026-07-15T11:00:00Z", "Completed"),
        refresh("req-1", "2026-07-15T10:00:00Z", "Completed"),
      ],
      hasMore: false,
    });
    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "req-1", label: "2026-07-15T10:00:00Z · Completed" },
    ]);
  });

  it("labels missing startTime honestly and surfaces wrapper hasMore", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [refresh("req-1", null, "Unknown")],
      hasMore: true,
    });
    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "req-1", label: "unknown start · Unknown" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("requests a bounded page (top 100) from the wrapper", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockRefreshesList.mockResolvedValueOnce({ refreshes: [], hasMore: false });

    await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());

    expect(mockRefreshesList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
      datasetId: "model-1",
      top: 100,
    });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [
        refresh("req-1", "2026-07-15T11:00:00Z", "Completed"),
        refresh("req-2", "2026-07-15T10:00:00Z", "Failed"),
      ],
      hasMore: false,
    });
    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(
        ctx({ q: "failed" }),
      );
    expect(result.items.map((i) => i.value)).toEqual(["req-2"]);
  });
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — dependencies + cascade", () => {
  it("throws MISSING_DEPENDENCY when workspaceId missing, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(
        ctx({ deps: { semanticModelId: "model-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when semanticModelId missing, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", semanticModelId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent model gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("semantic model model-ghost"),
    );
    const result = await microsoftPowerBiSemanticModelRefreshesResolver.resolve(
      ctx({ deps: { workspaceId: "ws-1", semanticModelId: "model-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'dataset refreshes GET failed: {"raw":"refresh-secret-leak"} Bearer xyz',
      ),
    );
    try {
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("refresh-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
