/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — invoice action handlers + schemas
 * (create_invoice / send_invoice / get_invoice / list_invoices).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockInvoiceCreate = jest.fn();
const mockInvoiceSend = jest.fn();
const mockInvoiceGet = jest.fn();
const mockInvoiceList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/quickbooks/api/invoices", () => ({
  invoiceCreate: (...args: unknown[]) => mockInvoiceCreate(...args),
  invoiceSend: (...args: unknown[]) => mockInvoiceSend(...args),
  invoiceGet: (...args: unknown[]) => mockInvoiceGet(...args),
  invoiceList: (...args: unknown[]) => mockInvoiceList(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: jest.fn(),
}));

import { createInvoice } from "@/integrations/quickbooks/actions/createInvoice";
import { CreateInvoiceConfigSchema } from "@/integrations/quickbooks/actions/createInvoice.schema";
import { sendInvoice } from "@/integrations/quickbooks/actions/sendInvoice";
import { getInvoice } from "@/integrations/quickbooks/actions/getInvoice";
import { listInvoices } from "@/integrations/quickbooks/actions/listInvoices";
import { ListInvoicesConfigSchema } from "@/integrations/quickbooks/actions/listInvoices.schema";

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function qbTrigger(): TriggerEvent {
  return {
    provider: "quickbooks",
    eventType: "invoice_created",
    eventId: "evt-1",
    occurredAt: "2026-07-07T00:00:00Z",
    providerAccountId: "913035",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-1",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: qbTrigger(),
  };
}

const PROJECTED_INVOICE = {
  invoiceId: "145",
  docNumber: "1045",
  customerId: "42",
  customerName: "Acme Corp",
  txnDate: "2026-07-07",
  dueDate: "2026-08-06",
  totalAmount: 250,
  balance: 250,
  paid: false,
  emailStatus: "NotSet",
  billEmail: "billing@acme.test",
  currency: "USD",
  customerMemo: null,
  privateNote: null,
  lines: [
    {
      lineId: "1",
      description: "Consulting",
      amount: 250,
      quantity: null,
      unitPrice: null,
      itemId: "7",
      itemName: "Consulting",
    },
  ],
  createdAt: "2026-07-07T00:00:00Z",
  updatedAt: "2026-07-07T00:00:00Z",
};

describe("create_invoice", () => {
  it("schema: requires customerId + >=1 line with itemId + explicit amount; strict", () => {
    expect(() => CreateInvoiceConfigSchema.parse({ customerId: "42" })).toThrow();
    expect(() =>
      CreateInvoiceConfigSchema.parse({
        customerId: "42",
        lineItems: [{ itemId: "7" }],
      }),
    ).toThrow();
    expect(() =>
      CreateInvoiceConfigSchema.parse({
        customerId: "42",
        lineItems: [{ itemId: "7", amount: 250 }],
        bogus: true,
      }),
    ).toThrow();
    expect(() =>
      CreateInvoiceConfigSchema.parse({
        customerId: "42",
        lineItems: [{ itemId: "7", amount: 250 }],
      }),
    ).not.toThrow();
  });

  it("schema: rejects unknown tax treatments (explicit enum only)", () => {
    expect(() =>
      CreateInvoiceConfigSchema.parse({
        customerId: "42",
        lineItems: [{ itemId: "7", amount: 1 }],
        globalTaxCalculation: "GuessForMe",
      }),
    ).toThrow();
  });

  it("passes lines + only configured optionals to the wrapper; returns the bounded projection", async () => {
    mockInvoiceCreate.mockResolvedValueOnce(PROJECTED_INVOICE);
    const result = await createInvoice(
      baseInput({
        customerId: "42",
        lineItems: [
          { itemId: "7", amount: 250, description: "Consulting" },
        ],
        customerMemo: "Thanks!",
      }),
    );
    expect(mockInvoiceCreate.mock.calls[0]![0]).toMatchObject({
      realmId: "913035",
      customerId: "42",
      customerMemo: "Thanks!",
      lines: [{ itemId: "7", amount: 250, description: "Consulting" }],
    });
    // Draft-only contract: the create wrapper is the ONLY provider call —
    // no send happened.
    expect(mockInvoiceSend).not.toHaveBeenCalled();
    expect(result.output).toEqual(PROJECTED_INVOICE);
  });
});

describe("send_invoice", () => {
  it("sends with the optional recipient override", async () => {
    mockInvoiceSend.mockResolvedValueOnce({
      ...PROJECTED_INVOICE,
      emailStatus: "EmailSent",
    });
    const result = await sendInvoice(
      baseInput({ invoiceId: "145", sendTo: "ap@acme.test" }),
    );
    expect(mockInvoiceSend.mock.calls[0]![0]).toMatchObject({
      realmId: "913035",
      invoiceId: "145",
      sendTo: "ap@acme.test",
    });
    expect(result.output).toMatchObject({ emailStatus: "EmailSent" });
  });

  it("omits sendTo entirely when not configured (QuickBooks uses the stored billing email)", async () => {
    mockInvoiceSend.mockResolvedValueOnce(PROJECTED_INVOICE);
    await sendInvoice(baseInput({ invoiceId: "145" }));
    expect(mockInvoiceSend.mock.calls[0]![0].sendTo).toBeUndefined();
  });
});

describe("get_invoice", () => {
  it("returns found:true with the projection", async () => {
    mockInvoiceGet.mockResolvedValueOnce(PROJECTED_INVOICE);
    const result = await getInvoice(baseInput({ invoiceId: "145" }));
    expect(result.output).toEqual({ found: true, invoice: PROJECTED_INVOICE });
  });

  it("friendly not-found -> found:false, no throw", async () => {
    mockInvoiceGet.mockResolvedValueOnce(null);
    const result = await getInvoice(baseInput({ invoiceId: "999" }));
    expect(result.output).toEqual({ found: false, invoice: null });
  });
});

describe("list_invoices", () => {
  it("schema: bounds pageSize to 1..100 and startPosition to >=1; strict", () => {
    expect(() => ListInvoicesConfigSchema.parse({ pageSize: 0 })).toThrow();
    expect(() => ListInvoicesConfigSchema.parse({ pageSize: 101 })).toThrow();
    expect(() => ListInvoicesConfigSchema.parse({ startPosition: 0 })).toThrow();
    expect(() => ListInvoicesConfigSchema.parse({ query: "select *" })).toThrow();
    expect(() => ListInvoicesConfigSchema.parse({})).not.toThrow();
  });

  it("returns one bounded page with paging outputs", async () => {
    mockInvoiceList.mockResolvedValueOnce({
      items: [PROJECTED_INVOICE],
      hasMore: true,
      nextStartPosition: 26,
    });
    const result = await listInvoices(
      baseInput({ customerId: "42", pageSize: 25 }),
    );
    expect(mockInvoiceList.mock.calls[0]![0]).toMatchObject({
      realmId: "913035",
      customerId: "42",
      maxResults: 25,
    });
    expect(result.output).toEqual({
      invoices: [PROJECTED_INVOICE],
      count: 1,
      hasMore: true,
      nextStartPosition: 26,
    });
  });

  it("nulls nextStartPosition when the page is not full", async () => {
    mockInvoiceList.mockResolvedValueOnce({
      items: [PROJECTED_INVOICE],
      hasMore: false,
      nextStartPosition: 2,
    });
    const result = await listInvoices(baseInput({}));
    expect(result.output).toMatchObject({
      hasMore: false,
      nextStartPosition: null,
    });
  });

  it("defaults pageSize to 25", async () => {
    mockInvoiceList.mockResolvedValueOnce({
      items: [],
      hasMore: false,
      nextStartPosition: 1,
    });
    await listInvoices(baseInput({}));
    expect(mockInvoiceList.mock.calls[0]![0].maxResults).toBe(25);
  });
});
