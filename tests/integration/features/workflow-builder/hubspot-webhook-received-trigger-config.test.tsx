/**
 * Slice 3.HUBSPOT-6 integration test — HubSpot `webhook_received`
 * trigger config end-to-end through the live WorkflowBuilder shell.
 *
 * Closes the HubSpot provider arc (26 actions + 1 trigger, hubspot
 * now in COVERED_PROVIDERS). Pins:
 *   - meta-shape guard: single required `subscriptions` textarea +
 *     12-field payloadShape mirroring `normalize.ts` + sensitive
 *     flags on `propertyValue` + `event`.
 *   - end-to-end: pick HubSpot Webhook Received trigger → paste a
 *     subscriptions JSON literal that parseSubscriptions would
 *     accept → Modal Save flushes draft → Toolbar Save persists once.
 *   - subscriptions persists as the LITERAL STRING the textarea
 *     stored (matches the Notion / Stripe paste-JSON pattern — the
 *     UI does NOT parse, the runtime engine + activate.ts do).
 *   - exact runtime config field name `subscriptions` round-trips
 *     (NOT `subscriptionList`, NOT camelCased).
 *   - server-managed activation state (`webhookEnabled`, `appId`,
 *     `hubId`, the post-activate `subscriptions[]` rewrite with
 *     appSubscriptionId / hubspotSubscriptionId fields) is NOT
 *     manufactured by Save — the activate hook writes those into
 *     `trigger_resources.config` at activation time, NOT into the
 *     workflow's node config.
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
import { hubspotWebhookReceivedTriggerMeta } from "@/integrations/hubspot/triggers/webhookReceived/webhookReceived.meta";
import type { WorkflowDetail } from "@/contracts/workflow";

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

const triggerProviders = [{ id: "hubspot", displayName: "HubSpot" }];
const actionProviders = [{ id: "hubspot", displayName: "HubSpot" }];

// Subscriptions JSON literal — shape that activate.ts/parseSubscriptions
// accepts: mix of *.creation (no propertyName) + *.propertyChange (with
// propertyName). The textarea stores this verbatim as a string; the
// runtime engine + Zod parser shred it at activation time.
const SUBSCRIPTIONS_JSON =
  '[{"eventType":"contact.creation"},{"eventType":"deal.propertyChange","propertyName":"amount"},{"eventType":"ticket.deletion"}]';

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "hubspot" ? [hubspotWebhookReceivedTriggerMeta] : [],
  );
  mockFetchOptionsSource.mockReset();
  // Defensive: this trigger meta has ZERO optionsSource fields. Any
  // fetch invocation indicates a meta-shape regression.
  mockFetchOptionsSource.mockImplementation(async (source: string) => ({
    ok: false,
    source,
    code: "SOURCE_NOT_FOUND",
    message: `Unknown source '${source}' (test mock).`,
  }));
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("HubSpot webhook_received trigger meta — single required subscriptions textarea + 12-field payload + propertyValue/event sensitive — Slice 3.HUBSPOT-6 meta guard", () => {
  // Trigger-level guards.
  expect(hubspotWebhookReceivedTriggerMeta.activation).toBe("webhook");
  expect(hubspotWebhookReceivedTriggerMeta.requiresIntegration).toBe(true);
  expect(hubspotWebhookReceivedTriggerMeta.category).toBe("crm");

  // Field surface — single required subscriptions textarea. No
  // optionsSource fields.
  expect(hubspotWebhookReceivedTriggerMeta.fields.map((f) => f.name)).toEqual([
    "subscriptions",
  ]);
  const subscriptionsField = hubspotWebhookReceivedTriggerMeta.fields[0]!;
  expect(subscriptionsField.type).toBe("textarea");
  expect(subscriptionsField.required).toBe(true);
  expect(subscriptionsField.optionsSource).toBeUndefined();
  // Description must call out the propertyChange rule so workflow
  // authors don't have to read activate.ts.
  expect(subscriptionsField.description!.toLowerCase()).toContain(
    "propertychange",
  );
  expect(subscriptionsField.description!.toLowerCase()).toContain(
    "propertyname",
  );

  // Payload shape mirrors normalize.ts:normalizeHubSpotEvent exactly.
  expect(
    hubspotWebhookReceivedTriggerMeta.payloadShape.map((o) => o.name),
  ).toEqual([
    "subscriptionType",
    "portalId",
    "hubId",
    "objectId",
    "propertyName",
    "propertyValue",
    "occurredAt",
    "subscriptionId",
    "appId",
    "attemptNumber",
    "changeSource",
    "event",
  ]);
  const byPayloadName = new Map(
    hubspotWebhookReceivedTriggerMeta.payloadShape.map((o) => [o.name, o]),
  );
  // propertyValue + raw event are sensitive (customer-data carriers).
  expect(byPayloadName.get("propertyValue")!.sensitive).toBe(true);
  expect(byPayloadName.get("event")!.sensitive).toBe(true);
  // Discriminators + opaque IDs stay structural.
  for (const name of [
    "subscriptionType",
    "portalId",
    "hubId",
    "objectId",
    "propertyName",
    "occurredAt",
    "subscriptionId",
    "appId",
    "attemptNumber",
    "changeSource",
  ]) {
    expect(byPayloadName.get(name)!.sensitive).toBeFalsy();
  }
});

it("end-to-end: pick HubSpot Webhook Received → paste subscriptions JSON → Modal Save → Toolbar Save persists ONCE with the literal string + EXACT runtime field name `subscriptions`", async () => {
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

  // 1. Open the trigger picker.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));

  // 2. Drill into HubSpot → Webhook Received.
  await user.click(
    screen.getByRole("button", { name: /browse hubspot triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Webhook Received")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Webhook Received"));

  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger")!;
  expect(trigger.provider).toBe("hubspot");
  expect(trigger.type).toBe("webhook_received");

  // 3. Open the trigger config rail.
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(
      screen.getByRole("textbox", { name: /^subscriptions/i }),
    ).toBeInTheDocument();
  });

  // 4. Paste subscriptions JSON. Textarea stores the literal string
  //    verbatim — no parsing in the renderer (Notion / Stripe paste-
  //    JSON pattern).
  await user.click(
    screen.getByRole("textbox", { name: /^subscriptions/i }),
  );
  await user.paste(SUBSCRIPTIONS_JSON);
  expect(
    useConfigSlice.getState().drafts[trigger.id]!.values.subscriptions,
  ).toBe(SUBSCRIPTIONS_JSON);

  // 5. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === trigger.id)!.config;
  // CRITICAL: exact HubSpot runtime config field name round-trips —
  // `subscriptions` (NOT `subscriptionList`, NOT `subscription_list`).
  expect(pendingConfig.subscriptions).toBe(SUBSCRIPTIONS_JSON);
  // Stored as a literal string — the textarea does NOT parse JSON.
  // The runtime engine + activate.ts:parseSubscriptions do the parse.
  expect(typeof pendingConfig.subscriptions).toBe("string");

  // Modal Save MUST NOT call updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 6. Toolbar Save persists once.
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
  const persistedTrigger = persistedNodes.find((n) => n.kind === "trigger")!;
  expect(persistedTrigger.provider).toBe("hubspot");
  expect(persistedTrigger.type).toBe("webhook_received");
  expect(persistedTrigger.config.subscriptions).toBe(SUBSCRIPTIONS_JSON);

  // Server-managed activation state MUST NOT leak into the workflow's
  // node config — activate.ts writes webhookEnabled / appId / hubId /
  // the post-activate subscriptions[] rewrite (with appSubscriptionId /
  // hubspotSubscriptionId) into `trigger_resources.config`, NOT into
  // the node's persisted config. Catches a future Save handler bug
  // that copies activation state back onto the node.
  expect(persistedTrigger.config.webhookEnabled).toBeUndefined();
  expect(persistedTrigger.config.appId).toBeUndefined();
  expect(persistedTrigger.config.hubId).toBeUndefined();

  // Resolver was never hit — this trigger meta has no optionsSource
  // fields. Any non-zero count would indicate a meta-shape regression.
  expect(mockFetchOptionsSource).not.toHaveBeenCalled();

  // Single updateWorkflow call.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
