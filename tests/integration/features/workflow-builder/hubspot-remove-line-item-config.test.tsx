/**
 * Slice 3.HUBSPOT-5 integration test — HubSpot `remove_line_item`
 * config end-to-end through the live WorkflowBuilder shell.
 *
 * Pins the sole destructive HubSpot action's metadata + persistence
 * round-trip. The destructive-confirmation modal itself is covered
 * by the cross-provider confirmation-modal unit tests; this test
 * focuses on:
 *   - meta-shape guard: isDestructive=true + requiresConfirmation=true
 *     + riskLevel=high + riskDescription present + single required
 *     lineItemId `hubspot:line_items` combobox (RESOLVERS-1) with
 *     allowManualEntry + narrow {lineItemId, deleted} outputs with
 *     neither sensitive.
 *   - end-to-end: pick action → pick a line item from the resolver-
 *     backed combobox → Modal Save flushes draft → Toolbar Save
 *     persists exactly once with the EXACT runtime field name
 *     (`lineItemId` — NOT camelCased / underscored / `id`).
 *
 * Out of scope (covered separately):
 *   - The confirmation modal UI itself — owned by the cross-provider
 *     ConfirmDestructiveActionDialog unit tests.
 *   - update_line_item / get_line_items / create_line_item field
 *     surfaces — owned by the registry surface tests.
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
import { pickComboboxOption } from "./helpers/comboboxField";
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
import { hubspotRemoveLineItemMeta } from "@/integrations/hubspot/actions/meta/removeLineItem.meta";
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
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "hubspot", displayName: "HubSpot" }];

const LINE_ITEM_ID = "987654321";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "hubspot" ? [hubspotRemoveLineItemMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  // RESOLVERS-1 — lineItemId is a `hubspot:line_items` combobox. The mock
  // mirrors the resolver contract: value = id, label = name, description = id.
  mockFetchOptionsSource.mockImplementation(async (source: string) =>
    source === "hubspot:line_items"
      ? {
          ok: true,
          source,
          items: [
            {
              value: LINE_ITEM_ID,
              label: "Pro Plan x3",
              description: LINE_ITEM_ID,
            },
            { value: "111", label: "Starter Plan", description: "111" },
          ],
          hasMore: false,
        }
      : {
          ok: false,
          source,
          code: "SOURCE_NOT_FOUND",
          message: `Unknown source '${source}' (test mock).`,
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

it("HubSpot remove_line_item meta declares the full destructive trio (high + isDestructive + requiresConfirmation) with riskDescription, single required lineItemId combobox + manual entry, narrow non-sensitive outputs — Slice 3.HUBSPOT-5 meta guard", () => {
  // Risk classification — the contract superRefine in actionMeta.ts
  // already enforces "isDestructive=true requires riskLevel=high",
  // but pin it from the test side too because this is the sole
  // HubSpot destructive action and a future regression would
  // silently downgrade the confirmation gate.
  expect(hubspotRemoveLineItemMeta.riskLevel).toBe("high");
  expect(hubspotRemoveLineItemMeta.isDestructive).toBe(true);
  expect(hubspotRemoveLineItemMeta.requiresConfirmation).toBe(true);
  expect(hubspotRemoveLineItemMeta.riskDescription).toBeDefined();
  expect(hubspotRemoveLineItemMeta.riskDescription!.length).toBeGreaterThan(0);

  // Field shape — single required record picker (RESOLVERS-1:
  // `hubspot:line_items` combobox; manual entry keeps pasted ids +
  // `{{...}}` wiring working), no other config.
  expect(hubspotRemoveLineItemMeta.fields.map((f) => f.name)).toEqual([
    "lineItemId",
  ]);
  const lineItemIdField = hubspotRemoveLineItemMeta.fields[0]!;
  expect(lineItemIdField.type).toBe("combobox");
  expect(lineItemIdField.optionsSource).toBe("hubspot:line_items");
  expect(lineItemIdField.allowManualEntry).toBe(true);
  expect(lineItemIdField.required).toBe(true);

  // Output shape — narrow {lineItemId, deleted}, neither sensitive
  // (DELETE returns 204, nothing customer-bearing to surface).
  expect(hubspotRemoveLineItemMeta.outputs.map((o) => o.name)).toEqual([
    "lineItemId",
    "deleted",
  ]);
  for (const o of hubspotRemoveLineItemMeta.outputs) {
    expect(o.sensitive).toBeFalsy();
  }

  // Provider / category / no-FileRef pins.
  expect(hubspotRemoveLineItemMeta.provider).toBe("hubspot");
  expect(hubspotRemoveLineItemMeta.category).toBe("crm");
  expect(hubspotRemoveLineItemMeta.requiresIntegration).toBe(true);
  expect(hubspotRemoveLineItemMeta.producesFileRef).toBe(false);
  expect(hubspotRemoveLineItemMeta.consumesFileRef).toBe(false);
});

it("end-to-end: pick Remove Line Item action → pick a line item from the combobox → Modal Save → Toolbar Save persists ONCE with EXACT runtime field name `lineItemId`", async () => {
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

  // 2. Drill into HubSpot → Remove Line Item.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse hubspot actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Remove Line Item")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Remove Line Item"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("hubspot");
  expect(action.type).toBe("remove_line_item");

  // 3. Open config rail. Expected single `hubspot:line_items` combobox.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^line item$/i }),
    ).toBeInTheDocument();
  });

  // 4. Pick the line item from the resolver-backed combobox — commits the
  //    stable id VALUE while the picker showed the human name label.
  await pickComboboxOption(user, /^line item$/i, "Pro Plan x3");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.lineItemId,
  ).toBe(LINE_ITEM_ID);

  // 5. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  // CRITICAL: exact HubSpot runtime field name round-trips —
  // `lineItemId` (NOT `id`, NOT `line_item_id`, NOT `lineItem_id`).
  expect(pendingConfig.lineItemId).toBe(LINE_ITEM_ID);
  // No stray fields land on the persisted config.
  expect(Object.keys(pendingConfig)).toEqual(["lineItemId"]);

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
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.provider).toBe("hubspot");
  expect(persistedAction.type).toBe("remove_line_item");
  expect(persistedAction.config.lineItemId).toBe(LINE_ITEM_ID);

  // The resolver was consulted for the `hubspot:line_items` picker —
  // and ONLY that source (no stray option fetches).
  const sourcesFetched = mockFetchOptionsSource.mock.calls.map(
    (c) => c[0] as string,
  );
  expect(sourcesFetched.length).toBeGreaterThan(0);
  expect(new Set(sourcesFetched)).toEqual(new Set(["hubspot:line_items"]));

  // Single updateWorkflow call.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
