/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — options resolvers: id values + names-only labels
 * (never emails/amounts/balances), disconnected guard, sanitized
 * provider errors, and local q filtering.
 */
const mockRefreshAndRetry = jest.fn();
const mockCustomerList = jest.fn();
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
  customerList: (...args: unknown[]) => mockCustomerList(...args),
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

describe("quickbooks:customers", () => {
  it("returns id values with NAME-ONLY labels (no emails/balances)", async () => {
    mockCustomerList.mockResolvedValueOnce([
      {
        customerId: "42",
        displayName: "Acme Corp",
        email: "secret@acme.test",
        balance: 999,
      },
      { customerId: "43", displayName: null },
    ]);
    const result = await quickbooksCustomersResolver.resolve(ctx());
    // filterAndSortByLabel alpha-sorts: "43" sorts before "Acme Corp".
    expect(result.items).toEqual([
      { value: "43", label: "43" },
      { value: "42", label: "Acme Corp" },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret@acme.test");
    expect(JSON.stringify(result)).not.toContain("999");
  });

  it("filters locally on q", async () => {
    mockCustomerList.mockResolvedValueOnce([
      { customerId: "1", displayName: "Acme Corp" },
      { customerId: "2", displayName: "Globex" },
    ]);
    const result = await quickbooksCustomersResolver.resolve(ctx({ q: "glo" }));
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });

  it("throws INTEGRATION_DISCONNECTED without an integration (no fetch)", async () => {
    await expect(
      quickbooksCustomersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockCustomerList).not.toHaveBeenCalled();
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
