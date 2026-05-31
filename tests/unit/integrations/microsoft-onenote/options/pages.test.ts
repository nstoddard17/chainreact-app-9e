/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onenote/options/pages.ts` —
 * Slice 3.ONENOTE-3.
 *
 * Pin:
 *   - Shape: requiredDeps=["sectionId"], requiresIntegration=true.
 *   - Wrapper invocation via pagesList with sectionId=ctx.deps.sectionId,
 *     orderBy=lastModifiedDateTime desc, top=100.
 *   - refreshAndRetry pinned to integration.providerAccountId.
 *   - Mapping (id → value, title → label, lastModifiedDateTime →
 *     "Modified YYYY-MM-DD" description).
 *   - Falls back to id when title missing.
 *   - Drops pages with missing/empty id.
 *   - MISSING_DEPENDENCY when ctx.deps.sectionId is empty / missing.
 *   - NotFoundError (parent section gone) → empty items (NOT throw).
 *   - hasMore reflects nextLink presence.
 *   - Case-insensitive q filter.
 *   - Error sanitization (no raw Graph body leak).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftOneNotePagesResolver } from "@/integrations/microsoft-onenote/options/pages";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
  scopes: ["offline_access", "Notes.ReadWrite"],
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
    deps: { sectionId: "sec-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftOneNotePagesResolver — shape", () => {
  it("declares requiredDeps=['sectionId'] (camelCase, V1-preserved) and requires an integration", () => {
    expect(microsoftOneNotePagesResolver.source).toBe("microsoft-onenote:pages");
    expect(microsoftOneNotePagesResolver.provider).toBe("microsoft-onenote");
    expect(microsoftOneNotePagesResolver.requiresIntegration).toBe(true);
    expect(microsoftOneNotePagesResolver.requiredDeps).toEqual(["sectionId"]);
  });
});

describe("microsoftOneNotePagesResolver — wrapper invocation", () => {
  it("threads sectionId + orderBy=lastModifiedDateTime desc + top=100 into the pagesList call", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await microsoftOneNotePagesResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/onenote/sections/sec-1/pages");
    const params = new URL(url).searchParams;
    expect(params.get("$orderby")).toBe("lastModifiedDateTime desc");
    expect(params.get("$top")).toBe("100");
    fetchSpy.mockRestore();
  });

  it("pins refreshAndRetry accountId to integration.providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ pages: [], nextLink: null });
    await microsoftOneNotePagesResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftOneNotePagesResolver — mapping", () => {
  it("maps id → value, title → label, lastModifiedDateTime → 'Modified YYYY-MM-DD' description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          title: "Sprint planning",
          lastModifiedDateTime: "2026-05-22T14:30:00Z",
        },
        {
          id: "p-2",
          title: "Retro",
          lastModifiedDateTime: "2026-05-01T09:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "p-1", label: "Sprint planning", description: "Modified 2026-05-22" },
      { value: "p-2", label: "Retro", description: "Modified 2026-05-01" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when lastModifiedDateTime is missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [{ id: "p-1", title: "Untitled-ish" }],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "p-1", label: "Untitled-ish" }]);
  });

  it("omits description when lastModifiedDateTime is not ISO-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { id: "p-1", title: "Bad date", lastModifiedDateTime: "yesterday" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "p-1", label: "Bad date" }]);
  });

  it("falls back to id when title is missing or empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { id: "p-1" },
        { id: "p-2", title: "" },
        { id: "p-3", title: "Named" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items.map((i) => ({ v: i.value, l: i.label }))).toEqual([
      { v: "p-1", l: "p-1" },
      { v: "p-2", l: "p-2" },
      { v: "p-3", l: "Named" },
    ]);
  });

  it("drops pages with missing or empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { title: "No id" },
        { id: "", title: "Empty id" },
        { id: "p-good", title: "Good" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["p-good"]);
  });

  it("returns empty items when pages array is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ pages: [], nextLink: null });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { id: "p1", title: "Sprint planning" },
        { id: "p2", title: "Sprint retro" },
        { id: "p3", title: "Recipe ideas" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(
      ctx({ q: "SPRINT" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["p1", "p2"]);
  });

  it("hasMore=true when nextLink is set", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [{ id: "p1", title: "First" }],
      nextLink: "https://graph.microsoft.com/v1.0/me/onenote/...?$skip=100",
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneNotePagesResolver — dependency + cascade-fallback handling", () => {
  it("throws MISSING_DEPENDENCY when ctx.deps.sectionId is empty, no API call", async () => {
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx({ deps: { sectionId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when ctx.deps.sectionId is missing, no API call", async () => {
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent section gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError(
        "onenote pages for section sec-ghost",
        "Item not found",
      ),
    );
    const result = await microsoftOneNotePagesResolver.resolve(
      ctx({ deps: { sectionId: "sec-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftOneNotePagesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null, no API call", async () => {
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED with reconnect prompt", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-onenote",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    try {
      await microsoftOneNotePagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe(
        "INTEGRATION_DISCONNECTED",
      );
      expect((err as Error).message).toContain("Reconnect");
    }
  });

  it("maps Unauthorized401Error (defense in depth) → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Microsoft Graph me/onenote/sections/{id}/pages GET failed: {"raw":"pages-secret-leak"}',
      ),
    );
    try {
      await microsoftOneNotePagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("pages-secret-leak");
      expect(msg).not.toContain("raw");
      expect(msg).not.toContain("Bearer");
    }
  });
});
