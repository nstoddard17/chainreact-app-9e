/**
 * Slice 3.45 integration test — Stripe `create_payment_intent` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for the Stripe customer + payment lifecycle
 * group, AND the meta-layer guard against the dollars/cents footgun
 * (`create_payment_intent.amount` is DOLLARS; `capture_payment_intent
 * .amount_to_capture` is CENTS — different unit per the schemas).
 *
 * Proves end-to-end:
 *   - `amount` renders as `<input type="number">` with DOLLARS-anchored
 *     label + decimal step (NOT integer-only),
 *   - `currency` renders as plain text (NOT a 135-option select),
 *   - `customerId` is plain text (resolver-less for v1),
 *   - `metadata` renders as the `keyvalue` chip UI — the renderer
 *     stores typed `Array<{key, value}>` (NOT a JSON string),
*   - nextAction is exposed in the meta outputs (not exercised in the
 *     form; documented for variable-picker drilling); `clientSecret`
 *     was removed in Slice 3.SEC-8 — see
 *     `integrations/stripe/actions/createPaymentIntent.ts` JSDoc.
 *   - Modal Save flushes the draft into pendingNodes,
 *   - Toolbar Save persists once with every filled field intact.
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
import { stripeCreatePaymentIntentMeta } from "@/integrations/stripe/actions/createPaymentIntent.meta";
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

const CUSTOMER_ID = "cus_TestCustomer123";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "stripe" ? [stripeCreatePaymentIntentMeta] : [],
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

it("Stripe create_payment_intent meta declares dollars-anchored amount + plain-text currency + customerId text + keyvalue metadata + NO clientSecret output (Slice 3.SEC-8) — Slice 3.45 meta guard", () => {
  // amount: required number, min 0.01, step 0.01, dollars-anchored
  const amount = stripeCreatePaymentIntentMeta.fields.find(
    (f) => f.name === "amount",
  )!;
  expect(amount).toBeDefined();
  expect(amount.type).toBe("number");
  expect(amount.required).toBe(true);
  expect(amount.numeric?.min).toBe(0.01);
  expect(amount.numeric?.step).toBe(0.01);
  expect(amount.numeric?.integer).not.toBe(true);
  expect(amount.label.toLowerCase()).toContain("dollar");
  expect(amount.description?.toLowerCase()).toContain("dollar");

  // currency: required text, NOT a select (135+ ISO codes would balloon the meta)
  const currency = stripeCreatePaymentIntentMeta.fields.find(
    (f) => f.name === "currency",
  )!;
  expect(currency.type).toBe("text");
  expect(currency.required).toBe(true);
  expect(currency.options).toBeUndefined();

  // customerId: optional text (no resolver in v1)
  const customerId = stripeCreatePaymentIntentMeta.fields.find(
    (f) => f.name === "customerId",
  )!;
  expect(customerId.type).toBe("text");
  expect(customerId.required).toBe(false);
  expect(customerId.optionsSource).toBeUndefined();

  // metadata: keyvalue with keyValueMaxRows: 50
  const metadata = stripeCreatePaymentIntentMeta.fields.find(
    (f) => f.name === "metadata",
  )!;
  expect(metadata.type).toBe("keyvalue");
  expect(metadata.required).toBe(false);
  expect(metadata.keyValueMaxRows).toBe(50);

  // Slice 3.SEC-8 — clientSecret is NOT exposed as a workflow output.
  // Browser-side Payment Element flows belong in customer-facing surfaces
  // (Checkout Session, Payment Link); raw client_secret as a workflow
  // variable leaks into run history + downstream sinks.
  const outputNames = stripeCreatePaymentIntentMeta.outputs.map((o) => o.name);
  expect(outputNames).not.toContain("clientSecret");
  // Output `amount` documents the CENTS unit asymmetry
  const outAmount = stripeCreatePaymentIntentMeta.outputs.find(
    (o) => o.name === "amount",
  )!;
  expect(outAmount.description?.toLowerCase()).toContain("cent");
});

it("end-to-end: type dollars amount + currency + customerId + add metadata row → Modal Save (draft only) → Toolbar Save (updateWorkflow once with typed array metadata, not JSON string)", async () => {
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

  // 2. Drill into Stripe → Create Payment Intent.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse stripe actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Payment Intent")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Payment Intent"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("stripe");
  expect(action.type).toBe("create_payment_intent");
  // No hidden default risky fields seeded by the UI (Q11).
  expect(action.config).toEqual({});

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("spinbutton", { name: /amount.*usd dollars/i }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^currency$/i })).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /^customer id$/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /^description$/i }),
  ).toBeInTheDocument();

  // 4. Type amount in DOLLARS (e.g. 20.99). NumberField stores as a
  //    parsed number — NOT a string, NOT cents.
  await user.type(
    screen.getByRole("spinbutton", { name: /amount.*usd dollars/i }),
    "20.99",
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.amount).toBe(20.99);

  // 5. Type currency.
  await user.type(
    screen.getByRole("textbox", { name: /^currency$/i }),
    "usd",
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.currency).toBe(
    "usd",
  );

  // 6. Type customerId.
  await user.type(
    screen.getByRole("textbox", { name: /^customer id$/i }),
    CUSTOMER_ID,
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.customerId).toBe(
    CUSTOMER_ID,
  );

  // 7. Open the metadata keyvalue field: click Add row, then fill
  //    one key/value pair. The renderer emits `Array<{key, value}>`
  //    (typed array, NOT a JSON-encoded string).
  await user.click(screen.getByRole("button", { name: /add row/i }));
  await user.type(
    screen.getByRole("textbox", { name: /metadata key 1/i }),
    "order_id",
  );
  await user.type(
    screen.getByRole("textbox", { name: /metadata value 1/i }),
    "ord_42",
  );
  const draftMetadata = useConfigSlice.getState().drafts[action.id]!.values
    .metadata;
  expect(Array.isArray(draftMetadata)).toBe(true);
  expect(draftMetadata).toEqual([{ key: "order_id", value: "ord_42" }]);
  // CRITICAL: NOT a JSON-encoded string.
  expect(typeof draftMetadata).not.toBe("string");

  // 8. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.amount).toBe(20.99);
  expect(pendingConfig.currency).toBe("usd");
  expect(pendingConfig.customerId).toBe(CUSTOMER_ID);
  expect(pendingConfig.metadata).toEqual([
    { key: "order_id", value: "ord_42" },
  ]);

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 9. Toolbar Save persists once.
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
  expect(persistedAction.type).toBe("create_payment_intent");
  // Amount persists as the DOLLARS value the author typed. The handler's
  // runtime conversion to CENTS is engine-side; the meta layer stays
  // honest to the author's intent.
  expect(persistedAction.config.amount).toBe(20.99);
  expect(persistedAction.config.currency).toBe("usd");
  expect(persistedAction.config.customerId).toBe(CUSTOMER_ID);
  // Metadata persists as a typed array of {key, value} rows — NOT a
  // JSON string. The runtime converts array→Record<string,string>
  // before the Stripe handler sees it.
  expect(persistedAction.config.metadata).toEqual([
    { key: "order_id", value: "ord_42" },
  ]);
  expect(typeof persistedAction.config.metadata).not.toBe("string");
  // No hidden defaults snuck into the persisted config (Q11).
  expect(persistedAction.config.description).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
