/**
 * @jest-environment node
 *
 * Tests for `integrations/airtable/options/tables.ts` — Slice
 * 4.AIRTABLE-META-2. Depends on `baseId`; value = table id (trigger
 * recordChangeScope needs an id; actions accept id|name).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { airtableTablesResolver } from "@/integrations/airtable/options/tables";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
  provider: "airtable",
  providerAccountId: "usrAIRTABLEUSER",
  displayName: "Alice (Airtable)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-25T12:00:00Z",
  scopes: ["schema.bases:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

const SCHEMA = {
  tables: [
    {
      id: "tbl1",
      name: "Tasks",
      primaryFieldId: "fld1",
      fields: [
        { id: "fld1", name: "Name", type: "singleLineText" },
        { id: "fld2", name: "Done", type: "checkbox" },
      ],
    },
    {
      id: "tbl2",
      name: "Users",
      primaryFieldId: "fld3",
      fields: [{ id: "fld3", name: "Email", type: "email" }],
    },
  ],
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { baseId: "appBASE" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("airtableTablesResolver — shape", () => {
  it("declares requiredDeps=['baseId'] (schema-verbatim) and requires an integration", () => {
    expect(airtableTablesResolver.source).toBe("airtable:tables");
    expect(airtableTablesResolver.provider).toBe("airtable");
    expect(airtableTablesResolver.requiresIntegration).toBe(true);
    expect(airtableTablesResolver.requiredDeps).toEqual(["baseId"]);
  });
});

describe("airtableTablesResolver — wrapper invocation", () => {
  it("calls basesGetSchema with the baseId via refreshAndRetry pinned to providerAccountId", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tables: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    await airtableTablesResolver.resolve(ctx());

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://api.airtable.com/v0/meta/bases/appBASE/tables",
    );
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("airtable");
    expect(args.accountId).toBe("usrAIRTABLEUSER");
  });
});

describe("airtableTablesResolver — mapping (value = table ID)", () => {
  it("maps table id → value (NOT name), name → label, field count → description; preserves schema order", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableTablesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "tbl1", label: "Tasks", description: "2 fields" },
      { value: "tbl2", label: "Users", description: "1 field" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("value is the table id so the trigger recordChangeScope + id-or-name actions both work", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableTablesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["tbl1", "tbl2"]);
    // Explicitly NOT the names.
    expect(result.items.map((i) => i.value)).not.toContain("Tasks");
  });

  it("drops tables with empty/missing id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      tables: [
        { id: "", name: "Ghost", fields: [] },
        { id: "tblReal", name: "Real", fields: [] },
      ],
    });
    const result = await airtableTablesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["tblReal"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(SCHEMA);
    const result = await airtableTablesResolver.resolve(ctx({ q: "user" }));
    expect(result.items.map((i) => i.value)).toEqual(["tbl2"]);
  });
});

describe("airtableTablesResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when baseId is empty, no API call", async () => {
    await expect(
      airtableTablesResolver.resolve(ctx({ deps: { baseId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when baseId is missing, no API call", async () => {
    await expect(
      airtableTablesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent base is gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("base appGHOST", "no base"),
    );
    const result = await airtableTablesResolver.resolve(
      ctx({ deps: { baseId: "appGHOST" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("airtableTablesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      airtableTablesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "airtable",
        accountId: "usrAIRTABLEUSER",
        reason: "refresh_failed",
      }),
    );
    await expect(airtableTablesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(airtableTablesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('schema GET failed: {"raw":"tbl-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableTablesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("tbl-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
