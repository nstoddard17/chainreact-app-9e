/**
 * HubSpot `webhook_received` trigger config end-to-end through the live
 * WorkflowBuilder shell — Slice 3.HUBSPOT-6, reshaped by CONFIG-UX-AUDIT-1.
 *
 * The `subscriptions` field is an OBJECT-LIST (visual add/remove rows:
 * event-type picker + conditional property-name input), replacing the
 * paste-JSON textarea. Pins:
 *   - meta-shape guard: single required `subscriptions` object-list whose
 *     eventType options mirror HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES 1:1 +
 *     propertyName gated to `*.propertyChange` rows + 12-field
 *     payloadShape with sensitive flags on `propertyValue` / `event`.
 *   - end-to-end: build three subscriptions VISUALLY (no JSON anywhere)
 *     → Modal Save flushes draft → Toolbar Save persists once.
 *   - RESOLVERS-4: propertyName is PICKED from the row's object type (the
 *     user chooses "Amount", never types `amount`), the row's own eventType
 *     is what scopes the request, and the SAVED ROW SHAPE is byte-identical
 *     to the hand-typed era — `EXPECTED_SUBSCRIPTIONS` below is unchanged,
 *     which is the pin that activation/parseSubscriptions stayed untouched.
 *   - subscriptions persists as the REAL `[{eventType, propertyName?}]`
 *     ARRAY that activate.ts:parseSubscriptions expects. The paste-JSON
 *     era stored a literal string, which parseSubscriptions REJECTED
 *     (`Array.isArray` guard) — the visual editor is the UX fix and the
 *     activation-correctness fix at once.
 *   - propertyName appears ONLY for `*.propertyChange` rows and is
 *     omitted from serialized creation/deletion rows (activate.ts
 *     rejects stray propertyName).
 *   - server-managed activation state (`webhookEnabled`, `appId`,
 *     `hubId`) is NOT manufactured by Save.
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
import { HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES } from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";
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

// The shape activate.ts:parseSubscriptions accepts: a REAL array mixing
// *.creation (no propertyName) + *.propertyChange (with propertyName).
const EXPECTED_SUBSCRIPTIONS = [
  { eventType: "contact.creation" },
  { eventType: "deal.propertyChange", propertyName: "amount" },
  { eventType: "ticket.deletion" },
];

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
  // RESOLVERS-4 — the ONLY option source on this meta is the per-row
  // propertyName picker (`hubspot:subscription_properties`); the eventType
  // picker is still STATIC options. The mock stands in for the server-side
  // dispatch: it asserts the row's eventType arrived as a dep and answers with
  // that object type's properties, so the test proves the builder→route wiring
  // without a HubSpot portal. Any OTHER source means a meta-shape regression.
  mockFetchOptionsSource.mockImplementation(
    async (source: string, opts?: { deps?: Record<string, string> }) => {
      if (source !== "hubspot:subscription_properties") {
        return {
          ok: false,
          source,
          code: "SOURCE_NOT_FOUND",
          message: `Unknown source '${source}' (test mock).`,
        };
      }
      const byEventType: Record<string, Array<{ value: string; label: string }>> =
        {
          "deal.propertyChange": [
            { value: "amount", label: "Amount" },
            { value: "dealstage", label: "Deal stage" },
          ],
          "contact.propertyChange": [
            { value: "hs_lead_status", label: "Lead status" },
          ],
        };
      return {
        ok: true,
        source,
        items: byEventType[opts?.deps?.eventType ?? ""] ?? [],
        hasMore: false,
      };
    },
  );
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("HubSpot webhook_received trigger meta — required subscriptions object-list mirroring the activation allowlist + 12-field payload + propertyValue/event sensitive — CONFIG-UX-AUDIT-1 meta guard", () => {
  // Trigger-level guards.
  expect(hubspotWebhookReceivedTriggerMeta.activation).toBe("webhook");
  expect(hubspotWebhookReceivedTriggerMeta.requiresIntegration).toBe(true);
  expect(hubspotWebhookReceivedTriggerMeta.category).toBe("crm");

  // Field surface — single required subscriptions object-list. No
  // optionsSource fields; no JSON language in the label or description.
  expect(hubspotWebhookReceivedTriggerMeta.fields.map((f) => f.name)).toEqual([
    "subscriptions",
  ]);
  const subscriptionsField = hubspotWebhookReceivedTriggerMeta.fields[0]!;
  expect(subscriptionsField.type).toBe("object-list");
  expect(subscriptionsField.required).toBe(true);
  // The object-list itself has no source; its propertyName SUB-field does
  // (RESOLVERS-4, asserted below).
  expect(subscriptionsField.optionsSource).toBeUndefined();
  expect(subscriptionsField.label.toLowerCase()).not.toContain("json");
  expect(subscriptionsField.description!.toLowerCase()).not.toContain("json");

  // Row shape: eventType select (static options == activation allowlist,
  // 1:1 and in order) + propertyName gated to *.propertyChange rows.
  expect(subscriptionsField.itemFields!.map((s) => s.name)).toEqual([
    "eventType",
    "propertyName",
  ]);
  const eventType = subscriptionsField.itemFields![0]!;
  expect(eventType.type).toBe("select");
  expect(eventType.required).toBe(true);
  expect(eventType.options!.map((o) => o.value)).toEqual([
    ...HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES,
  ]);
  const propertyName = subscriptionsField.itemFields![1]!;
  // RESOLVERS-4 — a REAL picker of the portal's own properties, scoped by THIS
  // row's eventType. `type` stays the VALUE type ("text"): the saved row shape
  // parseSubscriptions reads is unchanged, only the widget was upgraded.
  expect(propertyName.type).toBe("text");
  expect(propertyName.optionsSource).toBe("hubspot:subscription_properties");
  expect(propertyName.dependsOnRow).toBe("eventType");
  expect(propertyName.allowManualEntry).toBe(true);
  expect(propertyName.required).toBe(true); // required WHEN VISIBLE
  expect(propertyName.visibleWhen).toEqual({
    field: "eventType",
    valueEndsWith: ".propertyChange",
  });

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

it(
  "end-to-end: pick HubSpot Webhook Received → build subscriptions visually (conditional propertyName, no JSON) → Modal Save → Toolbar Save persists the REAL array under the EXACT runtime field name `subscriptions`",
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

    // 3. Open the trigger config rail — the object-list editor renders,
    //    and there is NO JSON-paste affordance anywhere on the panel.
    await openLastNodeOfKind("trigger");
    await waitFor(() => {
      expect(
        screen.getByTestId("object-list-subscriptions"),
      ).toBeInTheDocument();
    });
    expect(document.body.textContent).not.toMatch(/paste json|json array/i);

    // 4. Row 1 — "Contact created" (no propertyName input for creation).
    await user.click(screen.getByTestId("object-list-subscriptions-add"));
    await user.click(
      screen.getByRole("combobox", { name: /event \(entry 1\)/i }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Contact created" }),
    );
    expect(
      screen.queryByRole("combobox", { name: /^property to watch$/i }),
    ).not.toBeInTheDocument();

    // 5. Row 2 — "Deal property changed" reveals the property-name PICKER
    //    (RESOLVERS-4). The user never types an internal property name: they
    //    pick "Amount" by its HubSpot display label and the row commits the
    //    internal name `amount`.
    await user.click(screen.getByTestId("object-list-subscriptions-add"));
    await user.click(
      screen.getByRole("combobox", { name: /event \(entry 2\)/i }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Deal property changed" }),
    );
    const propertyPicker = await screen.findByRole("combobox", {
      name: /^property to watch$/i,
    });
    await user.click(propertyPicker);
    await user.click(await screen.findByText("Amount"));

    // The row's OWN eventType reached the resolver as a dep — that is what
    // lets one source serve rows watching different object types.
    await waitFor(() => {
      expect(mockFetchOptionsSource).toHaveBeenCalledWith(
        "hubspot:subscription_properties",
        expect.objectContaining({ deps: { eventType: "deal.propertyChange" } }),
      );
    });

    // 6. Row 3 — "Ticket deleted".
    await user.click(screen.getByTestId("object-list-subscriptions-add"));
    await user.click(
      screen.getByRole("combobox", { name: /event \(entry 3\)/i }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Ticket deleted" }),
    );

    // Draft holds the REAL array (not a JSON-encoded string). Hidden
    // propertyName keys are omitted from creation/deletion rows.
    expect(
      useConfigSlice.getState().drafts[trigger.id]!.values.subscriptions,
    ).toEqual(EXPECTED_SUBSCRIPTIONS);

    // 7. Modal Save flushes the draft.
    const modal = screen.getByRole("complementary", {
      name: /node configuration/i,
    });
    await user.click(within(modal).getByRole("button", { name: /^save$/i }));
    const pendingConfig = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === trigger.id)!.config;
    // CRITICAL: exact HubSpot runtime config field name round-trips —
    // `subscriptions` — and the value is the ARRAY activate.ts's
    // parseSubscriptions requires (Array.isArray guard).
    expect(Array.isArray(pendingConfig.subscriptions)).toBe(true);
    expect(pendingConfig.subscriptions).toEqual(EXPECTED_SUBSCRIPTIONS);

    // Modal Save MUST NOT call updateWorkflow yet.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();

    // 8. Toolbar Save persists once.
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
    expect(persistedTrigger.config.subscriptions).toEqual(
      EXPECTED_SUBSCRIPTIONS,
    );

    // Server-managed activation state MUST NOT leak into the workflow's
    // node config — activate.ts writes webhookEnabled / appId / hubId into
    // `trigger_resources.config`, NOT into the node's persisted config.
    expect(persistedTrigger.config.webhookEnabled).toBeUndefined();
    expect(persistedTrigger.config.appId).toBeUndefined();
    expect(persistedTrigger.config.hubId).toBeUndefined();

    // The ONLY source ever requested is the row-dispatching one — the
    // eventType picker is still static options, and no per-object property
    // resolver is reachable from this trigger.
    for (const [source] of mockFetchOptionsSource.mock.calls) {
      expect(source).toBe("hubspot:subscription_properties");
    }

    // Single updateWorkflow call.
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  },
  // Builds three object-list rows through Radix selects — comfortably
  // above the 5s default under parallel-worker contention.
  15_000,
);
