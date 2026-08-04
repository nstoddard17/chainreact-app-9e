/**
 * Slice 3.46 integration test — Stripe `create_checkout_session` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for the Stripe subscriptions + commerce
 * group:
 *   - `mode` renders as a `<Select>` with payment/subscription/setup
 *     options (NOT a hidden default),
 *   - `successUrl` / `cancelUrl` render as text URL inputs,
 *   - `lineItems` renders as the object-list repeater (CONFIG-UX-AUDIT-1)
 *     — add-a-line UI storing the REAL `[{priceId, quantity}]` array the
 *     runtime schema expects (never a JSON-encoded string). Its `priceId`
 *     sub-field is a PER-ROW async picker sourced from `stripe:prices`
 *     (RESOLVERS-3) — previously a raw `price_xxx` text box; picking stores
 *     the raw price id, and `allowManualEntry` keeps paste/`{{...}}` mapping
 *     available. It is
 *     `required: true` + `visibleWhen: mode ∈ {payment, subscription}`
 *     (CONFIG-UX-SETUP-ADVANCED-1) — required-when-visible mirrors the
 *     runtime superRefine (required in those 2 modes, REJECTED in setup),
 *   - `customer` renders as an async combobox sourced from
 *     `stripe:customers` with `allowManualEntry: true` (RESOLVERS-1) —
 *     picking a customer stores the raw `cus_…` id; `customerEmail` stays
 *     plain text. The XOR between them is enforced at runtime (not
 *     expressible in FieldMeta) and documented in both descriptions,
 *   - `metadata` renders as the `keyvalue` chip UI — stored as the
 *     `Record<string, string>` wire shape Stripe's schema expects
 *     (`keyValueShape: "record"`, CONFIG-UX-AUDIT-1),
 *   - `automaticTax` is an advanced `object` fixed-key editor (single
 *     boolean key `enabled`, matching the runtime `.strict()` shape)
 *     behind the Advanced disclosure,
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
  listAiActions: () => Promise.resolve([]),
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
import { pickComboboxOption } from "./helpers/comboboxField";
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

const LINE_ITEMS = [{ priceId: "price_TestPrice", quantity: 2 }];
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
  // RESOLVERS-1 — `customer` is now backed by the `stripe:customers`
  // option source. Mock it so the picker loads deterministically.
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "stripe:customers") {
      return {
        ok: true,
        source: "stripe:customers",
        items: [
          { value: CUSTOMER_ID, label: "Ada Lovelace" },
          { value: "cus_OtherCustomer", label: "Grace Hopper" },
        ],
        hasMore: false,
      };
    }
    // RESOLVERS-3 — `lineItems[].priceId` is now backed by the
    // `stripe:prices` option source PER ROW (it was a raw `price_xxx` text
    // box while this resolver sat registered and unreferenced).
    if (source === "stripe:prices") {
      return {
        ok: true,
        source: "stripe:prices",
        items: [
          { value: "price_TestPrice", label: "Pro plan - $20.00/month" },
          { value: "price_Other", label: "Starter - $5.00/month" },
        ],
        hasMore: false,
      };
    }
    return {
      ok: false,
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown source '${source}'.`,
    };
  });
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("Stripe create_checkout_session meta declares mode select + object-list lineItems + plain-text URLs + customer stripe:customers combobox + record keyvalue metadata + customer-facing url output — Slice 3.46 meta guard + CONFIG-UX-AUDIT-1", () => {
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

  // lineItems: object-list repeater, required-when-visible — visibleWhen
  // scopes it to the 2 modes where the runtime superRefine REQUIRES it,
  // and hides it in `setup` mode where the runtime REJECTS it
  // (CONFIG-UX-SETUP-ADVANCED-1; hiding auto-clears a stale value).
  const lineItems = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "lineItems",
  )!;
  expect(lineItems.type).toBe("object-list");
  expect(lineItems.itemFields?.map((s) => s.name)).toEqual([
    "priceId",
    "quantity",
  ]);
  expect(lineItems.required).toBe(true);
  expect(lineItems.visibleWhen).toEqual({
    field: "mode",
    valueIn: ["payment", "subscription"],
  });

  // customer: optional combobox backed by the `stripe:customers` resolver
  // (RESOLVERS-1). allowManualEntry keeps a raw `cus_…` id / `{{...}}`
  // variable typeable.
  const customer = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "customer",
  )!;
  expect(customer.type).toBe("combobox");
  expect(customer.required).toBe(false);
  expect(customer.optionsSource).toBe("stripe:customers");
  expect(customer.allowManualEntry).toBe(true);
  expect(customer.options).toBeUndefined();

  // customerEmail: optional text.
  const customerEmail = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "customerEmail",
  )!;
  expect(customerEmail.type).toBe("text");
  expect(customerEmail.required).toBe(false);

  // The customer/customerEmail XOR is not expressible in FieldMeta, so
  // BOTH descriptions must carry the either-or copy at design time — it's
  // the only warning an author gets before the runtime superRefine
  // rejects the pair. RESOLVERS-1 reworded `customer` away from the
  // literal "mutex" wording, so assert the constraint each field actually
  // ships rather than a single shared keyword.
  expect(customer.description).toMatch(
    /use this or customer email, not both/i,
  );
  expect(customerEmail.description?.toLowerCase()).toContain("mutex");
  expect(customerEmail.description).toMatch(/pass one, not both/i);

  // metadata: keyvalue with keyValueMaxRows: 50, record wire shape
  const metadata = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "metadata",
  )!;
  expect(metadata.type).toBe("keyvalue");
  expect(metadata.keyValueShape).toBe("record");
  expect(metadata.required).toBe(false);
  expect(metadata.keyValueMaxRows).toBe(50);

  // automaticTax: advanced `object` fixed-key editor — single boolean
  // key `enabled`, exactly the runtime `.strict()` shape (json → object,
  // CONFIG-UX-SETUP-ADVANCED-1). Stays behind the Advanced disclosure.
  const automaticTax = stripeCreateCheckoutSessionMeta.fields.find(
    (f) => f.name === "automaticTax",
  )!;
  expect(automaticTax.type).toBe("object");
  expect(automaticTax.jsonShape).toBeUndefined();
  expect(automaticTax.itemFields?.map((s) => s.name)).toEqual(["enabled"]);
  expect(automaticTax.itemFields?.[0]?.type).toBe("boolean");
  expect(automaticTax.advanced).toBe(true);
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
  "end-to-end: choose Stripe Create Checkout Session → build lineItems visually + mode + URLs + customerId + metadata → Modal Save (draft only) → Toolbar Save (persists once, lineItems is a REAL array, metadata is a record, no hidden defaults)",
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

  // 6. Build the line items visually — no JSON anywhere. Add one row, PICK
  //    the price from the merchant's real catalog (RESOLVERS-3: this was a
  //    raw `price_xxx` text box), fill Quantity; the object-list renderer
  //    commits the REAL [{priceId, quantity}] array the runtime schema
  //    expects. Picking stores the RAW price id — the friendly catalog label
  //    ("Pro plan …") must never leak into config.
  await user.click(screen.getByTestId("object-list-lineItems-add"));
  expect(
    screen.queryByRole("textbox", { name: /price id \(entry 1\)/i }),
  ).toBeNull();
  await pickComboboxOption(user, /^price$/i, /pro plan/i);
  await user.click(screen.getByRole("spinbutton", { name: /quantity \(entry 1\)/i }));
    await user.paste("2");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.lineItems,
  ).toEqual(LINE_ITEMS);
  // The paste-JSON path is gone from the normal setup surface.
  expect(document.body.textContent).not.toMatch(/paste json/i);

  // 7. Pick the customer from the `stripe:customers` picker (the
  //    `customer` field) — the committed value is the RAW `cus_…` id; the
  //    friendly label ("Ada Lovelace") must never leak into config.
  expect(screen.queryByRole("textbox", { name: /^customer id$/i })).toBeNull();
  await pickComboboxOption(user, /^customer$/i, /ada lovelace/i);
  expect(useConfigSlice.getState().drafts[action.id]!.values.customer).toBe(
    CUSTOMER_ID,
  );

  // 8. Fill the metadata keyvalue chip UI: add one row, type key/value.
  await user.click(screen.getByRole("button", { name: /add row/i }));
  await user.click(screen.getByRole("textbox", { name: /metadata key 1/i }));
    await user.paste("order_id");
  await user.click(screen.getByRole("textbox", { name: /metadata value 1/i }));
    await user.paste("ord_99");
  const draftMetadata = useConfigSlice.getState().drafts[action.id]!.values
    .metadata;
  // Record wire shape (keyValueShape: "record") — what Stripe's
  // z.record schema expects. Never an array of pairs, never a string.
  expect(draftMetadata).toEqual({ order_id: "ord_99" });

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
  // lineItems persists as the REAL array the runtime schema expects.
  expect(pendingConfig.lineItems).toEqual(LINE_ITEMS);
  expect(pendingConfig.customer).toBe(CUSTOMER_ID);
  expect(pendingConfig.metadata).toEqual({ order_id: "ord_99" });
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
  expect(persistedAction.config.lineItems).toEqual(LINE_ITEMS);
  expect(persistedAction.config.customer).toBe(CUSTOMER_ID);
  expect(persistedAction.config.metadata).toEqual({ order_id: "ord_99" });
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
