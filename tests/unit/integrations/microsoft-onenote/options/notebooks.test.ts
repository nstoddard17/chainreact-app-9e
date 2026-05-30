/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onenote/options/notebooks.ts` —
 * Slice 3.ONENOTE-3.
 *
 * Pin:
 *   - Shape: no requiredDeps, requiresIntegration=true, provider key.
 *   - Wrapper invocation via notebooksList with orderBy=displayName asc,
 *     top=100, accountId pinned to integration.providerAccountId.
 *   - refreshAndRetry uses provider="microsoft-onenote".
 *   - Mapping (id → value, displayName → label, lastModifiedDateTime →
 *     "Modified YYYY-MM-DD" description).
 *   - Empty response → empty items.
 *   - Drops notebooks with missing/empty id.
 *   - Falls back to id when displayName missing/empty.
 *   - hasMore reflects nextLink presence.
 *   - Case-insensitive q filter against label.
 *   - Error sanitization (Unauthorized401, IntegrationActionRequired,
 *     generic — no raw Graph body leak).
 *   - null integration → INTEGRATION_DISCONNECTED, no API call.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftOneNoteNotebooksResolver } from "@/integrations/microsoft-onenote/options/notebooks";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
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
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftOneNoteNotebooksResolver — shape", () => {
  it("declares no requiredDeps and requires an integration", () => {
    expect(microsoftOneNoteNotebooksResolver.source).toBe(
      "microsoft-onenote:notebooks",
    );
    expect(microsoftOneNoteNotebooksResolver.provider).toBe(
      "microsoft-onenote",
    );
    expect(microsoftOneNoteNotebooksResolver.requiresIntegration).toBe(true);
    expect(microsoftOneNoteNotebooksResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftOneNoteNotebooksResolver — wrapper invocation", () => {
  it("calls refreshAndRetry pinned to provider=microsoft-onenote + accountId=integration.providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ notebooks: [], nextLink: null });
    await microsoftOneNoteNotebooksResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.userId).toBe("user-1");
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.accountId).toBe("alice@contoso.com");
    expect(typeof args.apiCall).toBe("function");
  });

  it("threads orderBy=displayName asc + top=100 into the Graph URL", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await microsoftOneNoteNotebooksResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/onenote/notebooks");
    const params = new URL(url).searchParams;
    expect(params.get("$orderby")).toBe("displayName asc");
    expect(params.get("$top")).toBe("100");
    fetchSpy.mockRestore();
  });
});

describe("microsoftOneNoteNotebooksResolver — mapping", () => {
  it("maps id → value, displayName → label, lastModifiedDateTime → 'Modified YYYY-MM-DD' description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        {
          id: "nb-1",
          displayName: "Work",
          lastModifiedDateTime: "2026-05-22T14:30:00Z",
        },
        {
          id: "nb-2",
          displayName: "Personal",
          lastModifiedDateTime: "2026-04-01T09:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "nb-1", label: "Work", description: "Modified 2026-05-22" },
      { value: "nb-2", label: "Personal", description: "Modified 2026-04-01" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when lastModifiedDateTime is missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [{ id: "nb-1", displayName: "Work" }],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "nb-1", label: "Work" }]);
  });

  it("omits description when lastModifiedDateTime is not ISO-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        {
          id: "nb-1",
          displayName: "Work",
          lastModifiedDateTime: "not-a-date",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "nb-1", label: "Work" }]);
  });

  it("falls back to id when displayName is missing or empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        { id: "nb-1" },
        { id: "nb-2", displayName: "" },
        { id: "nb-3", displayName: "Named" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "nb-1", label: "nb-1" },
      { value: "nb-2", label: "nb-2" },
      { value: "nb-3", label: "Named" },
    ]);
  });

  it("drops notebooks with missing or empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        { displayName: "No id" },
        { id: "", displayName: "Empty id" },
        { id: "nb-good", displayName: "Good" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["nb-good"]);
  });

  it("returns empty items when notebooks array is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ notebooks: [], nextLink: null });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        { id: "nb-1", displayName: "Work Notes" },
        { id: "nb-2", displayName: "Personal Notes" },
        { id: "nb-3", displayName: "Recipes" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(
      ctx({ q: "NOTES" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["nb-1", "nb-2"]);
  });

  it("hasMore=true when nextLink is set", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [{ id: "nb-1", displayName: "Work" }],
      nextLink: "https://graph.microsoft.com/v1.0/me/onenote/notebooks?$skip=100",
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneNoteNotebooksResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null, no API call", async () => {
    await expect(
      microsoftOneNoteNotebooksResolver.resolve(ctx({ integration: null })),
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
      await microsoftOneNoteNotebooksResolver.resolve(ctx());
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
      microsoftOneNoteNotebooksResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Microsoft Graph me/onenote/notebooks GET failed: {"raw":"onenote-secret-token-leak"}',
      ),
    );
    try {
      await microsoftOneNoteNotebooksResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("onenote-secret-token-leak");
      expect(msg).not.toContain("raw");
      expect(msg).not.toContain("Bearer");
      expect(msg).not.toContain("decrypted-token");
    }
  });
});
