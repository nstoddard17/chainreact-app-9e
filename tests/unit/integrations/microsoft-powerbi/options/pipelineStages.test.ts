/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/pipelineStages.ts` —
 * depends on `pipelineId`; value is the stage ORDER as a string.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockStagesList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineStagesList",
  () => ({
    pipelineStagesList: (...args: unknown[]) => mockStagesList(...args),
  }),
);

import { microsoftPowerBiPipelineStagesResolver } from "@/integrations/microsoft-powerbi/options/pipelineStages";
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
  createdAt: "2026-07-14T00:00:00Z",
  updatedAt: "2026-07-14T00:00:00Z",
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

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockStagesList.mockReset();
});

describe("microsoftPowerBiPipelineStagesResolver — shape", () => {
  it("declares requiredDeps=['pipelineId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiPipelineStagesResolver.source).toBe(
      "microsoft-powerbi:pipeline_stages",
    );
    expect(microsoftPowerBiPipelineStagesResolver.requiredDeps).toEqual([
      "pipelineId",
    ]);
    expect(microsoftPowerBiPipelineStagesResolver.requiresIntegration).toBe(
      true,
    );
  });
});

describe("microsoftPowerBiPipelineStagesResolver — mapping", () => {
  it("value = String(order); label derives stage names and appends workspace name", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockStagesList.mockResolvedValueOnce([
      { order: 0, workspaceId: "ws-d", workspaceName: "Marketing [Dev]" },
      { order: 1, workspaceId: null, workspaceName: null },
      { order: 2, workspaceId: "ws-p", workspaceName: "Marketing" },
      { order: 3, workspaceId: null, workspaceName: null },
    ]);

    const result = await microsoftPowerBiPipelineStagesResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "0", label: "0 · Development (Marketing [Dev])" },
      { value: "1", label: "1 · Test" },
      { value: "2", label: "2 · Production (Marketing)" },
      { value: "3", label: "3 · Stage 3" },
    ]);
    expect(result.hasMore).toBe(false);
    expect(mockStagesList.mock.calls[0]![0].pipelineId).toBe("pipe-1");
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { order: 0, workspaceId: null, workspaceName: null },
      { order: 2, workspaceId: null, workspaceName: null },
    ]);
    const result = await microsoftPowerBiPipelineStagesResolver.resolve(
      ctx({ q: "prod" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });
});

describe("microsoftPowerBiPipelineStagesResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when pipelineId is empty/missing, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(
        ctx({ deps: { pipelineId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent pipeline gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("pipeline pipe-ghost"),
    );
    const result = await microsoftPowerBiPipelineStagesResolver.resolve(
      ctx({ deps: { pipelineId: "pipe-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPipelineStagesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('stages GET failed: {"raw":"stage-secret"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiPipelineStagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("stage-secret");
      expect(msg).not.toContain("Bearer");
    }
  });
});
