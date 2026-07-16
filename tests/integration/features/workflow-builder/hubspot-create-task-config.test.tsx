/**
 * Slice 3.HUBSPOT-5 integration test — HubSpot `create_task` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Representative engagement test for HUBSPOT-5 (covers
 * note/task/call/meeting via the task variant — they share the
 * "subject + owner combobox + select fields with schema defaults +
 * 4 association ids" UX shape).
 *
 * Covers:
 *   - hs_task_subject required text + hs_task_body optional textarea.
 *   - hs_task_status / hs_task_priority / hs_task_type select fields
 *     mirror the schema's Zod defaults (NOT_STARTED / MEDIUM / TODO);
 *     the meta-derived defaults seed the draft via
 *     `deriveDefaultConfig` so the draft carries them BEFORE the user
 *     edits anything.
 *   - hubspot_owner_id combobox sourced from `hubspot:owners`.
 *   - Modal Save flushes draft → Toolbar Save persists once.
 *   - Persisted config carries the EXACT runtime field names
 *     (hs_task_subject / hs_task_status / hs_task_priority /
 *     hs_task_type / hubspot_owner_id — NO camelCase rewrites).
 *   - meta-shape guard: subject + properties marked sensitive.
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
import { hubspotCreateTaskMeta } from "@/integrations/hubspot/actions/meta/createTask.meta";
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

const SUBJECT = "Follow up with Acme on contract";
const OWNER_ID = "owner-42";
const OWNER_LABEL = "Alice Adams";

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
    p === "hubspot" ? [hubspotCreateTaskMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
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
  });
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("HubSpot create_task meta exposes the schema's 12 fields with NOT_STARTED/MEDIUM/TODO defaults mirroring the schema + hubspot:owners owner combobox — Slice 3.HUBSPOT-5 meta guard", () => {
  const names = hubspotCreateTaskMeta.fields.map((f) => f.name);
  expect(names).toEqual([
    "hs_task_subject",
    "hs_task_body",
    "hs_task_status",
    "hs_task_priority",
    "hs_task_type",
    "hs_timestamp",
    "hs_task_reminders",
    "hubspot_owner_id",
    "associatedContactId",
    "associatedCompanyId",
    "associatedDealId",
    "associatedTicketId",
  ]);

  const byName = new Map(hubspotCreateTaskMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("hs_task_subject")!.type).toBe("text");
  expect(byName.get("hs_task_subject")!.required).toBe(true);

  // Select defaults mirror the schema's Zod defaults (mirroring V1).
  expect(byName.get("hs_task_status")!.defaultValue).toBe("NOT_STARTED");
  expect(byName.get("hs_task_priority")!.defaultValue).toBe("MEDIUM");
  expect(byName.get("hs_task_type")!.defaultValue).toBe("TODO");

  // Owners resolver consumption pin.
  const owner = byName.get("hubspot_owner_id")!;
  expect(owner.type).toBe("combobox");
  expect(owner.optionsSource).toBe("hubspot:owners");

  // Risk + sensitive output pins.
  expect(hubspotCreateTaskMeta.riskLevel).toBe("medium");
  expect(hubspotCreateTaskMeta.isDestructive).toBe(false);
  expect(hubspotCreateTaskMeta.requiresConfirmation).toBe(false);
  expect(hubspotCreateTaskMeta.riskDescription).toBeDefined();
  const sensitive = new Set(
    hubspotCreateTaskMeta.outputs
      .filter((o) => o.sensitive === true)
      .map((o) => o.name),
  );
  // subject + properties are the engagement-detail surfaces; everything
  // else (taskId / status / priority / type / association reports) stays
  // structural.
  expect(sensitive).toEqual(new Set(["subject", "properties"]));
});

it("end-to-end: meta-derived defaults seed the draft → type subject → switch priority HIGH + status IN_PROGRESS → pick owner → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names", async () => {
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

  // 2. Drill into HubSpot → Create Task.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse hubspot actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Task")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Task"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("hubspot");
  expect(action.type).toBe("create_task");
  // Meta defaults seed the draft via deriveDefaultConfig — pinned
  // BEFORE the user touches any control. If a future change adds a
  // hidden defaultValue to a different field (or removes one of
  // these), this assertion fails loudly.
  expect(action.config.hs_task_status).toBe("NOT_STARTED");
  expect(action.config.hs_task_priority).toBe("MEDIUM");
  expect(action.config.hs_task_type).toBe("TODO");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("textbox", { name: /^subject$/i }),
    ).toBeInTheDocument();
  });
  expect(
    screen.getByRole("combobox", { name: /^status$/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: /^priority$/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /^type$/i })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /^owner$/i })).toBeInTheDocument();

  // 4. Type subject.
  await user.type(
    screen.getByRole("textbox", { name: /^subject$/i }),
    SUBJECT,
  );
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.hs_task_subject,
  ).toBe(SUBJECT);

  // 5. Switch priority Medium → High via the static select (plain-English
  //    label; committed value stays the HubSpot wire enum "HIGH").
  await selectFieldOption(user, /^priority$/i, "High");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.hs_task_priority,
  ).toBe("HIGH");

  // 6. Switch status Not started → In progress (label; value stays
  //    "IN_PROGRESS").
  await selectFieldOption(user, /^status$/i, "In progress");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.hs_task_status,
  ).toBe("IN_PROGRESS");

  // 7. Pick owner via hubspot:owners combobox.
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

  // 8. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  // CRITICAL: exact HubSpot runtime field names round-trip. NO
  // camelCase rewrites — HubSpot's wire format is `hs_task_subject`,
  // `hs_task_priority`, `hs_task_status`, `hs_task_type`,
  // `hubspot_owner_id`.
  expect(pendingConfig.hs_task_subject).toBe(SUBJECT);
  expect(pendingConfig.hs_task_priority).toBe("HIGH");
  expect(pendingConfig.hs_task_status).toBe("IN_PROGRESS");
  expect(pendingConfig.hs_task_type).toBe("TODO");
  expect(pendingConfig.hubspot_owner_id).toBe(OWNER_ID);
  // Untouched optional fields stay absent.
  expect(pendingConfig.hs_task_body).toBeUndefined();
  expect(pendingConfig.hs_timestamp).toBeUndefined();
  expect(pendingConfig.hs_task_reminders).toBeUndefined();
  expect(pendingConfig.associatedContactId).toBeUndefined();
  expect(pendingConfig.associatedCompanyId).toBeUndefined();
  expect(pendingConfig.associatedDealId).toBeUndefined();
  expect(pendingConfig.associatedTicketId).toBeUndefined();

  // Modal Save MUST NOT call updateWorkflow yet.
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
  expect(persistedAction.provider).toBe("hubspot");
  expect(persistedAction.type).toBe("create_task");
  expect(persistedAction.config.hs_task_subject).toBe(SUBJECT);
  expect(persistedAction.config.hs_task_priority).toBe("HIGH");
  expect(persistedAction.config.hs_task_status).toBe("IN_PROGRESS");
  expect(persistedAction.config.hs_task_type).toBe("TODO");
  expect(persistedAction.config.hubspot_owner_id).toBe(OWNER_ID);

  // Single updateWorkflow call.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
