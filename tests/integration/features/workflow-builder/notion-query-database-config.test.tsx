/**
 * Slice 3.41 integration test — Notion `query_database` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for the "id-with-JSON-filter" surface — a
 * shape no other Notion meta exercises end-to-end:
 *   - databaseId is a plain text field (resolver-less for v1; future
 *     `notion:databases` resolver flips it without contract churn),
 *   - filter renders as an optional textarea (raw Notion filter JSON
 *     forward-passed to the API),
 *   - sorts renders as an optional textarea (raw Notion sort array),
 *   - pageSize renders as an optional number with min:1 / max:100
 *     bounds (Notion's hard ceiling),
 *   - **startCursor is intentionally absent** from the meta — pagination
 *     handle is server-managed; authors call again with `{{prev.nextCursor}}`,
 *   - Modal Save flushes the draft,
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
import { notionQueryDatabaseMeta } from "@/integrations/notion/actions/queryDatabase.meta";
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
const actionProviders = [{ id: "notion", displayName: "Notion" }];

const DATABASE_ID = "abcd1234-5678-90ab-cdef-1234567890ab";
const FILTER_JSON = '{"property":"Status","select":{"equals":"Done"}}';
const SORTS_JSON = '[{"property":"Name","direction":"ascending"}]';

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "notion" ? [notionQueryDatabaseMeta] : [],
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

it("Notion query_database meta exposes databaseId / filter / sorts / pageSize and OMITS startCursor — Slice 3.41 meta guard", () => {
  const names = notionQueryDatabaseMeta.fields.map((f) => f.name);
  expect(names).toEqual(["databaseId", "filter", "sorts", "pageSize"]);
  expect(names).not.toContain("startCursor");

  const byName = new Map(
    notionQueryDatabaseMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("databaseId")!.type).toBe("text");
  expect(byName.get("databaseId")!.required).toBe(true);
  expect(byName.get("filter")!.type).toBe("textarea");
  expect(byName.get("filter")!.required).toBe(false);
  expect(byName.get("sorts")!.type).toBe("textarea");
  expect(byName.get("sorts")!.required).toBe(false);
  const pageSize = byName.get("pageSize")!;
  expect(pageSize.type).toBe("number");
  expect(pageSize.required).toBe(false);
  expect(pageSize.numeric?.min).toBe(1);
  expect(pageSize.numeric?.max).toBe(100);
  expect(pageSize.numeric?.integer).toBe(true);
});

it("end-to-end: type databaseId + paste filter+sorts JSON + set pageSize → Modal Save (draft only) → Toolbar Save (updateWorkflow once)", async () => {
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

  // 2. Drill into Notion → Query Database.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse notion actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Query Database")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Query Database"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("notion");
  expect(action.type).toBe("query_database");

  // 3. Open config rail. Verify the four expected controls render and
  //    startCursor is NOT in the form.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole("textbox", { name: /^database id$/i }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^filter$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^sorts$/i })).toBeInTheDocument();
  expect(
    screen.getByRole("spinbutton", { name: /^page size$/i }),
  ).toBeInTheDocument();
  // startCursor is server-managed and intentionally absent from meta.
  expect(screen.queryByRole("textbox", { name: /start cursor/i })).toBeNull();

  // 4. Type databaseId.
  await user.type(
    screen.getByRole("textbox", { name: /^database id$/i }),
    DATABASE_ID,
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.databaseId).toBe(
    DATABASE_ID,
  );

  // 5. Paste filter JSON. Textarea stores the literal string.
  await user.click(screen.getByRole("textbox", { name: /^filter$/i }));
  await user.paste(FILTER_JSON);
  expect(useConfigSlice.getState().drafts[action.id]!.values.filter).toBe(
    FILTER_JSON,
  );

  // 6. Paste sorts JSON.
  await user.click(screen.getByRole("textbox", { name: /^sorts$/i }));
  await user.paste(SORTS_JSON);
  expect(useConfigSlice.getState().drafts[action.id]!.values.sorts).toBe(
    SORTS_JSON,
  );

  // 7. Set pageSize. NumberField parses integer-typed bounds.
  await user.type(
    screen.getByRole("spinbutton", { name: /^page size$/i }),
    "50",
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.pageSize).toBe(50);

  // 8. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.databaseId).toBe(DATABASE_ID);
  expect(pendingConfig.filter).toBe(FILTER_JSON);
  expect(pendingConfig.sorts).toBe(SORTS_JSON);
  expect(pendingConfig.pageSize).toBe(50);
  expect(pendingConfig.startCursor).toBeUndefined();

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
  expect(persistedAction.provider).toBe("notion");
  expect(persistedAction.type).toBe("query_database");
  expect(persistedAction.config.databaseId).toBe(DATABASE_ID);
  expect(persistedAction.config.filter).toBe(FILTER_JSON);
  expect(persistedAction.config.sorts).toBe(SORTS_JSON);
  expect(persistedAction.config.pageSize).toBe(50);
  expect(persistedAction.config.startCursor).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
