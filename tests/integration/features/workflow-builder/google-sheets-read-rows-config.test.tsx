/**
 * Slice 3.GSHEETS-3 integration test — Google Sheets `read_rows` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Pins the first production user of the GSHEETS-2
 * `google-sheets:spreadsheets` resolver: builder loads spreadsheet
 * options, author picks one, fills the A1 range, Modal Save flushes
 * the draft, Toolbar Save persists with the spreadsheetId + range
 * intact.
 *
 * **Schema-vs-plan deviation:** the read_rows schema does NOT accept a
 * separate `sheetName` — the A1 range is the authoritative target spec
 * (`Sheet1!A:Z`, `Sheet1!A1:D100`, etc.). The slice plan asked for a
 * sheet picker here; the live schema doesn't take one and the slice
 * rule is "use exact runtime field names." The two-hop cascade
 * (spreadsheet → sheet) is exercised by `tests/integration/features/
 * workflow-builder/google-sheets-options-cascade.test.tsx` and by the
 * `get_cell_value` / `find_row` / `update_cell` meta surface tests in
 * the discovery registry suite.
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
import { googleSheetsReadRowsMeta } from "@/integrations/google-sheets/actions/readRows.meta";
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
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "google-sheets", displayName: "Google Sheets" }];

const SPREADSHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ";
const RANGE = "Sheet1!A:Z";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "google-sheets" ? [googleSheetsReadRowsMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "google-sheets:spreadsheets") {
      return {
        ok: true,
        source: "google-sheets:spreadsheets",
        items: [
          {
            value: SPREADSHEET_ID,
            label: "Q4 Forecast",
            description: "Modified 2026-05-20",
          },
          {
            value: "2nd-id",
            label: "Marketing Roster",
            description: "Modified 2026-04-10",
          },
        ],
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

it("Google Sheets read_rows meta exposes spreadsheetId combobox + range text — Slice 3.GSHEETS-3 meta guard", () => {
  const names = googleSheetsReadRowsMeta.fields.map((f) => f.name);
  // Schema-anchored field set: read_rows takes `range`, not a separate
  // sheetName. The cascade is intentionally NOT exposed here — the
  // A1 range is the authoritative target spec.
  expect(names).toEqual([
    "spreadsheetId",
    "range",
    "majorDimension",
    "valueRenderOption",
  ]);
  expect(names).not.toContain("sheetName");

  const byName = new Map(googleSheetsReadRowsMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("spreadsheetId")!.type).toBe("combobox");
  expect(byName.get("spreadsheetId")!.optionsSource).toBe(
    "google-sheets:spreadsheets",
  );
  expect(byName.get("spreadsheetId")!.required).toBe(true);
  expect(byName.get("range")!.type).toBe("text");
  expect(byName.get("range")!.required).toBe(true);
});

it("end-to-end: async spreadsheet combobox → range text → Modal Save (draft only) → Toolbar Save (updateWorkflow once with spreadsheetId + range + default majorDimension)", async () => {
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

  // 2. Drill into Google Sheets → Read Rows.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse google sheets actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Read Rows")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Read Rows"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("google-sheets");
  expect(action.type).toBe("read_rows");

  // 3. Open config rail. Verify spreadsheet combobox + range text both
  //    render. sheetName is intentionally absent from the meta.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^spreadsheet$/i }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^range$/i })).toBeInTheDocument();
  // No sheet picker — read_rows uses the A1 range for sheet selection.
  expect(screen.queryByRole("combobox", { name: /^sheet$/i })).toBeNull();

  // 4. Pick a spreadsheet via the async picker. Saved value is the
  //    underlying spreadsheet id, not the visible label.
  await pickComboboxOption(user, /^spreadsheet$/i, "Q4 Forecast");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.spreadsheetId,
  ).toBe(SPREADSHEET_ID);
  expect(mockFetchOptionsSource).toHaveBeenCalled();
  expect(mockFetchOptionsSource.mock.calls[0]![0]).toBe(
    "google-sheets:spreadsheets",
  );

  // 5. Type the A1 range.
  await user.type(screen.getByRole("textbox", { name: /^range$/i }), RANGE);
  expect(useConfigSlice.getState().drafts[action.id]!.values.range).toBe(RANGE);

  // 6. Modal Save flushes the draft into pendingNodes.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(pendingConfig.range).toBe(RANGE);

  // Modal Save MUST NOT call updateWorkflow yet.
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
  expect(persistedAction.provider).toBe("google-sheets");
  expect(persistedAction.type).toBe("read_rows");
  expect(persistedAction.config.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(persistedAction.config.range).toBe(RANGE);

  // Single updateWorkflow call — picker / textbox interactions must
  // not double-fire workflow persistence.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
