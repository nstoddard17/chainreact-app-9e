/**
 * Slice 3.HUBSPOT-4 integration test — HubSpot `create_ticket` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Sibling to hubspot-create-deal-config — exercises the ticket
 * variant of the pipeline → stage cascade:
 *   - `hubspot:ticket_pipelines` → `hubspot:ticket_stages` cascade
 *     (parent field is `hs_pipeline`; child's dependsOn matches the
 *     resolver's requiredDeps).
 *   - `hubspot:owners` reuse (already exercised by create_deal — this
 *     test pins the ticket-meta wiring for defense in depth).
 *
 * Covers:
 *   - subject required text.
 *   - hs_pipeline required combobox sourced from hubspot:ticket_pipelines.
 *   - hs_pipeline_stage required combobox with dependsOn: hs_pipeline.
 *   - hs_ticket_priority static select (LOW/MEDIUM/HIGH, no default).
 *   - hubspot_owner_id optional combobox sourced from hubspot:owners.
 *   - Modal Save flushes draft → Toolbar Save persists once via
 *     updateWorkflow.
 *   - Persisted config carries the EXACT runtime field names from the
 *     schema (subject / hs_pipeline / hs_pipeline_stage / hubspot_owner_id —
 *     no camelCase rewrites, no fallback to deal-shape `pipeline`).
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
import { hubspotCreateTicketMeta } from "@/integrations/hubspot/actions/meta/createTicket.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "./helpers/comboboxField";
import { selectFieldOption } from "./helpers/selectField";

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

const SUBJECT = "Cannot log in after password reset";
const PIPELINE_ID = "support";
const PIPELINE_LABEL = "Support Pipeline";
const STAGE_ID = "1";
const STAGE_LABEL = "New";
const OWNER_ID = "owner-42";
const OWNER_LABEL = "Alice Adams";

function pipelinesResponse(
  items: ReadonlyArray<{ value: string; label: string }>,
) {
  return {
    ok: true as const,
    source: "hubspot:ticket_pipelines",
    items,
    hasMore: false,
  };
}

function stagesResponse(
  items: ReadonlyArray<{ value: string; label: string }>,
) {
  return {
    ok: true as const,
    source: "hubspot:ticket_stages",
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
    p === "hubspot" ? [hubspotCreateTicketMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(
    (source: string, args?: { deps?: Record<string, string> }) => {
      if (source === "hubspot:ticket_pipelines") {
        return Promise.resolve(
          pipelinesResponse([
            { value: PIPELINE_ID, label: PIPELINE_LABEL },
            { value: "billing", label: "Billing Pipeline" },
          ]),
        );
      }
      if (source === "hubspot:ticket_stages") {
        if (args?.deps?.hs_pipeline === PIPELINE_ID) {
          return Promise.resolve(
            stagesResponse([
              { value: STAGE_ID, label: STAGE_LABEL },
              { value: "2", label: "Waiting on Contact" },
              { value: "3", label: "Closed" },
            ]),
          );
        }
        if (args?.deps?.hs_pipeline === "billing") {
          return Promise.resolve(
            stagesResponse([{ value: "billing-1", label: "Billing Stage 1" }]),
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

it("HubSpot create_ticket meta exposes the schema's 11 fields with hs_pipeline→hs_pipeline_stage cascade + hubspot:owners + LOW/MEDIUM/HIGH priority select — Slice 3.HUBSPOT-4 meta guard", () => {
  const names = hubspotCreateTicketMeta.fields.map((f) => f.name);
  expect(names).toEqual([
    "subject",
    "hs_pipeline",
    "hs_pipeline_stage",
    "content",
    "hs_ticket_priority",
    "hs_ticket_category",
    "source_type",
    "hubspot_owner_id",
    "associatedContactId",
    "associatedCompanyId",
    "associatedDealId",
  ]);

  const byName = new Map(
    hubspotCreateTicketMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("subject")!.type).toBe("text");
  expect(byName.get("subject")!.required).toBe(true);

  // hs_pipeline → hs_pipeline_stage cascade pins. Critical: the
  // child's dependsOn MUST be `hs_pipeline` (NOT `pipeline` — that's
  // the deal-shape parent name). Mismatch would break the resolver's
  // requiredDeps gate.
  const pipeline = byName.get("hs_pipeline")!;
  expect(pipeline.type).toBe("combobox");
  expect(pipeline.required).toBe(true);
  expect(pipeline.optionsSource).toBe("hubspot:ticket_pipelines");
  const stage = byName.get("hs_pipeline_stage")!;
  expect(stage.type).toBe("combobox");
  expect(stage.required).toBe(true);
  expect(stage.optionsSource).toBe("hubspot:ticket_stages");
  expect(stage.dependsOn).toBe("hs_pipeline");

  // Owners wiring.
  const owner = byName.get("hubspot_owner_id")!;
  expect(owner.type).toBe("combobox");
  expect(owner.optionsSource).toBe("hubspot:owners");

  // Priority static enum.
  const priority = byName.get("hs_ticket_priority")!;
  expect(priority.type).toBe("select");
  expect(priority.required).toBe(false);
  expect(priority.defaultValue).toBeUndefined();
  expect(priority.options!.map((o) => o.value)).toEqual([
    "LOW",
    "MEDIUM",
    "HIGH",
  ]);

  // Risk + sensitive pins.
  expect(hubspotCreateTicketMeta.riskLevel).toBe("medium");
  expect(hubspotCreateTicketMeta.isDestructive).toBe(false);
  expect(hubspotCreateTicketMeta.requiresConfirmation).toBe(false);
  expect(hubspotCreateTicketMeta.riskDescription).toBeDefined();
  const sensitive = new Set(
    hubspotCreateTicketMeta.outputs
      .filter((o) => o.sensitive === true)
      .map((o) => o.name),
  );
  expect(sensitive).toEqual(new Set(["subject", "properties"]));
});

it("end-to-end: type subject → pick hs_pipeline → stage picker activates and re-fetches scoped to hs_pipeline → pick stage → pick owner → switch priority HIGH → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names", async () => {
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

  // 2. Drill into HubSpot → Create Ticket.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse hubspot actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Ticket")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Ticket"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("hubspot");
  expect(action.type).toBe("create_ticket");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^subject$/i })).toBeInTheDocument();
  });
  expect(screen.getByRole("combobox", { name: /^pipeline$/i })).toBeInTheDocument();
  // hs_pipeline_stage is gated by hs_pipeline — until pipeline is set,
  // it renders the Slice 3.33 cascade's "Select Pipeline first"
  // passive trigger (data-testid="combobox-parent-missing"), not a
  // real combobox.
  expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /^priority$/i })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /^owner$/i })).toBeInTheDocument();

  // 4. Type subject.
  await user.type(
    screen.getByRole("textbox", { name: /^subject$/i }),
    SUBJECT,
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.subject).toBe(
    SUBJECT,
  );

  // 5. Pick pipeline → fetches hubspot:ticket_pipelines.
  await pickComboboxOption(user, /^pipeline$/i, PIPELINE_LABEL);
  await waitFor(() => {
    const pipelineCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "hubspot:ticket_pipelines",
    );
    expect(pipelineCalls.length).toBeGreaterThan(0);
  });
  expect(useConfigSlice.getState().drafts[action.id]!.values.hs_pipeline).toBe(
    PIPELINE_ID,
  );

  // 6. Stage picker fetches scoped to chosen pipeline via
  //    deps.hs_pipeline — NOT deps.pipeline (that's the deal-shape
  //    parent name). Pinning this is the load-bearing assertion for
  //    the ticket cascade.
  await waitFor(() => {
    const stageCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "hubspot:ticket_stages",
    );
    expect(stageCalls.length).toBeGreaterThan(0);
    const lastCall = stageCalls[stageCalls.length - 1]!;
    const args = lastCall[1] as { deps?: Record<string, string> } | undefined;
    expect(args?.deps?.hs_pipeline).toBe(PIPELINE_ID);
  });

  // 7. Pick stage.
  await pickComboboxOption(user, /^stage$/i, STAGE_LABEL);
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.hs_pipeline_stage,
  ).toBe(STAGE_ID);

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

  // 9. Switch priority to High via the static select (plain-English
  //    label; committed value stays the HubSpot wire enum "HIGH").
  await selectFieldOption(user, /^priority$/i, "High");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.hs_ticket_priority,
  ).toBe("HIGH");

  // 10. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  // CRITICAL: exact HubSpot runtime field names round-trip. The
  // ticket schema's parent field is `hs_pipeline` (NOT `pipeline`)
  // and the stage field is `hs_pipeline_stage` (NOT `dealstage`).
  expect(pendingConfig.subject).toBe(SUBJECT);
  expect(pendingConfig.hs_pipeline).toBe(PIPELINE_ID);
  expect(pendingConfig.hs_pipeline_stage).toBe(STAGE_ID);
  expect(pendingConfig.hubspot_owner_id).toBe(OWNER_ID);
  expect(pendingConfig.hs_ticket_priority).toBe("HIGH");
  // Untouched optional fields stay absent.
  expect(pendingConfig.content).toBeUndefined();
  expect(pendingConfig.hs_ticket_category).toBeUndefined();
  expect(pendingConfig.source_type).toBeUndefined();
  expect(pendingConfig.associatedContactId).toBeUndefined();
  expect(pendingConfig.associatedCompanyId).toBeUndefined();
  expect(pendingConfig.associatedDealId).toBeUndefined();
  // The deal-shape parent name MUST NOT leak onto the ticket config —
  // catches a meta drift that mirrors create_deal's `pipeline` parent.
  expect(pendingConfig.pipeline).toBeUndefined();
  expect(pendingConfig.dealstage).toBeUndefined();

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
  expect(persistedAction.type).toBe("create_ticket");
  expect(persistedAction.config.subject).toBe(SUBJECT);
  expect(persistedAction.config.hs_pipeline).toBe(PIPELINE_ID);
  expect(persistedAction.config.hs_pipeline_stage).toBe(STAGE_ID);
  expect(persistedAction.config.hubspot_owner_id).toBe(OWNER_ID);
  expect(persistedAction.config.hs_ticket_priority).toBe("HIGH");

  // Single updateWorkflow call.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
