/**
 * Slice 3.GSHEETS-3 integration test — Google Sheets `append_row` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Pins the first paste-JSON write path through the live builder for
 * Google Sheets. Covers:
 *   - spreadsheetId combobox sourced from `google-sheets:spreadsheets`,
 *   - range text (A1 notation),
 *   - values textarea — paste-JSON stored verbatim, NO UI-side parsing,
 *   - valueInputOption required select with Q11 NO-default semantics
 *     (author picks RAW vs USER_ENTERED explicitly),
 *   - insertDataOption select pre-filled with the schema's
 *     `INSERT_ROWS` default.
 *
 * **Schema-vs-plan deviation:** the append_row schema does NOT accept a
 * separate `sheetName` — the A1 range is the authoritative target spec
 * (Sheets parses the sheet name out of `Sheet1!A:Z`). The slice plan
 * memo asked for a sheet combobox here; the live schema doesn't take
 * one and the slice rule is "use exact runtime field names, do not
 * infer from plan memory if live schema differs." Sheet-cascade
 * behavior is exercised by the GSHEETS-2 cascade test + the
 * `get_cell_value` / `find_row` / `update_cell` meta surface tests.
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
const RANGE = "Sheet1!A:Z";
const VALUES_JSON = '["alice@example.com","Premium",42,true]';

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

it("Google Sheets append_row meta exposes spreadsheetId / range / values / valueInputOption / insertDataOption — Slice 3.GSHEETS-3 meta guard", () => {
  const names = googleSheetsAppendRowMeta.fields.map((f) => f.name);
  expect(names).toEqual([
    "spreadsheetId",
    "range",
    "values",
    "valueInputOption",
    "insertDataOption",
  ]);
  expect(names).not.toContain("sheetName");

  const byName = new Map(googleSheetsAppendRowMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("spreadsheetId")!.type).toBe("combobox");
  expect(byName.get("spreadsheetId")!.optionsSource).toBe(
    "google-sheets:spreadsheets",
  );
  expect(byName.get("range")!.type).toBe("text");
  expect(byName.get("values")!.type).toBe("textarea");

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

it("end-to-end: pick spreadsheet → type range → paste values JSON → pick valueInputOption → Modal Save (draft only) → Toolbar Save (updateWorkflow once; values persisted as literal JSON string)", async () => {
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
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
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
  expect(action.provider).toBe("google-sheets");
  expect(action.type).toBe("append_row");

  // 3. Open config rail. Expected controls: spreadsheet combobox +
  //    range text + values textarea + 2 selects.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^spreadsheet$/i }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^range$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^values$/i })).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: /^value input option$/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: /^insert data option$/i }),
  ).toBeInTheDocument();
  // No sheet picker — schema uses `range` only.
  expect(screen.queryByRole("combobox", { name: /^sheet$/i })).toBeNull();

  // 4. Pick the spreadsheet.
  await pickComboboxOption(user, /^spreadsheet$/i, "Q4 Forecast");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.spreadsheetId,
  ).toBe(SPREADSHEET_ID);

  // 5. Type the A1 range.
  await user.type(screen.getByRole("textbox", { name: /^range$/i }), RANGE);
  expect(useConfigSlice.getState().drafts[action.id]!.values.range).toBe(RANGE);

  // 6. Paste values JSON. The textarea stores the literal string — no
  //    UI-side JSON parsing.
  await user.click(screen.getByRole("textbox", { name: /^values$/i }));
  await user.paste(VALUES_JSON);
  expect(useConfigSlice.getState().drafts[action.id]!.values.values).toBe(
    VALUES_JSON,
  );

  // 7. Pick valueInputOption (Q11 — no default; author MUST choose).
  await selectFieldOption(user, /^value input option$/i, "USER_ENTERED");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.valueInputOption,
  ).toBe("USER_ENTERED");

  // 8. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(pendingConfig.range).toBe(RANGE);
  // CRITICAL: persisted as literal JSON STRING — runtime parses it.
  expect(pendingConfig.values).toBe(VALUES_JSON);
  expect(typeof pendingConfig.values).toBe("string");
  expect(pendingConfig.valueInputOption).toBe("USER_ENTERED");

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
  expect(persistedAction.provider).toBe("google-sheets");
  expect(persistedAction.type).toBe("append_row");
  expect(persistedAction.config.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(persistedAction.config.range).toBe(RANGE);
  expect(persistedAction.config.values).toBe(VALUES_JSON);
  expect(typeof persistedAction.config.values).toBe("string");
  expect(persistedAction.config.valueInputOption).toBe("USER_ENTERED");

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
