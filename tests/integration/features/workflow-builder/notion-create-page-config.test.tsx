/**
 * Slice 3.41 integration test — Notion `create_page` config end-to-end
 * through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for the Notion page+database group. Proves
 * the heaviest paste-JSON surface in this batch round-trips through
 * the builder shell:
 *   - parent renders as a required textarea (paste-JSON discriminated
 *     union — no structured picker in v1 per the metadata plan §3.2),
 *   - properties renders as a required textarea (typed property-input
 *     map),
 *   - icon renders as an optional textarea (covers the "user fills
 *     one optional JSON field" code path),
 *   - children / cover left untouched stay `undefined` in the persisted
 *     config (matches Slack post_interactive_blocks precedent),
 *   - the saved JSON-bearing values are the literal strings the author
 *     pastes (the UI does NOT parse them — the runtime engine + Zod
 *     handle resolution / validation on save),
 *   - Modal Save flushes the draft into pendingNodes,
 *   - Modal Save does NOT call updateWorkflow,
 *   - Toolbar Save persists once via updateWorkflow with every filled
 *     field intact.
 *
 * Out of scope: integration tests for the simpler Notion actions
 * (archive_page, restore_page, get_page, update_page) — they share
 * shapes already exercised by registry tests or by query_database's
 * companion integration test. Adding more integration tests would
 * add little incremental coverage. The decision is documented in the
 * slice 3.41 report.
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

// No notion:* options resolvers exist in Slice 3.41 — the mock returns
// SOURCE_NOT_FOUND for any call, which is the truthful behavior. The
// renderer for `text` fields never calls fetchOptionsSource anyway.
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
import { notionCreatePageMeta } from "@/integrations/notion/actions/createPage.meta";
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

// JSON literals the author would paste. The textarea stores them
// verbatim as strings; the runtime Zod schema parses on save. The
// integration test only asserts the round-trip.
const PARENT_JSON = '{"databaseId":"abcd1234-5678-90ab-cdef-1234567890ab"}';
const PROPERTIES_JSON = '{"Name":{"type":"title","value":"Q4 plan"}}';
const ICON_JSON = '{"type":"emoji","emoji":"🎯"}';

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "notion" ? [notionCreatePageMeta] : [],
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

it("Notion create_page meta declares parent / properties / children / icon / cover textareas — Slice 3.41 meta guard", () => {
  const fieldNames = notionCreatePageMeta.fields.map((f) => f.name);
  expect(fieldNames).toEqual([
    "parent",
    "properties",
    "children",
    "icon",
    "cover",
  ]);

  const byName = new Map(
    notionCreatePageMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("parent")!.type).toBe("json");
  expect(byName.get("parent")!.required).toBe(true);
  expect(byName.get("properties")!.type).toBe("json");
  expect(byName.get("properties")!.required).toBe(true);
  for (const optional of ["children", "icon", "cover"]) {
    expect(byName.get(optional)!.type).toBe("json");
    expect(byName.get(optional)!.required).toBe(false);
  }

  // No resolver fields in Slice 3.41 — every Notion meta is resolver-free.
  for (const f of notionCreatePageMeta.fields) {
    expect(f.optionsSource).toBeUndefined();
  }
});

it("end-to-end: paste parent + properties JSON + optional icon → Modal Save (draft only) → Toolbar Save (updateWorkflow once with literal JSON strings)", async () => {
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

  // 2. Drill into Notion → Create Page.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse notion actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Page")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Page"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("notion");
  expect(action.type).toBe("create_page");

  // 3. Open config rail. Every create_page field is `advanced: true`,
  //    so the Setup tab shows NONE of them — they all live in the
  //    Advanced tab (CONFIG-UX-SETUP-ADVANCED-1).
  await openLastNodeOfKind("action");
  const advancedTab = await screen.findByRole("tab", { name: /advanced/i });
  expect(screen.queryByRole("textbox", { name: /^parent$/i })).toBeNull();
  expect(screen.queryByRole("textbox", { name: /^properties$/i })).toBeNull();
  expect(
    screen.queryByRole("textbox", { name: /^children blocks$/i }),
  ).toBeNull();
  expect(screen.queryByRole("textbox", { name: /^icon$/i })).toBeNull();
  expect(screen.queryByRole("textbox", { name: /^cover$/i })).toBeNull();

  // Switch to Advanced — all five JSON fields render there.
  await user.click(advancedTab);
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^parent$/i })).toBeInTheDocument();
  });
  expect(
    screen.getByRole("textbox", { name: /^properties$/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /^children blocks$/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^icon$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^cover$/i })).toBeInTheDocument();

  // 4. Paste parent JSON. Textarea stores the literal string — no
  //    UI-side parsing (matches Slack post_interactive_blocks
  //    convention).
  await user.click(screen.getByRole("textbox", { name: /^parent$/i }));
  await user.paste(PARENT_JSON);
  expect(useConfigSlice.getState().drafts[action.id]!.values.parent).toEqual(JSON.parse(PARENT_JSON));

  // 5. Paste properties JSON.
  await user.click(screen.getByRole("textbox", { name: /^properties$/i }));
  await user.paste(PROPERTIES_JSON);
  expect(useConfigSlice.getState().drafts[action.id]!.values.properties).toEqual(JSON.parse(PROPERTIES_JSON));

  // 6. Paste an optional icon JSON.
  await user.click(screen.getByRole("textbox", { name: /^icon$/i }));
  await user.paste(ICON_JSON);
  expect(useConfigSlice.getState().drafts[action.id]!.values.icon).toEqual(JSON.parse(ICON_JSON));

  // 7. Leave children + cover untouched — they should be absent from
  //    the persisted config.
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.children,
  ).toBeUndefined();
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.cover,
  ).toBeUndefined();

  // 8. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.parent).toEqual(JSON.parse(PARENT_JSON));
  expect(pendingConfig.properties).toEqual(JSON.parse(PROPERTIES_JSON));
  expect(pendingConfig.icon).toEqual(JSON.parse(ICON_JSON));
  expect(pendingConfig.children).toBeUndefined();
  expect(pendingConfig.cover).toBeUndefined();

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
  expect(persistedAction.type).toBe("create_page");
  // The persisted values stay as the literal JSON strings the author
  // pasted — the renderer does NOT parse them, the runtime does (or
  // {{...}} references are resolved by the engine).
  expect(persistedAction.config.parent).toEqual(JSON.parse(PARENT_JSON));
  expect(persistedAction.config.properties).toEqual(JSON.parse(PROPERTIES_JSON));
  expect(persistedAction.config.icon).toEqual(JSON.parse(ICON_JSON));
  expect(persistedAction.config.children).toBeUndefined();
  expect(persistedAction.config.cover).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
