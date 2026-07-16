/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/dataflowTransactions.ts`.
 * Depends on `workspaceId` + `dataflowId`; value = transaction id,
 * label = `<startTime> · <status>`, sorted in-progress first then newest.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockTransactionsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowTransactionsList",
  () => ({
    dataflowTransactionsList: (...args: unknown[]) =>
      mockTransactionsList(...args),
  }),
);

import { microsoftPowerBiDataflowTransactionsResolver } from "@/integrations/microsoft-powerbi/options/dataflowTransactions";
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
    deps: { workspaceId: "ws-1", dataflowId: "df-1" },
    ...overrides,
  };
}

function txn(
  id: string,
  startTime: string | null,
  status: string | null,
): Record<string, unknown> {
  return { id, refreshType: "OnDemand", startTime, endTime: null, status };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTransactionsList.mockReset();
});

describe("microsoftPowerBiDataflowTransactionsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId','dataflowId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiDataflowTransactionsResolver.source).toBe(
      "microsoft-powerbi:dataflow_transactions",
    );
    expect(microsoftPowerBiDataflowTransactionsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(
      microsoftPowerBiDataflowTransactionsResolver.requiresIntegration,
    ).toBe(true);
    expect(microsoftPowerBiDataflowTransactionsResolver.requiredDeps).toEqual([
      "workspaceId",
      "dataflowId",
    ]);
  });
});

describe("microsoftPowerBiDataflowTransactionsResolver — mapping + sorting", () => {
  it("labels `<startTime> · <status>` and sorts in-progress first, then newest", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      transactions: [
        txn("txn-new-done", "2026-07-15T11:00:00Z", "Success"),
        txn("txn-progress-old", "2026-07-15T01:00:00Z", "InProgress"),
        txn("txn-old-done", "2026-07-14T03:00:00Z", "Failed"),
        txn("txn-progress-new", "2026-07-15T12:00:00Z", "InProgress"),
      ],
      hasMore: false,
    });

    const result =
      await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());

    expect(result.items.map((i) => i.value)).toEqual([
      "txn-progress-new",
      "txn-progress-old",
      "txn-new-done",
      "txn-old-done",
    ]);
    expect(result.items[0]!.label).toBe("2026-07-15T12:00:00Z · InProgress");
    expect(result.hasMore).toBe(false);
  });

  it("labels missing startTime/status honestly and surfaces wrapper hasMore", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      transactions: [txn("txn-1", null, null)],
      hasMore: true,
    });
    const result =
      await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "txn-1", label: "unknown start · unknown" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("requests a bounded page (top 100) from the wrapper", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockTransactionsList.mockResolvedValueOnce({
      transactions: [],
      hasMore: false,
    });

    await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());

    expect(mockTransactionsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
      dataflowId: "df-1",
      top: 100,
    });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      transactions: [
        txn("txn-1", "2026-07-15T11:00:00Z", "Success"),
        txn("txn-2", "2026-07-15T10:00:00Z", "Failed"),
      ],
      hasMore: false,
    });
    const result = await microsoftPowerBiDataflowTransactionsResolver.resolve(
      ctx({ q: "failed" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["txn-2"]);
  });
});

describe("microsoftPowerBiDataflowTransactionsResolver — dependencies + cascade", () => {
  it("throws MISSING_DEPENDENCY when workspaceId missing, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(
        ctx({ deps: { dataflowId: "df-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when dataflowId missing, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", dataflowId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent dataflow gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("dataflow df-ghost"),
    );
    const result = await microsoftPowerBiDataflowTransactionsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-1", dataflowId: "df-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiDataflowTransactionsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(
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
      microsoftPowerBiDataflowTransactionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'dataflow transactions GET failed: {"raw":"txn-secret-leak"} Bearer xyz',
      ),
    );
    try {
      await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("txn-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
