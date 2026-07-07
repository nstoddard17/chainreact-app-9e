/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — customer action handlers + schemas
 * (create_customer / find_customer / get_customer).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCustomerCreate = jest.fn();
const mockCustomerSearch = jest.fn();
const mockCustomerGet = jest.fn();
const mockGetActiveForExecution = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/quickbooks/api/customers", () => ({
  customerCreate: (...args: unknown[]) => mockCustomerCreate(...args),
  customerSearch: (...args: unknown[]) => mockCustomerSearch(...args),
  customerGet: (...args: unknown[]) => mockCustomerGet(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import { createCustomer } from "@/integrations/quickbooks/actions/createCustomer";
import { CreateCustomerConfigSchema } from "@/integrations/quickbooks/actions/createCustomer.schema";
import { findCustomer } from "@/integrations/quickbooks/actions/findCustomer";
import { FindCustomerConfigSchema } from "@/integrations/quickbooks/actions/findCustomer.schema";
import { getCustomer } from "@/integrations/quickbooks/actions/getCustomer";

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function qbTrigger(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    provider: "quickbooks",
    eventType: "customer_created",
    eventId: "evt-1",
    occurredAt: "2026-07-07T00:00:00Z",
    providerAccountId: "913035",
    payload: {},
    ...overrides,
  };
}

function baseInput(
  config: Record<string, unknown>,
  trigger: TriggerEvent = qbTrigger(),
) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-1",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger,
  };
}

const PROJECTED_CUSTOMER = {
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
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

describe("create_customer", () => {
  it("schema: requires displayName, rejects unknown keys", () => {
    expect(() => CreateCustomerConfigSchema.parse({})).toThrow();
    expect(() =>
      CreateCustomerConfigSchema.parse({ displayName: "A", bogus: 1 }),
    ).toThrow();
    expect(() =>
      CreateCustomerConfigSchema.parse({ displayName: "A" }),
    ).not.toThrow();
  });

  it("passes only configured fields to the wrapper and returns the bounded projection", async () => {
    mockCustomerCreate.mockResolvedValueOnce(PROJECTED_CUSTOMER);
    const result = await createCustomer(
      baseInput({ displayName: "Acme Corp", email: "billing@acme.test" }),
    );
    expect(mockCustomerCreate.mock.calls[0]![0]).toMatchObject({
      realmId: "913035",
      displayName: "Acme Corp",
      email: "billing@acme.test",
    });
    expect(result.output).toEqual(PROJECTED_CUSTOMER);
    expect(JSON.stringify(result.output)).not.toContain('"tok"');
  });

  it("realm resolution: quickbooks-triggered runs use the trigger's realm (no repo lookup)", async () => {
    mockCustomerCreate.mockResolvedValueOnce(PROJECTED_CUSTOMER);
    await createCustomer(baseInput({ displayName: "A" }));
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
  });

  it("realm resolution: non-quickbooks triggers look up the account's integration row", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce({
      providerAccountId: "555111",
    });
    mockCustomerCreate.mockResolvedValueOnce(PROJECTED_CUSTOMER);
    await createCustomer(
      baseInput(
        { displayName: "A" },
        qbTrigger({ provider: "typeform", providerAccountId: "someone" }),
      ),
    );
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "acct-1",
      "quickbooks",
      null,
    );
    expect(mockCustomerCreate.mock.calls[0]![0]).toMatchObject({
      realmId: "555111",
    });
  });

  it("fails legibly when no integration exists for a non-quickbooks trigger", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      createCustomer(
        baseInput({ displayName: "A" }, qbTrigger({ provider: "typeform" })),
      ),
    ).rejects.toThrow(/no active QuickBooks integration/);
  });

  it("propagates provider errors (duplicate DisplayName) verbatim", async () => {
    mockCustomerCreate.mockRejectedValueOnce(
      new Error("QuickBooks POST /customer failed: Duplicate Name Exists Error (code 6240)"),
    );
    await expect(
      createCustomer(baseInput({ displayName: "Acme Corp" })),
    ).rejects.toThrow(/6240/);
  });
});

describe("find_customer", () => {
  it("schema: one searchBy + value, strict", () => {
    expect(() =>
      FindCustomerConfigSchema.parse({ searchBy: "email" }),
    ).toThrow();
    expect(() =>
      FindCustomerConfigSchema.parse({ searchBy: "ssn", value: "x" }),
    ).toThrow();
    expect(() =>
      FindCustomerConfigSchema.parse({ searchBy: "email", value: "a@b.c" }),
    ).not.toThrow();
  });

  it("returns found:true with first match + bounded matches", async () => {
    mockCustomerSearch.mockResolvedValueOnce([PROJECTED_CUSTOMER]);
    const result = await findCustomer(
      baseInput({ searchBy: "email", value: "billing@acme.test" }),
    );
    expect(mockCustomerSearch.mock.calls[0]![0]).toMatchObject({
      field: "email",
      value: "billing@acme.test",
      maxResults: 10,
    });
    expect(result.output).toMatchObject({
      found: true,
      matchCount: 1,
      customer: PROJECTED_CUSTOMER,
      customers: [PROJECTED_CUSTOMER],
    });
  });

  it("friendly not-found: no match -> found:false, no throw", async () => {
    mockCustomerSearch.mockResolvedValueOnce([]);
    const result = await findCustomer(
      baseInput({ searchBy: "displayName", value: "Nobody" }),
    );
    expect(result.output).toEqual({
      found: false,
      matchCount: 0,
      customer: null,
      customers: [],
    });
  });
});

describe("get_customer", () => {
  it("returns found:true with the projection", async () => {
    mockCustomerGet.mockResolvedValueOnce(PROJECTED_CUSTOMER);
    const result = await getCustomer(baseInput({ customerId: "42" }));
    expect(result.output).toEqual({ found: true, customer: PROJECTED_CUSTOMER });
  });

  it("friendly not-found: wrapper null -> found:false, no throw", async () => {
    mockCustomerGet.mockResolvedValueOnce(null);
    const result = await getCustomer(baseInput({ customerId: "999" }));
    expect(result.output).toEqual({ found: false, customer: null });
  });

  it("uses refreshAndRetry with provider='quickbooks'", async () => {
    mockCustomerGet.mockResolvedValueOnce(PROJECTED_CUSTOMER);
    await getCustomer(baseInput({ customerId: "42" }));
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "quickbooks",
      accountId: "acct-1",
      providerAccountId: "913035",
    });
  });
});
