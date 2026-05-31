/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onenote/options/sections.ts` —
 * Slice 3.ONENOTE-3.
 *
 * Pin:
 *   - Shape: requiredDeps=["notebookId"], requiresIntegration=true.
 *   - Wrapper invocation via sectionsList with notebookId=ctx.deps.notebookId,
 *     orderBy=displayName asc, top=100.
 *   - refreshAndRetry pinned to integration.providerAccountId.
 *   - Mapping (id → value, displayName → label, no description per design).
 *   - Drops sections with missing/empty id.
 *   - MISSING_DEPENDENCY when ctx.deps.notebookId is empty / missing.
 *   - NotFoundError (parent notebook gone) → empty items (NOT throw).
 *   - hasMore reflects nextLink presence.
 *   - Case-insensitive q filter.
 *   - Error sanitization.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftOneNoteSectionsResolver } from "@/integrations/microsoft-onenote/options/sections";
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
    deps: { notebookId: "nb-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftOneNoteSectionsResolver — shape", () => {
  it("declares requiredDeps=['notebookId'] (camelCase, V1-preserved) and requires an integration", () => {
    expect(microsoftOneNoteSectionsResolver.source).toBe(
      "microsoft-onenote:sections",
    );
    expect(microsoftOneNoteSectionsResolver.provider).toBe("microsoft-onenote");
    expect(microsoftOneNoteSectionsResolver.requiresIntegration).toBe(true);
    expect(microsoftOneNoteSectionsResolver.requiredDeps).toEqual([
      "notebookId",
    ]);
  });
});

describe("microsoftOneNoteSectionsResolver — wrapper invocation", () => {
  it("threads notebookId + orderBy=displayName asc + top=100 into the sectionsList call", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await microsoftOneNoteSectionsResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/onenote/notebooks/nb-1/sections");
    const params = new URL(url).searchParams;
    expect(params.get("$orderby")).toBe("displayName asc");
    expect(params.get("$top")).toBe("100");
    fetchSpy.mockRestore();
  });

  it("pins refreshAndRetry accountId to integration.providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ sections: [], nextLink: null });
    await microsoftOneNoteSectionsResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftOneNoteSectionsResolver — mapping", () => {
  it("maps id → value, displayName → label (no description per design)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [
        {
          id: "sec-1",
          displayName: "Meeting Notes",
          lastModifiedDateTime: "2026-05-22T14:30:00Z",
        },
        { id: "sec-2", displayName: "Ideas" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "sec-1", label: "Meeting Notes" },
      { value: "sec-2", label: "Ideas" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id when displayName is missing or empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [{ id: "sec-1" }, { id: "sec-2", displayName: "" }],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "sec-1", label: "sec-1" },
      { value: "sec-2", label: "sec-2" },
    ]);
  });

  it("drops sections with missing or empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [
        { displayName: "No id" },
        { id: "", displayName: "Empty id" },
        { id: "sec-good", displayName: "Good" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["sec-good"]);
  });

  it("returns empty items when sections array is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ sections: [], nextLink: null });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [
        { id: "s1", displayName: "Meeting Notes" },
        { id: "s2", displayName: "Personal Notes" },
        { id: "s3", displayName: "Recipes" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(
      ctx({ q: "NOTES" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["s1", "s2"]);
  });

  it("hasMore=true when nextLink is set", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [{ id: "s1", displayName: "First" }],
      nextLink: "https://graph.microsoft.com/v1.0/me/onenote/...?$skip=100",
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneNoteSectionsResolver — dependency + cascade-fallback handling", () => {
  it("throws MISSING_DEPENDENCY when ctx.deps.notebookId is empty, no API call", async () => {
    await expect(
      microsoftOneNoteSectionsResolver.resolve(ctx({ deps: { notebookId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when ctx.deps.notebookId is missing, no API call", async () => {
    await expect(
      microsoftOneNoteSectionsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent notebook gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError(
        "onenote sections for notebook nb-ghost",
        "Item not found",
      ),
    );
    const result = await microsoftOneNoteSectionsResolver.resolve(
      ctx({ deps: { notebookId: "nb-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftOneNoteSectionsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null, no API call", async () => {
    await expect(
      microsoftOneNoteSectionsResolver.resolve(ctx({ integration: null })),
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
      await microsoftOneNoteSectionsResolver.resolve(ctx());
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
      microsoftOneNoteSectionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Microsoft Graph me/onenote/notebooks/{id}/sections GET failed: {"raw":"sections-secret-leak"}',
      ),
    );
    try {
      await microsoftOneNoteSectionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("sections-secret-leak");
      expect(msg).not.toContain("raw");
      expect(msg).not.toContain("Bearer");
    }
  });
});
