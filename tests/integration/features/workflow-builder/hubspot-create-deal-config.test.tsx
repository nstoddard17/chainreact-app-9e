/**
 * Slice 3.HUBSPOT-4 integration test — HubSpot `create_deal` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * First HubSpot config test to exercise the HUBSPOT-2 resolvers:
 *   - `hubspot:deal_pipelines` → `hubspot:deal_stages` cascade (the
 *     stage picker is gated until a pipeline is chosen; switching
 *     pipeline re-fetches stages).
 *   - `hubspot:owners` (the `hubspot_owner_id` combobox).
 *
 * Covers:
 *   - dealname required text + optional amount text (numeric-string
 *     pin — schema is z.string()).
 *   - pipeline optional combobox (gates dealstage).
 *   - dealstage required combobox with dependsOn: pipeline (the
 *     dependsOn invariant is the load-bearing assertion — matches
 *     hubspotDealStagesResolver.requiredDeps).
 *   - hubspot_owner_id optional combobox sourced from hubspot:owners.
 *   - Modal Save flushes draft → Toolbar Save persists once via
 *     updateWorkflow.
 *   - Persisted config carries the EXACT runtime field names from the
 *     schema (dealname / dealstage / pipeline / amount / hubspot_owner_id —
 *     no camelCase rewrites).
 *
 * Out of scope (covered separately):
 *   - The cascade infrastructure itself (clear-on-parent-change,
 *     gated-when-empty) — covered by hubspot-options-cascade.test.tsx.
 *   - getDeals / updateDeal field surfaces — covered by the registry
 *     surface tests.
 *   - createTicket — sibling integration test owns the ticket UX.
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
import { hubspotCreateDealMeta } from "@/integrations/hubspot/actions/meta/createDeal.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "./helpers/comboboxField";

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

const DEALNAME = "Acme — Enterprise Deal Q2";
const PIPELINE_ID = "default";
const PIPELINE_LABEL = "Sales Pipeline";
const DEALSTAGE_ID = "closedwon";
const DEALSTAGE_LABEL = "Closed Won";
const AMOUNT = "5000";
const OWNER_ID = "owner-42";
const OWNER_LABEL = "Alice Adams";

function pipelinesResponse(
  items: ReadonlyArray<{ value: string; label: string }>,
) {
  return {
    ok: true as const,
    source: "hubspot:deal_pipelines",
    items,
    hasMore: false,
  };
}

function stagesResponse(
  items: ReadonlyArray<{ value: string; label: string }>,
) {
  return {
    ok: true as const,
    source: "hubspot:deal_stages",
    items,
    hasMore: false,
  };
}

function ownersResponse(
  items: ReadonlyArray<{ value: string; label: string }>,
) {
  return {
    ok: true as const,
    source: "hubspot:owners",
    items,
    hasMore: false,
  };
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "hubspot" ? [hubspotCreateDealMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(
    (source: string, args?: { deps?: Record<string, string> }) => {
      if (source === "hubspot:deal_pipelines") {
        return Promise.resolve(
          pipelinesResponse([
            { value: PIPELINE_ID, label: PIPELINE_LABEL },
            { value: "enterprise", label: "Enterprise Pipeline" },
          ]),
        );
      }
      if (source === "hubspot:deal_stages") {
        if (args?.deps?.pipeline === PIPELINE_ID) {
          return Promise.resolve(
            stagesResponse([
              { value: "appointmentscheduled", label: "Appointment Scheduled" },
              { value: DEALSTAGE_ID, label: DEALSTAGE_LABEL },
            ]),
          );
        }
        if (args?.deps?.pipeline === "enterprise") {
          return Promise.resolve(
            stagesResponse([{ value: "ent-stage1", label: "Enterprise Stage 1" }]),
          );
        }
        return Promise.resolve(stagesResponse([]));
      }
      if (source === "hubspot:owners") {
        return Promise.resolve(
          ownersResponse([
            { value: OWNER_ID, label: OWNER_LABEL },
            { value: "owner-99", label: "Bob Builder" },
          ]),
        );
      }
      return Promise.resolve({
        ok: false,
        source,
        code: "SOURCE_NOT_FOUND",
        message: `Unknown source '${source}' (test mock).`,
      });
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

it("HubSpot create_deal meta exposes the schema's 8 fields with pipeline→dealstage cascade + hubspot:owners — Slice 3.HUBSPOT-4 meta guard", () => {
  const names = hubspotCreateDealMeta.fields.map((f) => f.name);
  expect(names).toEqual([
    "dealname",
    "pipeline",
    "dealstage",
    "amount",
    "closedate",
    "dealtype",
    "description",
    "hubspot_owner_id",
  ]);

  const byName = new Map(hubspotCreateDealMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("dealname")!.type).toBe("text");
  expect(byName.get("dealname")!.required).toBe(true);

  // pipeline → dealstage cascade pins.
  const pipeline = byName.get("pipeline")!;
  expect(pipeline.type).toBe("combobox");
  expect(pipeline.optionsSource).toBe("hubspot:deal_pipelines");
  expect(pipeline.required).toBe(false);
  const dealstage = byName.get("dealstage")!;
  expect(dealstage.type).toBe("combobox");
  expect(dealstage.optionsSource).toBe("hubspot:deal_stages");
  expect(dealstage.dependsOn).toBe("pipeline");
  expect(dealstage.required).toBe(true);

  // First owners-resolver consumer.
  const owner = byName.get("hubspot_owner_id")!;
  expect(owner.type).toBe("combobox");
  expect(owner.optionsSource).toBe("hubspot:owners");

  // amount is TEXT (HubSpot expects numeric strings).
  expect(byName.get("amount")!.type).toBe("text");

  // Risk classification + sensitive flag pins.
  expect(hubspotCreateDealMeta.riskLevel).toBe("medium");
  expect(hubspotCreateDealMeta.isDestructive).toBe(false);
  expect(hubspotCreateDealMeta.requiresConfirmation).toBe(false);
  expect(hubspotCreateDealMeta.riskDescription).toBeDefined();
  const sensitive = new Set(
    hubspotCreateDealMeta.outputs
      .filter((o) => o.sensitive === true)
      .map((o) => o.name),
  );
  expect(sensitive).toEqual(new Set(["dealname", "amount", "properties"]));
});

it("end-to-end: pick pipeline → stage picker activates and re-fetches scoped to pipeline → pick stage → pick owner → fill dealname/amount → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names", async () => {
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

  // 2. Drill into HubSpot → Create Deal.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse hubspot actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Deal")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Deal"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("hubspot");
  expect(action.type).toBe("create_deal");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^deal name$/i })).toBeInTheDocument();
  });
  expect(screen.getByRole("combobox", { name: /^pipeline$/i })).toBeInTheDocument();
  // dealstage is gated by pipeline — until pipeline is set, it renders
  // the Slice 3.33 cascade's "Select Pipeline first" passive trigger
  // (data-testid="combobox-parent-missing"), not a real combobox.
  expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^amount$/i })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /^owner$/i })).toBeInTheDocument();

  // 4. Type dealname (required text).
  await user.type(
    screen.getByRole("textbox", { name: /^deal name$/i }),
    DEALNAME,
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.dealname).toBe(
    DEALNAME,
  );

  // 5. Pick pipeline → fetches hubspot:deal_pipelines.
  await pickComboboxOption(user, /^pipeline$/i, PIPELINE_LABEL);
  await waitFor(() => {
    const pipelineCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "hubspot:deal_pipelines",
    );
    expect(pipelineCalls.length).toBeGreaterThan(0);
  });
  expect(useConfigSlice.getState().drafts[action.id]!.values.pipeline).toBe(
    PIPELINE_ID,
  );

  // 6. Stage picker now fetches scoped to chosen pipeline (deps.pipeline).
  await waitFor(() => {
    const stageCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "hubspot:deal_stages",
    );
    expect(stageCalls.length).toBeGreaterThan(0);
    const lastCall = stageCalls[stageCalls.length - 1]!;
    const args = lastCall[1] as { deps?: Record<string, string> } | undefined;
    expect(args?.deps?.pipeline).toBe(PIPELINE_ID);
  });

  // 7. Pick stage.
  await pickComboboxOption(user, /^deal stage$/i, DEALSTAGE_LABEL);
  expect(useConfigSlice.getState().drafts[action.id]!.values.dealstage).toBe(
    DEALSTAGE_ID,
  );

  // 8. Pick owner.
  await pickComboboxOption(user, /^owner$/i, OWNER_LABEL);
  await waitFor(() => {
    const ownerCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "hubspot:owners",
    );
    expect(ownerCalls.length).toBeGreaterThan(0);
  });
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.hubspot_owner_id,
  ).toBe(OWNER_ID);

  // 9. Type amount.
  await user.type(screen.getByRole("textbox", { name: /^amount$/i }), AMOUNT);
  expect(useConfigSlice.getState().drafts[action.id]!.values.amount).toBe(AMOUNT);

  // 10. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  // CRITICAL: exact HubSpot runtime field names round-trip — pipeline /
  // dealstage / hubspot_owner_id / dealname (NOT name) / amount.
  expect(pendingConfig.dealname).toBe(DEALNAME);
  expect(pendingConfig.pipeline).toBe(PIPELINE_ID);
  expect(pendingConfig.dealstage).toBe(DEALSTAGE_ID);
  expect(pendingConfig.amount).toBe(AMOUNT);
  expect(pendingConfig.hubspot_owner_id).toBe(OWNER_ID);
  // Untouched optional fields stay absent.
  expect(pendingConfig.closedate).toBeUndefined();
  expect(pendingConfig.dealtype).toBeUndefined();
  expect(pendingConfig.description).toBeUndefined();

  // Modal Save MUST NOT call updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 11. Toolbar Save persists once.
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
  expect(persistedAction.type).toBe("create_deal");
  expect(persistedAction.config.dealname).toBe(DEALNAME);
  expect(persistedAction.config.pipeline).toBe(PIPELINE_ID);
  expect(persistedAction.config.dealstage).toBe(DEALSTAGE_ID);
  expect(persistedAction.config.amount).toBe(AMOUNT);
  expect(persistedAction.config.hubspot_owner_id).toBe(OWNER_ID);

  // Single updateWorkflow call — combobox + text-input interactions
  // must not double-fire persistence.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
