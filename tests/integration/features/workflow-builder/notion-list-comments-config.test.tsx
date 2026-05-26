/**
 * Slice 3.42 integration test — Notion `list_comments` config end-to-end
 * through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for Slice 3.42's "bounded read with pagination"
 * surface (shared by list_users / get_block_children / list_comments):
 *   - blockId renders as a plain required text field (accepts both
 *     block ids and page ids — workflow authors typically pass a page
 *     id to list page-level comments),
 *   - pageSize renders as an optional number with min:1 / max:100,
 *   - **startCursor is intentionally absent** from the meta — pagination
 *     handle is server-managed,
 *   - Modal Save flushes the draft,
 *   - Toolbar Save persists once.
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
import { notionListCommentsMeta } from "@/integrations/notion/actions/listComments.meta";
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

const BLOCK_ID = "abcd1234-5678-90ab-cdef-1234567890ab";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "notion" ? [notionListCommentsMeta] : [],
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

it("Notion list_comments meta exposes blockId (required text) + pageSize (optional number 1..100) and OMITS startCursor — Slice 3.42 meta guard", () => {
  const names = notionListCommentsMeta.fields.map((f) => f.name);
  expect(names).toEqual(["blockId", "pageSize"]);
  expect(names).not.toContain("startCursor");

  const byName = new Map(
    notionListCommentsMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("blockId")!.type).toBe("text");
  expect(byName.get("blockId")!.required).toBe(true);
  const pageSize = byName.get("pageSize")!;
  expect(pageSize.type).toBe("number");
  expect(pageSize.required).toBe(false);
  expect(pageSize.numeric?.min).toBe(1);
  expect(pageSize.numeric?.max).toBe(100);
  expect(pageSize.numeric?.integer).toBe(true);
});

it("end-to-end: type blockId + set pageSize=25 → Modal Save (draft only) → Toolbar Save (updateWorkflow once); startCursor never renders", async () => {
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

  // 2. Drill into Notion → List Comments.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse notion actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("List Comments")).toBeInTheDocument();
  });
  await user.click(screen.getByText("List Comments"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("notion");
  expect(action.type).toBe("list_comments");

  // 3. Open config rail. Verify both expected controls render and
  //    startCursor is NOT in the form.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("textbox", { name: /^block \/ page id$/i }),
    ).toBeInTheDocument();
  });
  expect(
    screen.getByRole("spinbutton", { name: /^page size$/i }),
  ).toBeInTheDocument();
  // startCursor is server-managed and intentionally absent from meta.
  expect(screen.queryByRole("textbox", { name: /start cursor/i })).toBeNull();
  expect(screen.queryByRole("spinbutton", { name: /start cursor/i })).toBeNull();

  // 4. Type blockId.
  await user.type(
    screen.getByRole("textbox", { name: /^block \/ page id$/i }),
    BLOCK_ID,
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.blockId).toBe(
    BLOCK_ID,
  );

  // 5. Set pageSize=25.
  await user.type(
    screen.getByRole("spinbutton", { name: /^page size$/i }),
    "25",
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.pageSize).toBe(25);

  // 6. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.blockId).toBe(BLOCK_ID);
  expect(pendingConfig.pageSize).toBe(25);
  expect(pendingConfig.startCursor).toBeUndefined();

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 7. Toolbar Save persists once.
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
  expect(persistedAction.type).toBe("list_comments");
  expect(persistedAction.config.blockId).toBe(BLOCK_ID);
  expect(persistedAction.config.pageSize).toBe(25);
  expect(persistedAction.config.startCursor).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
