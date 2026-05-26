/**
 * Slice 3.46 integration test — Stripe `create_checkout_session` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for the Stripe subscriptions + commerce
 * group:
 *   - `mode` renders as a `<Select>` with payment/subscription/setup
 *     options (NOT a hidden default),
 *   - `successUrl` / `cancelUrl` render as text URL inputs,
 *   - `lineItems` renders as a `<Textarea>` paste-JSON field — the
 *     renderer stores the literal string the author typed (NOT a parsed
 *     object), and the runtime schema parses on submit,
 *   - `customer` / `customerEmail` render as plain text (XOR enforced at
 *     runtime; not expressible in FieldMeta),
 *   - `metadata` renders as the `keyvalue` chip UI — stored as typed
 *     `Array<{key, value}>`,
 *   - `automaticTax` renders as a `<Textarea>` paste-JSON field,
 *   - Modal Save flushes the draft into pendingNodes,
 *   - Toolbar Save persists once with every field intact (no hidden
 *     destructive defaults).
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { openLastNodeOfKind } from "./helpers/openLastNodeOfKind";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import { stripeCreateCheckoutSessionMeta } from "@/integrations/stripe/actions/createCheckoutSession.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual",
  description: "Fired manually via Run Now.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "stripe", displayName: "Stripe" }];

const LINE_ITEMS_JSON = '[{"priceId":"price_TestPrice","quantity":2}]';
const SUCCESS_URL = "https://example.com/checkout/success";
const CANCEL_URL = "https://example.com/checkout/cancel";
const CUSTOMER_ID = "cus_TestCustomer";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "stripe" ? [stripeCreateCheckoutSessionMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => ({
    ok: false,
    source,
    code: "SOURCE_NOT_FOUND",
    message: `Unknown source '${source}'.`,
  }));
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("Stripe create_checkout_session meta declares mode select + paste-JSON lineItems + plain-text URLs + keyvalue metadata + customer-facing url output — Slice 3.46 meta guard", () => {
  // mode: required select with 3 enum values, NO defaultValue (Q11)
  const mode = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "mode",
  )!;
  expect(mode).toBeDefined();
  expect(mode.type).toBe("select");
  expect(mode.required).toBe(true);
  expect(mode.defaultValue).toBeUndefined();
  expect(mode.options?.map((o) => o.value)).toEqual([
    "payment",
    "subscription",
    "setup",
  ]);

  // successUrl / cancelUrl: required text URL inputs
  const successUrl = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "successUrl",
  )!;
  expect(successUrl.type).toBe("text");
  expect(successUrl.required).toBe(true);
  const cancelUrl = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "cancelUrl",
  )!;
  expect(cancelUrl.type).toBe("text");
  expect(cancelUrl.required).toBe(true);

  // lineItems: textarea paste-JSON (optional at field level; XOR with mode enforced at runtime)
  const lineItems = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "lineItems",
  )!;
  expect(lineItems.type).toBe("textarea");
  expect(lineItems.required).toBe(false);

  // customer + customerEmail: text, both optional, MUTEX documented in descriptions
  const customer = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "customer",
  )!;
  expect(customer.type).toBe("text");
  expect(customer.required).toBe(false);
  expect(customer.description?.toLowerCase()).toContain("mutex");
  const customerEmail = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "customerEmail",
  )!;
  expect(customerEmail.type).toBe("text");
  expect(customerEmail.required).toBe(false);
  expect(customerEmail.description?.toLowerCase()).toContain("mutex");

  // metadata: keyvalue with keyValueMaxRows: 50
  const metadata = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "metadata",
  )!;
  expect(metadata.type).toBe("keyvalue");
  expect(metadata.required).toBe(false);
  expect(metadata.keyValueMaxRows).toBe(50);

  // automaticTax: textarea paste-JSON
  const automaticTax = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "automaticTax",
  )!;
  expect(automaticTax.type).toBe("textarea");
  expect(automaticTax.required).toBe(false);

  // url output: customer-facing Stripe-hosted checkout URL (intentional + safe)
  const url = stripeCreateCheckoutSessionMeta.outputs.find(
    (o) => o.name === "url",
  )!;
  expect(url.type).toBe("string");
  expect(url.description?.toLowerCase()).toContain("customer-facing");

  // No clientSecret output leakage on this surface (clientSecret is only
  // for PaymentIntent flows — Slice 3.45 guard).
  const outputNames = stripeCreateCheckoutSessionMeta.outputs.map((o) => o.name);
  expect(outputNames).not.toContain("clientSecret");
  // No card / secretKey / apiKey leakage either.
  for (const banned of ["card", "cardNumber", "cvc", "apiKey", "secretKey"]) {
    expect(outputNames).not.toContain(banned);
  }
});

it(
  "end-to-end: choose Stripe Create Checkout Session → fill lineItems paste-JSON + mode + URLs + customerId + metadata → Modal Save (draft only) → Toolbar Save (persists once, lineItems stays string, metadata stays typed array, no hidden defaults)",
  async () => {
  mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
    ...baseWorkflow,
    draftDefinition: body.draftDefinition,
  }));
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  // 1. Trigger.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  // 2. Drill into Stripe → Create Checkout Session.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse stripe actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Checkout Session")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Checkout Session"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("stripe");
  expect(action.type).toBe("create_checkout_session");
  // No hidden default risky fields seeded by the UI (Q11).
  expect(action.config).toEqual({});

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^mode/i }),
    ).toBeInTheDocument();
  });

  // 4. Pick mode = payment via the select.
  const modeTrigger = screen.getByRole("combobox", { name: /^mode/i });
  await user.click(modeTrigger);
  await user.click(await screen.findByRole("option", { name: "payment" }));
  await waitFor(() => {
    expect(useConfigSlice.getState().drafts[action.id]!.values.mode).toBe(
      "payment",
    );
  });

  // 5. Fill successUrl / cancelUrl.
  await user.type(
    screen.getByRole("textbox", { name: /^success url$/i }),
    SUCCESS_URL,
  );
  await user.type(
    screen.getByRole("textbox", { name: /^cancel url$/i }),
    CANCEL_URL,
  );

  // 6. Paste a literal JSON string into the lineItems textarea. The
  //    TextareaField renderer stores the string VERBATIM (no parse) —
  //    the runtime schema parses it on submit/execute, not on input.
  //    user.paste() avoids userEvent.type's key-descriptor interpretation
  //    of `{` / `[`.
  const lineItemsField = screen.getByRole("textbox", { name: /^line items$/i });
  await user.click(lineItemsField);
  await user.paste(LINE_ITEMS_JSON);
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.lineItems,
  ).toBe(LINE_ITEMS_JSON);

  // 7. Fill customerId (the `customer` field).
  await user.type(
    screen.getByRole("textbox", { name: /^customer id$/i }),
    CUSTOMER_ID,
  );

  // 8. Fill the metadata keyvalue chip UI: add one row, type key/value.
  await user.click(screen.getByRole("button", { name: /add row/i }));
  await user.type(
    screen.getByRole("textbox", { name: /metadata key 1/i }),
    "order_id",
  );
  await user.type(
    screen.getByRole("textbox", { name: /metadata value 1/i }),
    "ord_99",
  );
  const draftMetadata = useConfigSlice.getState().drafts[action.id]!.values
    .metadata;
  expect(Array.isArray(draftMetadata)).toBe(true);
  expect(draftMetadata).toEqual([{ key: "order_id", value: "ord_99" }]);
  expect(typeof draftMetadata).not.toBe("string");

  // 9. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.mode).toBe("payment");
  expect(pendingConfig.successUrl).toBe(SUCCESS_URL);
  expect(pendingConfig.cancelUrl).toBe(CANCEL_URL);
  // lineItems persists as the literal JSON string the author typed —
  // NOT a pre-parsed array. The runtime schema parses on submit/execute.
  expect(pendingConfig.lineItems).toBe(LINE_ITEMS_JSON);
  expect(typeof pendingConfig.lineItems).toBe("string");
  expect(pendingConfig.customer).toBe(CUSTOMER_ID);
  expect(pendingConfig.metadata).toEqual([
    { key: "order_id", value: "ord_99" },
  ]);
  // No hidden defaults — allowPromotionCodes / automaticTax / customerEmail /
  // clientReferenceId stay absent.
  expect(pendingConfig.allowPromotionCodes).toBeUndefined();
  expect(pendingConfig.automaticTax).toBeUndefined();
  expect(pendingConfig.customerEmail).toBeUndefined();
  expect(pendingConfig.clientReferenceId).toBeUndefined();

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 10. Toolbar Save persists once.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{
    kind: string;
    provider: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.provider).toBe("stripe");
  expect(persistedAction.type).toBe("create_checkout_session");
  expect(persistedAction.config.mode).toBe("payment");
  expect(persistedAction.config.successUrl).toBe(SUCCESS_URL);
  expect(persistedAction.config.cancelUrl).toBe(CANCEL_URL);
  expect(persistedAction.config.lineItems).toBe(LINE_ITEMS_JSON);
  expect(typeof persistedAction.config.lineItems).toBe("string");
  expect(persistedAction.config.customer).toBe(CUSTOMER_ID);
  expect(persistedAction.config.metadata).toEqual([
    { key: "order_id", value: "ord_99" },
  ]);
  expect(typeof persistedAction.config.metadata).not.toBe("string");
  // No hidden risky defaults snuck in (Q11).
  expect(persistedAction.config.allowPromotionCodes).toBeUndefined();
  expect(persistedAction.config.automaticTax).toBeUndefined();
  expect(persistedAction.config.customerEmail).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  },
  // Slice 4.BUILDER-RUN-PANEL-1 — bumped past the 5s default because
  // the test runs ~3.5-4s in isolation; under parallel-worker
  // contention it tips over. Pre-existing fragility (the test exercises
  // 16+ user interactions through the full Stripe config form); the
  // RUN-PANEL-1 refactor doesn't change its execution path.
  10_000,
);
