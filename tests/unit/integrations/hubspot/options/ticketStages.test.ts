/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/ticketStages.ts` —
 * Slice 3.HUBSPOT-2.
 *
 * Structurally mirrors `dealStages.test.ts`; differences focused
 * here:
 *   - requiredDeps=["hs_pipeline"] (NOT "pipeline").
 *   - apiCall closure routes to objectType="tickets".
 *   - missing dep field name matches the schema's `hs_pipeline`.
 */
const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { hubspotTicketStagesResolver } from "@/integrations/hubspot/options/ticketStages";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
  provider: "hubspot",
  providerAccountId: "1234567",
  displayName: "Acme",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["tickets"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { hs_pipeline: "support" },
    ...overrides,
  };
}

const TICKET_PIPELINES = {
  results: [
    {
      id: "support",
      label: "Support",
      stages: [
        { id: "new", label: "New", displayOrder: 0 },
        { id: "in-progress", label: "In Progress", displayOrder: 1 },
        { id: "closed", label: "Closed", displayOrder: 2 },
        { id: "old", label: "Old", archived: true },
      ],
    },
    {
      id: "incidents",
      label: "Incidents",
      stages: [
        { id: "open", label: "Open", displayOrder: 0 },
        { id: "resolved", label: "Resolved", displayOrder: 1 },
      ],
    },
  ],
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("hubspotTicketStagesResolver", () => {
  it("declares requiredDeps=['hs_pipeline'] (NOT 'pipeline' — schema uses hs_pipeline)", () => {
    expect(hubspotTicketStagesResolver.source).toBe("hubspot:ticket_stages");
    expect(hubspotTicketStagesResolver.requiredDeps).toEqual(["hs_pipeline"]);
  });

  it("returns stages of the selected ticket pipeline in order, dropping archived", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TICKET_PIPELINES);
    const result = await hubspotTicketStagesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "new",
      "in-progress",
      "closed",
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("returns the other ticket pipeline's stages when hs_pipeline=incidents", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TICKET_PIPELINES);
    const result = await hubspotTicketStagesResolver.resolve(
      ctx({ deps: { hs_pipeline: "incidents" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["open", "resolved"]);
  });

  it("returns empty items when ticket pipeline id does not exist", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TICKET_PIPELINES);
    const result = await hubspotTicketStagesResolver.resolve(
      ctx({ deps: { hs_pipeline: "ghost" } }),
    );
    expect(result.items).toEqual([]);
  });

  it("throws MISSING_DEPENDENCY when hs_pipeline empty", async () => {
    await expect(
      hubspotTicketStagesResolver.resolve(ctx({ deps: { hs_pipeline: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      hubspotTicketStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET failed: {"raw":"ticket-stage-secret"}'),
    );
    try {
      await hubspotTicketStagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as Error).message).not.toContain("ticket-stage-secret");
    }
  });

  it("apiCall closure invokes pipelinesList with objectType='tickets'", async () => {
    let observedUrl: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      observedUrl =
        typeof input === "string" ? input : String(input);
      return new Response(JSON.stringify(TICKET_PIPELINES), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      mockRefreshAndRetry.mockImplementationOnce(
        async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) =>
          apiCall("stub-token"),
      );
      await hubspotTicketStagesResolver.resolve(ctx());
      expect(observedUrl).toContain("/crm/v3/pipelines/tickets");
      expect(observedUrl).not.toContain("/pipelines/deals");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
