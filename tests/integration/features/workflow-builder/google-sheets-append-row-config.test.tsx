/**
 * Google Sheets `append_row` configuration through the live
 * WorkflowBuilder shell.
 *
 * SHEETS-GUIDED-CONFIG-1 rewrote this suite. It previously pinned the
 * deferred experience — a free-text A1 `range` box, a blind positional
 * chip list, and the explicit absence of a tab picker. That deferral was
 * resolved by the approved plan
 * (docs/slices/phase-5/spreadsheet-guided-config/plan.md §10, decision
 * D1), so the assertions are REPLACED, not dropped: each one below
 * states the behavior a normal business user now gets.
 *
 * What this suite protects:
 *   - The normal setup path never asks for A1 notation. The user picks a
 *     spreadsheet, then a TAB; the raw cell range lives in Advanced for
 *     the power case.
 *   - Row values are labelled with the sheet's REAL column names, read
 *     through `google-sheets:columns` — never invented, never positional
 *     guesswork.
 *   - The SAVED SHAPE IS UNCHANGED: `values` still commits a real
 *     positional `string[]`. Column names are how cells are labelled,
 *     not a new storage format — that is what keeps existing workflows
 *     and the runtime handler compatible.
 *   - Q11 holds: `valueInputOption` has no default and the author must
 *     choose.
 *
 * Range DERIVATION is asserted here too: picking the tab writes the
 * range, and the Advanced field still accepts a deliberate override —
 * which is what keeps the power case reachable.
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
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";
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
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "google-sheets", displayName: "Google Sheets" }];

const SPREADSHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ";
const TAB = "Email log";
const COLUMNS = ["Timestamp", "From", "Subject"];

function optionsFor(source: string, deps: Record<string, string> | undefined) {
  if (source === "google-sheets:spreadsheets") {
    return {
      ok: true as const,
      source,
      items: [
        {
          value: SPREADSHEET_ID,
          label: "Workflow activity log",
          description: "Modified 2026-05-20",
        },
      ],
      hasMore: false,
    };
  }
  if (source === "google-sheets:sheets") {
    if (!deps?.spreadsheetId) {
      return {
        ok: false as const,
        source,
        code: "MISSING_DEPENDENCY",
        message: "Select a spreadsheet first.",
      };
    }
    return {
      ok: true as const,
      source,
      items: [
        { value: TAB, label: TAB, description: "412 rows × 3 columns" },
        { value: "Archive", label: "Archive", description: "1908 rows" },
      ],
      hasMore: false,
    };
  }
  if (source === "google-sheets:columns") {
    if (!deps?.spreadsheetId || !deps?.sheetName) {
      return {
        ok: false as const,
        source,
        code: "MISSING_DEPENDENCY",
        message: "Select a sheet first.",
      };
    }
    return {
      ok: true as const,
      source,
      items: COLUMNS.map((name, i) => ({
        value: name,
        label: name,
        description: `Column ${String.fromCharCode(65 + i)}`,
      })),
      hasMore: false,
    };
  }
  return {
    ok: false as const,
    source,
    code: "SOURCE_NOT_FOUND",
    message: `Unknown source '${source}'.`,
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
    p === "google-sheets" ? [googleSheetsAppendRowMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(
    async (source: string, args?: { deps?: Record<string, string> }) =>
      optionsFor(source, args?.deps),
  );
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("append_row metadata asks which spreadsheet and which tab, and keeps the raw cell range off the normal path", () => {
  const names = googleSheetsAppendRowMeta.fields.map((f) => f.name);
  // The tab picker is the change that makes column discovery possible.
  expect(names).toContain("sheetName");
  expect(names).toEqual([
    "spreadsheetId",
    "sheetName",
    "values",
    "valueInputOption",
    "insertDataOption",
    "range",
  ]);

  const byName = new Map(googleSheetsAppendRowMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("spreadsheetId")!.type).toBe("combobox");
  expect(byName.get("spreadsheetId")!.optionsSource).toBe(
    "google-sheets:spreadsheets",
  );
  expect(byName.get("sheetName")!.optionsSource).toBe("google-sheets:sheets");
  // Real columns, not positional chips.
  expect(byName.get("values")!.type).toBe("spreadsheet-rows");
  expect(byName.get("values")!.optionsSource).toBe("google-sheets:columns");
  // The range is still required at runtime — it is what the API receives —
  // but a business user is no longer asked to write it.
  expect(byName.get("range")!.advanced).toBe(true);
  expect(byName.get("range")!.required).toBe(true);

  // Q11 — valueInputOption is required with NO defaultValue.
  const vio = byName.get("valueInputOption")!;
  expect(vio.type).toBe("select");
  expect(vio.required).toBe(true);
  expect(vio.defaultValue).toBeUndefined();
  expect(vio.options!.map((o) => o.value).sort()).toEqual([
    "RAW",
    "USER_ENTERED",
  ]);

  // insertDataOption mirrors schema's .default("INSERT_ROWS").
  const ido = byName.get("insertDataOption")!;
  expect(ido.type).toBe("select");
  expect(ido.required).toBe(true);
  expect(ido.defaultValue).toBe("INSERT_ROWS");

  // Medium risk with documented description.
  expect(googleSheetsAppendRowMeta.riskLevel).toBe("medium");
  expect(googleSheetsAppendRowMeta.riskDescription).toBeDefined();
  expect(googleSheetsAppendRowMeta.riskDescription!.length).toBeGreaterThan(0);
});

it("a user picks a spreadsheet and a tab, fills the sheet's real columns by name, and the saved row is still a positional array", async () => {
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

  // 2. Drill into Google Sheets → Append Row.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse google sheets actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Append Row")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Append Row"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.type).toBe("append_row");

  // 3. Open config. The normal path offers pickers — not notation.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^spreadsheet$/i }),
    ).toBeInTheDocument();
  });
  // The tab picker exists but waits for its parent — it says which choice
  // comes first instead of offering an empty list.
  expect(screen.getByTestId("combobox-parent-missing")).toHaveTextContent(
    /select spreadsheet first/i,
  );
  // The raw A1 range is NOT on the setup path any more.
  expect(screen.queryByRole("textbox", { name: /^cell range$/i })).toBeNull();
  // No paste-JSON era language either.
  expect(document.body.textContent).not.toMatch(/paste json|json array/i);

  // 4. Pick the spreadsheet, then the tab.
  await pickComboboxOption(user, /^spreadsheet$/i, "Workflow activity log");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.spreadsheetId,
  ).toBe(SPREADSHEET_ID);

  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^tab$/i })).toBeInTheDocument();
  });
  await pickComboboxOption(user, /^tab$/i, TAB);
  expect(useConfigSlice.getState().drafts[action.id]!.values.sheetName).toBe(
    TAB,
  );

  // 5. Move to the column-matching step; it shows the sheet's REAL columns.
  await user.click(screen.getByTestId("guided-next-mapping"));
  for (const column of COLUMNS) {
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: new RegExp(`^${column}$`, "i") }),
      ).toBeInTheDocument();
    });
  }

  // 6. Fill two columns and deliberately leave the third blank.
  await user.type(
    screen.getByRole("textbox", { name: /^timestamp$/i }),
    "2026-07-31",
  );
  await user.type(
    screen.getByRole("textbox", { name: /^subject$/i }),
    "Invoice 4471",
  );

  // The blank middle column is preserved as "" so later cells stay aligned
  // with their sheet columns — that alignment IS the save contract.
  await waitFor(() => {
    expect(useConfigSlice.getState().drafts[action.id]!.values.values).toEqual([
      "2026-07-31",
      "",
      "Invoice 4471",
    ]);
  });

  // 7. Explicit write behavior (Q11 — nothing was pre-chosen).
  await user.click(screen.getByTestId("guided-next-write"));
  await user.click(
    await screen.findByRole("radio", { name: /like something you typed in/i }),
  );
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.valueInputOption,
  ).toBe("USER_ENTERED");

  // 8. The cell range was DERIVED from the tab — the user never wrote it.
  await waitFor(() => {
    expect(useConfigSlice.getState().drafts[action.id]!.values.range).toBe(
      "'Email log'!A:Z",
    );
  });

  // …and the power case still works: Advanced holds the real field, and a
  // value typed there is what gets saved.
  await user.click(screen.getByRole("tab", { name: /advanced/i }));
  const rangeInput = await screen.findByRole("textbox", {
    name: /^cell range$/i,
  });
  await user.clear(rangeInput);
  await user.type(rangeInput, "'Email log'!A:C");
  await user.click(screen.getByRole("tab", { name: /setup/i }));

  // 9. Modal Save flushes the draft locally.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(pendingConfig.sheetName).toBe(TAB);
  expect(pendingConfig.range).toBe("'Email log'!A:C");
  // CRITICAL: still the REAL positional array the runtime schema expects.
  expect(pendingConfig.values).toEqual(["2026-07-31", "", "Invoice 4471"]);
  expect(pendingConfig.valueInputOption).toBe("USER_ENTERED");

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 10. Toolbar Save persists once.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; config: Record<string, unknown> }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.config.values).toEqual([
    "2026-07-31",
    "",
    "Invoice 4471",
  ]);
  expect(persistedAction.config.sheetName).toBe(TAB);
}, 30000);

it("never asks the provider for columns before a tab is chosen", async () => {
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
    screen.getByRole("button", { name: /browse google sheets actions/i }),
  );
  await waitFor(() =>
    expect(screen.getByText("Append Row")).toBeInTheDocument(),
  );
  await user.click(screen.getByText("Append Row"));

  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^spreadsheet$/i }),
    ).toBeInTheDocument();
  });

  // With no tab chosen, the editor says which choice is missing rather than
  // rendering an empty column list that would read as "this sheet has none".
  await user.click(screen.getByTestId("guided-next-mapping"));
  expect(
    screen.getByTestId("spreadsheet-rows-values-parent-missing"),
  ).toBeInTheDocument();
  // A request with an incomplete dependency set would 400 at the route and
  // teach the user nothing, so it must never be made.
  expect(
    mockFetchOptionsSource.mock.calls.filter(
      ([source]) => source === "google-sheets:columns",
    ),
  ).toHaveLength(0);
}, 30000);

it("drops a stale tab when the spreadsheet changes", async () => {
  // A tab name from the previous file may not exist in the new one; leaving
  // it selected would address a tab that is not there.
  const user = userEvent.setup();
  const configured = {
    ...baseWorkflow,
    draftDefinition: {
      nodes: [
        {
          id: "n-sheets",
          kind: "action",
          provider: "google-sheets",
          type: "append_row",
          config: {
            spreadsheetId: SPREADSHEET_ID,
            sheetName: TAB,
            range: "'Email log'!A:Z",
            values: ["x"],
            valueInputOption: "RAW",
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    },
  } as WorkflowDetail;

  render(
    <WorkflowBuilder
      workflow={configured}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^spreadsheet$/i }),
    ).toBeInTheDocument();
  });

  await pickComboboxOption(user, /^spreadsheet$/i, "Workflow activity log");

  await waitFor(() => {
    expect(
      useConfigSlice.getState().drafts["n-sheets"]!.values.sheetName,
    ).toBeUndefined();
  });
}, 30000);
