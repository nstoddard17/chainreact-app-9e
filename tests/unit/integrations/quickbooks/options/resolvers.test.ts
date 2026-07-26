/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — options resolvers: id values + names-only labels
 * (never emails/amounts/balances), disconnected guard, sanitized
 * provider errors, and local q filtering.
 */
const mockRefreshAndRetry = jest.fn();
const mockCustomerList = jest.fn();
const mockCustomersByIds = jest.fn();
const mockItemList = jest.fn();
const mockTermList = jest.fn();
const mockTaxCodeList = jest.fn();
const mockInvoiceList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class Unauthorized401Error extends Error {},
  IntegrationActionRequiredError: class IntegrationActionRequiredError extends Error {},
  InsufficientScopeError: class InsufficientScopeError extends Error {},
}));
jest.mock("@/integrations/_shared/quickbooks/api/customers", () => ({
  CUSTOMER_SEARCH_MAX_LENGTH: 100,
  customerList: (...args: unknown[]) => mockCustomerList(...args),
  customersByIds: (...args: unknown[]) => mockCustomersByIds(...args),
}));
jest.mock("@/integrations/_shared/quickbooks/api/catalog", () => ({
  itemList: (...args: unknown[]) => mockItemList(...args),
  termList: (...args: unknown[]) => mockTermList(...args),
  taxCodeList: (...args: unknown[]) => mockTaxCodeList(...args),
}));
jest.mock("@/integrations/_shared/quickbooks/api/invoices", () => ({
  invoiceList: (...args: unknown[]) => mockInvoiceList(...args),
}));

import { OptionsResolverError } from "@/services/options/types";
import { quickbooksCustomersResolver } from "@/integrations/quickbooks/options/customers";
import {
  quickbooksItemsResolver,
  quickbooksTaxCodesResolver,
  quickbooksTermsResolver,
} from "@/integrations/quickbooks/options/catalog";
import { quickbooksInvoicesResolver } from "@/integrations/quickbooks/options/invoices";

const INTEGRATION = {
  id: "int-1",
  accountId: "acct-1",
  provider: "quickbooks",
  providerAccountId: "913035",
  accountMetadata: {},
};

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acct-1",
    userId: "u-1",
    q: "",
    deps: {},
    integration: INTEGRATION,
    ...overrides,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

/** The wrapper's page envelope. */
const page = (
  items: { customerId: string | null; displayName: string | null }[],
  hasMore = false,
) => ({ items, hasMore, nextStartPosition: 1 + items.length });

describe("quickbooks:customers", () => {
  it("returns id values with NAME-ONLY labels (no emails/balances)", async () => {
    mockCustomerList.mockResolvedValueOnce(
      page([
        {
          customerId: "42",
          displayName: "Acme Corp",
          email: "secret@acme.test",
          balance: 999,
        },
        { customerId: "43", displayName: null },
      ] as never),
    );
    const result = await quickbooksCustomersResolver.resolve(ctx());
    // Provider order (ORDERBY DisplayName) is preserved — no local re-sort.
    expect(result.items).toEqual([
      { value: "42", label: "Acme Corp" },
      { value: "43", label: "43" },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret@acme.test");
    expect(JSON.stringify(result)).not.toContain("999");
  });

  it("pushes the search term to QuickBooks instead of filtering locally", async () => {
    mockCustomerList.mockResolvedValueOnce(page([{ customerId: "2", displayName: "Globex" }]));
    const result = await quickbooksCustomersResolver.resolve(ctx({ q: "glo" }));
    expect(mockCustomerList).toHaveBeenCalledWith(
      expect.objectContaining({ search: "glo", maxResults: 100, realmId: "913035" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });

  it("trims the search term and omits it when empty", async () => {
    mockCustomerList.mockResolvedValue(page([]));
    await quickbooksCustomersResolver.resolve(ctx({ q: "   spaced   " }));
    expect(mockCustomerList).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "spaced" }),
    );
    await quickbooksCustomersResolver.resolve(ctx({ q: "    " }));
    expect(mockCustomerList.mock.calls.at(-1)![0]).not.toHaveProperty("search");
  });

  it("caps an overlong search term", async () => {
    mockCustomerList.mockResolvedValueOnce(page([]));
    await quickbooksCustomersResolver.resolve(ctx({ q: "x".repeat(500) }));
    expect(
      (mockCustomerList.mock.calls[0]![0] as { search: string }).search.length,
    ).toBe(100);
  });

  it("returns an empty list for a no-match search without erroring", async () => {
    mockCustomerList.mockResolvedValueOnce(page([]));
    const result = await quickbooksCustomersResolver.resolve(ctx({ q: "nomatch" }));
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("passes a quote-bearing term through as a literal search value", async () => {
    mockCustomerList.mockResolvedValueOnce(page([]));
    await quickbooksCustomersResolver.resolve(ctx({ q: "o'brien' or Active = false or '" }));
    // The resolver forwards the RAW term; escaping is the wrapper's job (it
    // owns statement construction), proven in the wrapper's own suite.
    expect(mockCustomerList).toHaveBeenCalledWith(
      expect.objectContaining({ search: "o'brien' or Active = false or '" }),
    );
  });

  it("reports hasMore straight from the provider page", async () => {
    mockCustomerList.mockResolvedValueOnce(
      page([{ customerId: "1", displayName: "A" }], true),
    );
    const result = await quickbooksCustomersResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("throws INTEGRATION_DISCONNECTED without an integration (no fetch)", async () => {
    await expect(
      quickbooksCustomersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockCustomerList).not.toHaveBeenCalled();
  });

  describe("saved-selection label backfill", () => {
    it("resolves a selected value that is absent from the current page", async () => {
      mockCustomerList.mockResolvedValueOnce(
        page([{ customerId: "1", displayName: "Aardvark Ltd" }]),
      );
      mockCustomersByIds.mockResolvedValueOnce([
        { customerId: "457", displayName: "Zeta Industries" },
      ]);
      const result = await quickbooksCustomersResolver.resolve(
        ctx({ selected: ["457"] }),
      );
      expect(mockCustomersByIds).toHaveBeenCalledWith(
        expect.objectContaining({ ids: ["457"], realmId: "913035" }),
      );
      // Selected first, so a picker can label its chip immediately.
      expect(result.items).toEqual([
        { value: "457", label: "Zeta Industries" },
        { value: "1", label: "Aardvark Ltd" },
      ]);
    });

    it("does not re-fetch a selected value already on the page", async () => {
      mockCustomerList.mockResolvedValueOnce(
        page([{ customerId: "1", displayName: "Aardvark Ltd" }]),
      );
      const result = await quickbooksCustomersResolver.resolve(ctx({ selected: ["1"] }));
      expect(mockCustomersByIds).not.toHaveBeenCalled();
      expect(result.items).toEqual([{ value: "1", label: "Aardvark Ltd" }]);
    });

    it("makes no lookup call when nothing is selected", async () => {
      mockCustomerList.mockResolvedValueOnce(page([]));
      await quickbooksCustomersResolver.resolve(ctx());
      expect(mockCustomersByIds).not.toHaveBeenCalled();
    });

    it("never duplicates an option across the selection and the page", async () => {
      mockCustomerList.mockResolvedValueOnce(
        page([
          { customerId: "1", displayName: "Aardvark Ltd" },
          { customerId: "457", displayName: "Zeta Industries" },
        ]),
      );
      const result = await quickbooksCustomersResolver.resolve(
        ctx({ selected: ["457"] }),
      );
      expect(result.items.map((i) => i.value)).toEqual(["1", "457"]);
    });

    it("tolerates a selected value that no longer exists", async () => {
      mockCustomerList.mockResolvedValueOnce(
        page([{ customerId: "1", displayName: "Aardvark Ltd" }]),
      );
      mockCustomersByIds.mockResolvedValueOnce([]); // deleted customer
      const result = await quickbooksCustomersResolver.resolve(
        ctx({ selected: ["gone"] }),
      );
      expect(result.items).toEqual([{ value: "1", label: "Aardvark Ltd" }]);
    });

    it("keeps the search and the selection independent", async () => {
      mockCustomerList.mockResolvedValueOnce(
        page([{ customerId: "9", displayName: "Globex" }]),
      );
      mockCustomersByIds.mockResolvedValueOnce([
        { customerId: "457", displayName: "Zeta Industries" },
      ]);
      const result = await quickbooksCustomersResolver.resolve(
        ctx({ q: "glo", selected: ["457"] }),
      );
      expect(mockCustomerList).toHaveBeenCalledWith(
        expect.objectContaining({ search: "glo" }),
      );
      // The selection survives a search that does not match it.
      expect(result.items.map((i) => i.value)).toEqual(["457", "9"]);
    });
  });

  it("resolves under the account's own realm, never a client-supplied one", async () => {
    mockCustomerList.mockResolvedValueOnce(page([]));
    await quickbooksCustomersResolver.resolve(ctx({ q: "x" }));
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        provider: "quickbooks",
        providerAccountId: "913035",
      }),
    );
    expect(mockCustomerList).toHaveBeenCalledWith(
      expect.objectContaining({ realmId: "913035" }),
    );
  });

  it("sanitizes provider failures to PROVIDER_ERROR (static copy)", async () => {
    mockCustomerList.mockRejectedValueOnce(
      new Error("raw provider stack trace with ids"),
    );
    const err = await quickbooksCustomersResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toContain("stack trace");
  });
});

describe("catalog resolvers", () => {
  it.each([
    ["quickbooks:items", quickbooksItemsResolver, mockItemList],
    ["quickbooks:terms", quickbooksTermsResolver, mockTermList],
    ["quickbooks:tax_codes", quickbooksTaxCodesResolver, mockTaxCodeList],
  ] as const)("%s maps {id,name} entries to options", async (_source, resolver, mock) => {
    mock.mockResolvedValueOnce([{ id: "7", name: "Consulting" }]);
    const result = await resolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "7", label: "Consulting" }]);
  });
});

describe("quickbooks:invoices", () => {
  it("labels are `#DocNumber · CustomerName` — never amounts or emails", async () => {
    mockInvoiceList.mockResolvedValueOnce({
      items: [
        {
          invoiceId: "145",
          docNumber: "1045",
          customerName: "Acme Corp",
          totalAmount: 250,
          billEmail: "billing@acme.test",
        },
        { invoiceId: "146", docNumber: null, customerName: null },
      ],
      hasMore: false,
      nextStartPosition: 3,
    });
    const result = await quickbooksInvoicesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "145", label: "#1045 · Acme Corp" },
      { value: "146", label: "id 146" },
    ]);
    expect(JSON.stringify(result)).not.toContain("250");
    expect(JSON.stringify(result)).not.toContain("billing@acme.test");
  });
});
