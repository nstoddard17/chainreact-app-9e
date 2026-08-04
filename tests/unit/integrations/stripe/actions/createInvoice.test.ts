/**
 * @jest-environment node
 *
 * Tests for `create_invoice` handler. Mocks the `invoicesCreate`
 * wrapper boundary — wrapper itself is tested at
 * `api/invoices.test.ts`. Asserts:
 *   - clean mapped payload (V2 typed config → wrapper input;
 *     customerId → wire-format `customer` rename)
 *   - Idempotency-Key threading (Q4 — exact shape)
 *   - accountId resolution from Stripe-trigger vs non-Stripe trigger
 *   - optional safe fields forwarded
 *   - locked output key set + no input spreading
 *   - error propagation
 *   - Zod parse rejects before wrapper call
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/invoices", () => ({
  invoicesCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createInvoice } from "@/integrations/stripe/actions/createInvoice";
import { CreateInvoiceConfigSchema } from "@/integrations/stripe/actions/createInvoice.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "stripe", providerAccountId = "acct_TEST"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-15T12:00:00Z",
    providerAccountId,
    payload: {},
  };
}

function invoiceResponse(overrides?: Record<string, unknown>) {
  return {
    id: "in_test_42",
    object: "invoice",
    customer: "cus_test_42",
    subscription: null,
    status: "draft",
    collection_method: "charge_automatically",
    auto_advance: true,
    hosted_invoice_url: null,
    invoice_pdf: null,
    amount_due: 0,
    amount_paid: 0,
    currency: "usd",
    description: null,
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

describe("create_invoice action", () => {
  it("calls the wrapper with the clean mapped payload (customerId → wire customer)", async () => {
    mockCreate.mockResolvedValueOnce(invoiceResponse());
    await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r1",
      nodeId: "node-a",
      config: { customerId: "cus_test_42" },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.customer).toBe("cus_test_42");
  });

  it("threads Idempotency-Key with the exact shape ${runId}:${nodeId}:stripe_action_create_invoice", async () => {
    mockCreate.mockResolvedValueOnce(invoiceResponse());
    await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "run-42",
      nodeId: "node-a",
      config: { customerId: "cus_test_1" },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.idempotencyKey).toBe(
      "run-42:node-a:stripe_action_create_invoice",
    );
  });

  it("resolves accountId from a Stripe trigger event", async () => {
    mockCreate.mockResolvedValueOnce(invoiceResponse());
    await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_test_1" },
      triggerEvent: trigger("stripe", "acct_MERCHANT"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.providerAccountId).toBe("acct_MERCHANT");
  });

  it("resolves accountId as null when triggered by a non-Stripe provider", async () => {
    mockCreate.mockResolvedValueOnce(invoiceResponse());
    await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_test_1" },
      triggerEvent: trigger("gmail", "alice@example.com"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.providerAccountId).toBeNull();
  });

  it("forwards optional safe fields when supplied", async () => {
    mockCreate.mockResolvedValueOnce(
      invoiceResponse({
        description: "Q4 services",
        metadata: { orderId: "order_42" },
        auto_advance: false,
      }),
    );
    await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        customerId: "cus_test_1",
        description: "Q4 services",
        metadata: { orderId: "order_42" },
        autoAdvance: false,
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.description).toBe("Q4 services");
    expect(arg.metadata).toEqual({ orderId: "order_42" });
    expect(arg.autoAdvance).toBe(false);
  });

  it("does NOT forward optional fields when omitted from config", async () => {
    mockCreate.mockResolvedValueOnce(invoiceResponse());
    await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_test_1" },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.description).toBeUndefined();
    expect(arg.metadata).toBeUndefined();
    expect(arg.autoAdvance).toBeUndefined();
  });

  it("maps the Stripe response onto the locked output key set", async () => {
    mockCreate.mockResolvedValueOnce(
      invoiceResponse({
        id: "in_99",
        customer: "cus_99",
        subscription: "sub_99",
        status: "open",
        collection_method: "send_invoice",
        auto_advance: false,
        hosted_invoice_url: "https://invoice.stripe.com/i/test_99",
        invoice_pdf: "https://invoice.stripe.com/i/test_99/pdf",
        amount_due: 4999,
        amount_paid: 0,
        currency: "usd",
        description: "Q4 services",
        metadata: { source: "workflow" },
        livemode: false,
      }),
    );
    const result = await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_99" },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output ?? {}).sort()).toEqual(
      [
        "amountDue",
        "amountPaid",
        "autoAdvance",
        "collectionMethod",
        "currency",
        "customerId",
        "description",
        "hostedInvoiceUrl",
        "invoiceId",
        "invoicePdf",
        "livemode",
        "metadata",
        "status",
        "subscriptionId",
      ].sort(),
    );
    expect(result.output).toEqual({
      invoiceId: "in_99",
      customerId: "cus_99",
      subscriptionId: "sub_99",
      status: "open",
      collectionMethod: "send_invoice",
      autoAdvance: false,
      hostedInvoiceUrl: "https://invoice.stripe.com/i/test_99",
      invoicePdf: "https://invoice.stripe.com/i/test_99/pdf",
      amountDue: 4999,
      amountPaid: 0,
      currency: "usd",
      description: "Q4 services",
      metadata: { source: "workflow" },
      livemode: false,
    });
  });

  it("preserves null Stripe response fields (subscriptionId / hostedInvoiceUrl / invoicePdf on a fresh draft)", async () => {
    mockCreate.mockResolvedValueOnce(invoiceResponse());
    const result = await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_test_1" },
      triggerEvent: trigger(),
    });
    expect(result.output?.subscriptionId).toBeNull();
    expect(result.output?.hostedInvoiceUrl).toBeNull();
    expect(result.output?.invoicePdf).toBeNull();
  });

  it("does NOT spread input into output (V2 convention)", async () => {
    mockCreate.mockResolvedValueOnce(invoiceResponse());
    const result = await createInvoice({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        customerId: "cus_test_1",
        metadata: { secret_input: "do-not-echo" },
      },
      triggerEvent: trigger(),
    });
    // Input metadata isn't echoed — output reflects Stripe's response
    // metadata (empty in the mock).
    expect(result.output?.metadata).toEqual({});
    expect(Object.keys(result.output ?? {})).not.toContain("autoAdvanceInput");
  });

  it("propagates wrapper errors to the caller", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Stripe POST /v1/invoices failed: no_such_customer"),
    );
    await expect(
      createInvoice({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { customerId: "cus_missing" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/no_such_customer/);
  });

  it("Zod parse rejects invalid config before any wrapper call", async () => {
    await expect(
      createInvoice({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        // missing customerId — strict parse rejects.
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling createInvoice.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Schema tests for `create_invoice`. Pins the strict-mode shape +
// customer-required + unknown-field rejection. V1's deferred surface
// (collectionMethod / daysUntilDue / subscription / dueDate / footer
// / automaticTax / applicationFee*) is rejected via .strict() — V2
// doesn't ship them in Stripe 2.1 Commit 3 per the "if V1 supports"
// gate.
// ---------------------------------------------------------------------------

describe("CreateInvoiceConfigSchema", () => {
  describe("happy paths", () => {
    it("accepts minimal config (customerId only)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
      });
      expect(result.success).toBe(true);
    });

    it("accepts customerId + description", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        description: "Monthly retainer — May",
      });
      expect(result.success).toBe(true);
    });

    it("accepts customerId + metadata", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        metadata: { orderId: "order_42" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts customerId + autoAdvance:false (draft-only invoice)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        autoAdvance: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts the full set of optional safe fields", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        description: "Q4 services",
        metadata: { orderId: "order_42", source: "workflow" },
        autoAdvance: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("required fields", () => {
    it("rejects missing customerId", () => {
      const result = CreateInvoiceConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty-string customerId", () => {
      const result = CreateInvoiceConfigSchema.safeParse({ customerId: "" });
      expect(result.success).toBe(false);
    });

    it("rejects non-string customerId", () => {
      const result = CreateInvoiceConfigSchema.safeParse({ customerId: 42 });
      expect(result.success).toBe(false);
    });
  });

  describe("optional field validation", () => {
    it("rejects empty-string description (must be non-empty when supplied)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        description: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects metadata with non-string values (raw JSON shape rejected)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        metadata: { orderId: 42 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects metadata supplied as a JSON string (V1 quirk explicitly NOT ported)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        metadata: '{"orderId":"order_42"}',
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-boolean autoAdvance", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        autoAdvance: "true",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("strict mode — unknown fields rejected", () => {
    it("rejects V1's snake_case auto_advance field (wire field disguised as schema field)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        auto_advance: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's snake_case customer (Stripe wire field disguised as schema field)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customer: "cus_test_1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred collectionMethod field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        collectionMethod: "send_invoice",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred daysUntilDue field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        daysUntilDue: 30,
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred dueDate field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        dueDate: "2026-06-15",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred subscription field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        subscription: "sub_test_1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred footer field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        footer: "Thanks for your business!",
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred automaticTax field", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        automaticTax: { enabled: true },
      });
      expect(result.success).toBe(false);
    });

    it("rejects the deferred applicationFeeAmount field (Stripe Connect platform fee)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        applicationFeeAmount: 100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects raw line_items / pending_invoice_items_behavior passthrough (line-item attachment is the deferred createInvoiceItem action's job)", () => {
      const result = CreateInvoiceConfigSchema.safeParse({
        customerId: "cus_test_1",
        pending_invoice_items_behavior: "include",
      });
      expect(result.success).toBe(false);
    });
  });
});
