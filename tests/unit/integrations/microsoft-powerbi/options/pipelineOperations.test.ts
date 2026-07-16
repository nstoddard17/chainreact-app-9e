/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/pipelineOperations.ts`.
 * Depends on `pipelineId`; value = operation id, label =
 * `<executionStartTime> · <status>`, most recent first. `hasMore` is always
 * false — the provider caps this endpoint at the 20 most recent operations.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockOperationsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineOperationsList",
  () => ({
    pipelineOperationsList: (...args: unknown[]) => mockOperationsList(...args),
  }),
);

import { microsoftPowerBiPipelineOperationsResolver } from "@/integrations/microsoft-powerbi/options/pipelineOperations";
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
    deps: { pipelineId: "pipe-1" },
    ...overrides,
  };
}

function operation(
  operationId: string,
  executionStartTime: string | null,
  status: string,
): Record<string, unknown> {
  return {
    operationId,
    status,
    executionStartTime,
    executionEndTime: null,
    sourceStageOrder: 0,
    targetStageOrder: 1,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOperationsList.mockReset();
});

describe("microsoftPowerBiPipelineOperationsResolver — shape", () => {
  it("declares requiredDeps=['pipelineId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiPipelineOperationsResolver.source).toBe(
      "microsoft-powerbi:pipeline_operations",
    );
    expect(microsoftPowerBiPipelineOperationsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiPipelineOperationsResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftPowerBiPipelineOperationsResolver.requiredDeps).toEqual([
      "pipelineId",
    ]);
  });
});

describe("microsoftPowerBiPipelineOperationsResolver — mapping + sorting", () => {
  it("labels `<executionStartTime> · <status>` and sorts most recent first", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      operation("op-old", "2026-07-14T03:00:00Z", "Succeeded"),
      operation("op-new", "2026-07-15T12:00:00Z", "Failed"),
      operation("op-mid", "2026-07-15T01:00:00Z", "Succeeded"),
    ]);

    const result =
      await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());

    expect(result.items.map((i) => i.value)).toEqual([
      "op-new",
      "op-mid",
      "op-old",
    ]);
    expect(result.items[0]!.label).toBe("2026-07-15T12:00:00Z · Failed");
    expect(result.hasMore).toBe(false);
  });

  it("falls back gracefully when executionStartTime is null (not-yet-started sorts last)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      operation("op-pending", null, "NotStarted"),
      operation("op-started", "2026-07-15T12:00:00Z", "Executing"),
    ]);
    const result =
      await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "op-started", label: "2026-07-15T12:00:00Z · Executing" },
      { value: "op-pending", label: "not started · NotStarted" },
    ]);
  });

  it("passes pipelineId through to the wrapper", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockOperationsList.mockResolvedValueOnce([]);

    await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());

    expect(mockOperationsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      pipelineId: "pipe-1",
    });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      operation("op-1", "2026-07-15T11:00:00Z", "Succeeded"),
      operation("op-2", "2026-07-15T10:00:00Z", "Failed"),
    ]);
    const result = await microsoftPowerBiPipelineOperationsResolver.resolve(
      ctx({ q: "failed" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["op-2"]);
  });
});

describe("microsoftPowerBiPipelineOperationsResolver — dependencies + cascade", () => {
  it("throws MISSING_DEPENDENCY when pipelineId missing, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineOperationsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent pipeline gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("pipeline pipe-ghost"),
    );
    const result = await microsoftPowerBiPipelineOperationsResolver.resolve(
      ctx({ deps: { pipelineId: "pipe-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPipelineOperationsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineOperationsResolver.resolve(
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
      microsoftPowerBiPipelineOperationsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelineOperationsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'pipeline operations GET failed: {"raw":"op-secret-leak"} Bearer xyz',
      ),
    );
    try {
      await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("op-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
