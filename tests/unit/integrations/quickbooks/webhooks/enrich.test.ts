/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — enrichment + fan-out orchestration: entity→trigger
 * mapping, invoice_paid derivation (verified zero balance; partial
 * payments never fire), unknown-realm drops, gone entities, and
 * per-event error isolation.
 */
const mockRefreshAndRetry = jest.fn();
const mockGetAnyActive = jest.fn();
const mockDispatch = jest.fn();
const mockCustomerGet = jest.fn();
const mockInvoiceGet = jest.fn();
const mockPaymentGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));
jest.mock("@/repositories/integrations", () => ({
  getAnyActiveByProviderAccountServiceRole: (...args: unknown[]) =>
    mockGetAnyActive(...args),
}));
jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));
jest.mock("@/integrations/_shared/quickbooks/api/customers", () => ({
  customerGet: (...args: unknown[]) => mockCustomerGet(...args),
}));
jest.mock("@/integrations/_shared/quickbooks/api/invoices", () => ({
  invoiceGet: (...args: unknown[]) => mockInvoiceGet(...args),
}));
jest.mock("@/integrations/_shared/quickbooks/api/payments", () => ({
  paymentGet: (...args: unknown[]) => mockPaymentGet(...args),
}));

import { processQuickbooksEvents } from "@/integrations/quickbooks/webhooks/enrich";
import type { QuickbooksEntityEvent } from "@/integrations/quickbooks/webhooks/receive";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const INTEGRATION = {
  id: "int-1",
  accountId: "acct-1",
  providerAccountId: "913035",
};

const PAID_INVOICE = {
  invoiceId: "145",
  balance: 0,
  totalAmount: 250,
  paid: true,
  createdAt: null,
  updatedAt: null,
};

const OPEN_INVOICE = {
  invoiceId: "146",
  balance: 100,
  totalAmount: 250,
  paid: false,
  createdAt: null,
  updatedAt: null,
};

const PAYMENT = {
  paymentId: "77",
  linkedInvoiceIds: ["145"],
  createdAt: null,
  updatedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetAnyActive.mockResolvedValue(INTEGRATION);
  mockDispatch.mockResolvedValue({
    matched: 1,
    enqueued: 1,
    duplicate: false,
    dedupOutage: false,
  });
});

function ev(overrides: Partial<QuickbooksEntityEvent>): QuickbooksEntityEvent {
  return {
    realmId: "913035",
    entity: "Invoice",
    operation: "Create",
    entityId: "145",
    lastUpdated: "2026-07-07T12:00:00.000Z",
    ...overrides,
  };
}

function dispatchedEvents(): TriggerEvent[] {
  return mockDispatch.mock.calls.map((c) => c[0] as TriggerEvent);
}

describe("entity → trigger mapping", () => {
  it("Customer+Create → customer_created with the enriched projection", async () => {
    mockCustomerGet.mockResolvedValueOnce({ customerId: "42", createdAt: null });
    const summary = await processQuickbooksEvents([
      ev({ entity: "Customer", entityId: "42" }),
    ]);
    expect(dispatchedEvents()[0]).toMatchObject({
      eventType: "customer_created",
      eventId: "customer_created:913035:42",
    });
    expect(summary.dispatched).toBe(1);
  });

  it("Invoice+Create → invoice_created", async () => {
    mockInvoiceGet.mockResolvedValueOnce(OPEN_INVOICE);
    await processQuickbooksEvents([ev({ entityId: "146" })]);
    expect(dispatchedEvents()[0]).toMatchObject({
      eventType: "invoice_created",
      eventId: "invoice_created:913035:146",
    });
  });

  it("ignored operations (Delete/Void/Merge, unknown entities) are counted, not dispatched", async () => {
    const summary = await processQuickbooksEvents([
      ev({ operation: "Delete" }),
      ev({ entity: "Customer", operation: "Merge" }),
      ev({ entity: "Bill", operation: "Create" }),
    ]);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(summary.ignoredOperations).toBe(3);
  });
});

describe("payment events + invoice_paid derivation", () => {
  it("Payment+Create fires payment_received AND invoice_paid for a verified zero-balance invoice", async () => {
    mockPaymentGet.mockResolvedValueOnce(PAYMENT);
    mockInvoiceGet.mockResolvedValueOnce(PAID_INVOICE);
    const summary = await processQuickbooksEvents([
      ev({ entity: "Payment", entityId: "77" }),
    ]);
    const types = dispatchedEvents().map((e) => e.eventType);
    expect(types).toEqual(["payment_received", "invoice_paid"]);
    expect(dispatchedEvents()[1]).toMatchObject({
      eventId: "invoice_paid:913035:145",
    });
    expect(summary.dispatched).toBe(2);
  });

  it("PARTIAL payment: linked invoice with balance > 0 does NOT fire invoice_paid", async () => {
    mockPaymentGet.mockResolvedValueOnce({
      ...PAYMENT,
      linkedInvoiceIds: ["146"],
    });
    mockInvoiceGet.mockResolvedValueOnce(OPEN_INVOICE);
    await processQuickbooksEvents([ev({ entity: "Payment", entityId: "77" })]);
    const types = dispatchedEvents().map((e) => e.eventType);
    expect(types).toEqual(["payment_received"]);
  });

  it("Payment+Update derives invoice_paid ONLY (no payment_received re-fire)", async () => {
    mockPaymentGet.mockResolvedValueOnce(PAYMENT);
    mockInvoiceGet.mockResolvedValueOnce(PAID_INVOICE);
    await processQuickbooksEvents([
      ev({ entity: "Payment", operation: "Update", entityId: "77" }),
    ]);
    const types = dispatchedEvents().map((e) => e.eventType);
    expect(types).toEqual(["invoice_paid"]);
  });

  it("Create+Update double-derivation collapses at the dispatcher (same invoice_paid eventId; duplicate counted)", async () => {
    mockPaymentGet.mockResolvedValue(PAYMENT);
    mockInvoiceGet.mockResolvedValue(PAID_INVOICE);
    mockDispatch
      // Create: payment_received fresh, invoice_paid fresh.
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
      // Update: invoice_paid duplicate → dropped by dedup.
      .mockResolvedValueOnce({ matched: 0, enqueued: 0, duplicate: true, dedupOutage: false });
    const summary = await processQuickbooksEvents([
      ev({ entity: "Payment", operation: "Create", entityId: "77" }),
      ev({ entity: "Payment", operation: "Update", entityId: "77" }),
    ]);
    const paidEvents = dispatchedEvents().filter(
      (e) => e.eventType === "invoice_paid",
    );
    expect(paidEvents).toHaveLength(2);
    expect(paidEvents[0]!.eventId).toBe(paidEvents[1]!.eventId);
    expect(summary.duplicates).toBe(1);
    expect(summary.dispatched).toBe(2);
  });
});

describe("realm + failure isolation", () => {
  it("drops events for realms with NO active integration (count-only)", async () => {
    mockGetAnyActive.mockResolvedValueOnce(null);
    const summary = await processQuickbooksEvents([
      ev({ realmId: "999" }),
    ]);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(summary.droppedNoIntegration).toBe(1);
  });

  it("resolves each realm's credential ONCE per delivery", async () => {
    mockInvoiceGet.mockResolvedValue(OPEN_INVOICE);
    await processQuickbooksEvents([
      ev({ entityId: "1" }),
      ev({ entityId: "2" }),
    ]);
    expect(mockGetAnyActive).toHaveBeenCalledTimes(1);
  });

  it("counts gone entities (provider 404 → null) without dispatching", async () => {
    mockInvoiceGet.mockResolvedValueOnce(null);
    const summary = await processQuickbooksEvents([ev({})]);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(summary.goneEntities).toBe(1);
  });

  it("isolates per-event errors: remaining events still process; errors counted for the 5xx retry path", async () => {
    mockInvoiceGet
      .mockRejectedValueOnce(new Error("provider 500"))
      .mockResolvedValueOnce(OPEN_INVOICE);
    const summary = await processQuickbooksEvents([
      ev({ entityId: "1" }),
      ev({ entityId: "2" }),
    ]);
    expect(summary.errors).toBe(1);
    expect(summary.dispatched).toBe(1);
  });
});
