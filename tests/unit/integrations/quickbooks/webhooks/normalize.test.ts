/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — pure normalizers: canonical TriggerEvent shapes,
 * deterministic clock-free dedup keys on durable semantic identity,
 * and contract validation.
 */
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import {
  normalizeCustomerCreated,
  normalizeInvoiceCreated,
  normalizeInvoicePaid,
  normalizePaymentReceived,
} from "@/integrations/quickbooks/webhooks/normalize";
import type {
  ProjectedQuickbooksCustomer,
  ProjectedQuickbooksInvoice,
  ProjectedQuickbooksPayment,
} from "@/integrations/_shared/quickbooks/projections";

const CUSTOMER: ProjectedQuickbooksCustomer = {
  customerId: "42",
  displayName: "Acme Corp",
  companyName: "Acme Corp",
  givenName: null,
  familyName: null,
  email: "billing@acme.test",
  phone: null,
  billingAddress: null,
  notes: null,
  active: true,
  balance: 0,
  currency: "USD",
  createdAt: "2026-07-07T11:59:00Z",
  updatedAt: "2026-07-07T11:59:00Z",
};

const INVOICE: ProjectedQuickbooksInvoice = {
  invoiceId: "145",
  docNumber: "1045",
  customerId: "42",
  customerName: "Acme Corp",
  txnDate: "2026-07-07",
  dueDate: "2026-08-06",
  totalAmount: 250,
  balance: 0,
  paid: true,
  emailStatus: "EmailSent",
  billEmail: "billing@acme.test",
  currency: "USD",
  customerMemo: null,
  privateNote: null,
  lines: [],
  createdAt: "2026-07-07T11:00:00Z",
  updatedAt: "2026-07-07T12:00:00Z",
};

const PAYMENT: ProjectedQuickbooksPayment = {
  paymentId: "77",
  customerId: "42",
  customerName: "Acme Corp",
  totalAmount: 250,
  unappliedAmount: 0,
  currency: "USD",
  txnDate: "2026-07-07",
  referenceNumber: "CHK-9",
  linkedInvoiceIds: ["145"],
  createdAt: "2026-07-07T12:00:00Z",
  updatedAt: "2026-07-07T12:00:00Z",
};

const LAST_UPDATED = "2026-07-07T12:00:00.000Z";

describe("canonical shapes", () => {
  it("customer_created validates against TriggerEventSchema with realm scope", () => {
    const event = normalizeCustomerCreated({
      realmId: "913035",
      customer: CUSTOMER,
      lastUpdated: LAST_UPDATED,
    });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    expect(event).toMatchObject({
      provider: "quickbooks",
      eventType: "customer_created",
      eventId: "customer_created:913035:42",
      occurredAt: LAST_UPDATED,
      providerAccountId: "913035",
    });
    expect(event.payload).toMatchObject({
      changeKind: "customer_created",
      realmId: "913035",
      displayName: "Acme Corp",
      email: "billing@acme.test",
    });
  });

  it("invoice_created / payment_received / invoice_paid all validate and carry flattened projections", () => {
    const created = normalizeInvoiceCreated({
      realmId: "913035",
      invoice: INVOICE,
      lastUpdated: LAST_UPDATED,
    });
    const received = normalizePaymentReceived({
      realmId: "913035",
      payment: PAYMENT,
      lastUpdated: LAST_UPDATED,
    });
    const paid = normalizeInvoicePaid({
      realmId: "913035",
      invoice: INVOICE,
      paymentId: "77",
      lastUpdated: LAST_UPDATED,
    });
    for (const event of [created, received, paid]) {
      expect(() => TriggerEventSchema.parse(event)).not.toThrow();
      expect(event.providerAccountId).toBe("913035");
    }
    expect(created.eventId).toBe("invoice_created:913035:145");
    expect(received.eventId).toBe("payment_received:913035:77");
    expect(received.payload).toMatchObject({ linkedInvoiceIds: ["145"] });
    expect(paid.payload).toMatchObject({ paymentId: "77", paid: true });
  });
});

describe("dedup keys — durable semantic identity, clock-free", () => {
  it("invoice_paid keys on the INVOICE, not the payment (Create+Update / multi-payment collapse)", () => {
    const fromCreate = normalizeInvoicePaid({
      realmId: "913035",
      invoice: INVOICE,
      paymentId: "77",
      lastUpdated: "2026-07-07T12:00:00.000Z",
    });
    const fromUpdate = normalizeInvoicePaid({
      realmId: "913035",
      invoice: INVOICE,
      paymentId: "88",
      lastUpdated: "2026-07-07T12:00:05.000Z",
    });
    expect(fromCreate.eventId).toBe("invoice_paid:913035:145");
    expect(fromUpdate.eventId).toBe(fromCreate.eventId);
  });

  it("keys embed the realm — the same entity id in two companies never collides", () => {
    const a = normalizeInvoiceCreated({
      realmId: "111",
      invoice: INVOICE,
      lastUpdated: null,
    });
    const b = normalizeInvoiceCreated({
      realmId: "222",
      invoice: INVOICE,
      lastUpdated: null,
    });
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("is pure: same input -> identical event (including eventId), no clock in the key", () => {
    const input = {
      realmId: "913035",
      payment: PAYMENT,
      lastUpdated: LAST_UPDATED,
    };
    const first = normalizePaymentReceived(input);
    const second = normalizePaymentReceived(input);
    expect(second).toEqual(first);
  });

  it("occurredAt prefers Intuit's lastUpdated, then entity timestamps", () => {
    const withLastUpdated = normalizeCustomerCreated({
      realmId: "1",
      customer: CUSTOMER,
      lastUpdated: LAST_UPDATED,
    });
    expect(withLastUpdated.occurredAt).toBe(LAST_UPDATED);
    const fromEntity = normalizeCustomerCreated({
      realmId: "1",
      customer: CUSTOMER,
      lastUpdated: null,
    });
    expect(fromEntity.occurredAt).toBe(CUSTOMER.createdAt);
  });
});
