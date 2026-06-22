/**
 * @jest-environment node
 *
 * Tests for `integrations/notion/options/pages.ts`.
 *
 * Pin: shape, search invocation (page filter + q forwarded), mapping
 * (id→value, title→label with url/id fallback), non-page hits skipped, errors.
 */
const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});

import { notionPagesResolver } from "@/integrations/notion/options/pages";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "notion",
  providerAccountId: "notion-ws-1",
  displayName: "Acme (Notion)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const ctx = (o: Partial<OptionsResolverContext> = {}): OptionsResolverContext => ({
  userId: "user-1",
  integration,
  q: "",
  deps: {},
  ...o,
});

beforeEach(() => mockRefreshAndRetry.mockReset());

describe("notionPagesResolver", () => {
  it("declares no requiredDeps and requires an integration", () => {
    expect(notionPagesResolver.source).toBe("notion:pages");
    expect(notionPagesResolver.requiresIntegration).toBe(true);
    expect(notionPagesResolver.requiredDeps).toBeUndefined();
  });

  it("invokes search with the page filter and forwards q", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: "list", results: [], has_more: false, next_cursor: null }), { status: 200 }));
    mockRefreshAndRetry.mockImplementationOnce(
      async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
    );
    await notionPagesResolver.resolve(ctx({ q: "road" }));
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body));
    expect(body.query).toBe("road");
    expect(body.filter).toEqual({ value: "page", property: "object" });
    fetchSpy.mockRestore();
  });

  it("maps page id→value and extracts the title property as label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        {
          object: "page",
          id: "p1",
          properties: {
            Name: { type: "title", title: [{ plain_text: "Road" }, { plain_text: "map" }] },
          },
        },
        // database hits are skipped
        { object: "database", id: "db1" },
        // page with no title → url fallback
        { object: "page", id: "p2", url: "https://notion.so/p2" },
        // page with neither → id fallback
        { object: "page", id: "p3" },
      ],
      has_more: false,
      next_cursor: null,
    });
    const result = await notionPagesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "p1", label: "Roadmap" },
      { value: "p2", label: "https://notion.so/p2" },
      { value: "p3", label: "p3" },
    ]);
  });

  it("maps a 401 to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(notionPagesResolver.resolve(ctx())).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
