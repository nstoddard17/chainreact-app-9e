/**
 * Slice 3.42 integration test — Notion `list_comments` config end-to-end
 * through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for Slice 3.42's "bounded read with pagination"
 * surface (shared by list_users / get_block_children / list_comments):
 *   - blockId renders as a required `notion:pages` combobox with
 *     `allowManualEntry` — the shape every Notion block/page field uses.
 *     SMOKE-ACTIONS-TIER1-CLEANUP (d31fb8cbd) upgraded it from a raw text
 *     box to a real account-aware selector (Rule 17); manual entry keeps a
 *     raw BLOCK id (which the page-search resolver can't enumerate) and
 *     `{{...}}` upstream wiring reachable,
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
  // One payload field so the builder has a real upstream source — the
  // variable picker hides itself when there are none, and `blockId` wiring
  // from an earlier step is a first-class path for this action.
  payloadShape: [
    { name: "pageId", type: "string", description: "Notion page id." },
  ],
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

/**
 * A raw BLOCK id — deliberately NOT one of the pages the `notion:pages`
 * resolver enumerates. Listing comments on a block (rather than a whole page)
 * is a normal use of this action, and page search can never surface it, so the
 * manual-entry path is the only way to configure it.
 */
const BLOCK_ID = "abcd1234-5678-90ab-cdef-1234567890ab";
const PAGE_ID = "11112222-3333-4444-5555-666677778888";

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
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "notion:pages") {
      return {
        ok: true as const,
        source,
        items: [{ value: PAGE_ID, label: "Meeting Notes" }],
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

it("Notion list_comments meta exposes blockId (required notion:pages picker) + pageSize (optional number 1..100) and OMITS startCursor — Slice 3.42 meta guard", () => {
  const names = notionListCommentsMeta.fields.map((f) => f.name);
  expect(names).toEqual(["blockId", "pageSize"]);
  expect(names).not.toContain("startCursor");

  const byName = new Map(
    notionListCommentsMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("blockId")!.type).toBe("combobox");
  expect(byName.get("blockId")!.optionsSource).toBe("notion:pages");
  // BUILDER-BASELINE-FAILURES-1 — this flag is load-bearing, not cosmetic:
  // ComboboxField gates BOTH the manual "paste an id" entry and the variable
  // picker on it. Without it a raw block id and `{{upstream.pageId}}` are
  // unreachable, which the field's own description promises. Every sibling
  // `notion:pages` field sets it.
  expect(byName.get("blockId")!.allowManualEntry).toBe(true);
  expect(byName.get("blockId")!.required).toBe(true);
  const pageSize = byName.get("pageSize")!;
  expect(pageSize.type).toBe("number");
  expect(pageSize.required).toBe(false);
  expect(pageSize.numeric?.min).toBe(1);
  expect(pageSize.numeric?.max).toBe(100);
  expect(pageSize.numeric?.integer).toBe(true);
});

it("end-to-end: manual-entry a raw block id + set pageSize=25 → Modal Save (draft only) → Toolbar Save (updateWorkflow once); startCursor never renders", async () => {
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
      screen.getByRole("combobox", { name: /^block \/ page$/i }),
    ).toBeInTheDocument();
  });
  expect(
    screen.getByRole("spinbutton", { name: /^page size$/i }),
  ).toBeInTheDocument();
  // startCursor is server-managed and intentionally absent from meta.
  expect(screen.queryByRole("textbox", { name: /start cursor/i })).toBeNull();
  expect(screen.queryByRole("spinbutton", { name: /start cursor/i })).toBeNull();

  // 4. Commit a raw BLOCK id through manual entry. The `notion:pages`
  //    resolver only enumerates PAGES, so this id is not in the list — this
  //    is the path a user takes to list comments on a block, and it only
  //    exists because the field sets `allowManualEntry`.
  await user.click(screen.getByRole("combobox", { name: /^block \/ page$/i }));
  await user.type(await screen.findByPlaceholderText(/select a page/i), BLOCK_ID);
  await user.click(await screen.findByTestId("combobox-manual-entry"));
  await waitFor(() =>
    expect(useConfigSlice.getState().drafts[action.id]!.values.blockId).toBe(
      BLOCK_ID,
    ),
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

/**
 * BUILDER-BASELINE-FAILURES-1 regression guard.
 *
 * `blockId` was converted from a raw text box to a `notion:pages` picker
 * (SMOKE-ACTIONS-TIER1-CLEANUP) WITHOUT `allowManualEntry`, which silently
 * removed both the variable picker and manual id entry — so "list comments on
 * the page from the trigger", the single most common shape for this action,
 * became impossible to configure. Every sibling `notion:pages` field kept the
 * flag; only this one lost it.
 *
 * This asserts the user-facing capability, not the flag.
 */
it("blockId can be wired from an upstream step — the variable picker is available and commits the token", async () => {
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual")).toBeInTheDocument());
  await user.click(screen.getByText("Manual"));

  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse notion actions/i }),
  );
  await waitFor(() =>
    expect(screen.getByText("List Comments")).toBeInTheDocument(),
  );
  await user.click(screen.getByText("List Comments"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;

  await openLastNodeOfKind("action");
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: /^block \/ page$/i }),
    ).toBeInTheDocument(),
  );

  // The picker renders beside the combobox (it hides itself when a field
  // can't take a free value — which is exactly what the regression caused).
  await user.click(
    await screen.findByTestId("combobox-blockId-picker-trigger"),
  );
  await user.click(await screen.findByLabelText("Insert {{trigger.pageId}}"));

  // Setting a variable REPLACES the combobox value (ComboboxField contract).
  await waitFor(() =>
    expect(useConfigSlice.getState().drafts[action.id]!.values.blockId).toBe(
      "{{trigger.pageId}}",
    ),
  );
});
