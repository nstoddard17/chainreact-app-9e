/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/ticketPipelines.ts` —
 * Slice 3.HUBSPOT-2.
 *
 * Structurally identical to `dealPipelines.test.ts`; this suite
 * focuses on the diff (objectType="tickets") + a quick shape check
 * so cross-resolver drift fails loudly.
 */
const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { hubspotTicketPipelinesResolver } from "@/integrations/hubspot/options/ticketPipelines";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("hubspotTicketPipelinesResolver", () => {
  it("declares shape", () => {
    expect(hubspotTicketPipelinesResolver.source).toBe(
      "hubspot:ticket_pipelines",
    );
    expect(hubspotTicketPipelinesResolver.provider).toBe("hubspot");
    expect(hubspotTicketPipelinesResolver.requiresIntegration).toBe(true);
    expect(hubspotTicketPipelinesResolver.requiredDeps).toBeUndefined();
  });

  it("apiCall closure invokes pipelinesList with objectType='tickets'", async () => {
    // Capture the apiCall closure handed to refreshAndRetry, invoke
    // it with a stubbed accessToken, intercept the underlying fetch,
    // and assert the URL HubSpot would receive — proving objectType
    // is wired to "tickets".
    let observedUrl: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      observedUrl =
        typeof input === "string" ? input : String(input);
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      mockRefreshAndRetry.mockImplementationOnce(
        async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) =>
          apiCall("stub-token"),
      );
      await hubspotTicketPipelinesResolver.resolve(ctx());
      expect(observedUrl).toContain("/crm/v3/pipelines/tickets");
      // Defensive: must NOT call the deals endpoint.
      expect(observedUrl).not.toContain("/pipelines/deals");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps ticket pipelines correctly", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "support", label: "Support" },
        { id: "incidents", label: "Incidents" },
        { id: "old", label: "Old", archived: true },
      ],
    });
    const result = await hubspotTicketPipelinesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "support", label: "Support" },
      { value: "incidents", label: "Incidents" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("case-insensitive q filter on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "support", label: "Support" },
        { id: "incidents", label: "Incidents" },
      ],
    });
    const result = await hubspotTicketPipelinesResolver.resolve(
      ctx({ q: "INCID" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["incidents"]);
  });

  it("Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      hubspotTicketPipelinesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET failed: {"raw":"ticket-secret"}'),
    );
    try {
      await hubspotTicketPipelinesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as Error).message).not.toContain("ticket-secret");
    }
  });
});
