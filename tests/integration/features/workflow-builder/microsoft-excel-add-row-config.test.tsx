/**
 * CONFIG-UX-AUDIT-1 integration test — Microsoft Excel `add_row` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Pins the visual row editor that replaced the two paste-JSON textareas
 * ("Values — single row (paste JSON)" / "Rows — batch (paste JSON)"):
 *   - workbook combobox (microsoft-excel:workbooks) → worksheet combobox
 *     (dependsOn workbook),
 *   - `values` renders as the string-array chip editor (one chip per
 *     cell, in column order),
 *   - `rows` renders as the keyvalue-list row builder (Add row / Remove
 *     row, column/value pairs) — NO JSON anywhere in the setup panel,
 *   - Modal Save + Toolbar Save persist a REAL string[] / real
 *     Array<Record<string, string>> — the shapes AddRowConfigSchema
 *     (`z.array`) actually accepts. The paste-JSON era stored literal
 *     strings the schema rejected at run time.
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
import { microsoftExcelAddRowMeta } from "@/integrations/microsoft-excel/actions/addRow.meta";
import { AddRowConfigSchema } from "@/integrations/microsoft-excel/actions/addRow.schema";
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
  createdAt: "2026-07-06T00:00:00Z",
  updatedAt: "2026-07-06T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [
  { id: "microsoft-excel", displayName: "Microsoft Excel" },
];

const WORKBOOK_ID = "01ABCDEF12345";
const WORKSHEET = "Sheet1";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "microsoft-excel" ? [microsoftExcelAddRowMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "microsoft-excel:workbooks") {
      return {
        ok: true,
        source,
        items: [{ value: WORKBOOK_ID, label: "Sales.xlsx" }],
        hasMore: false,
      };
    }
    if (source === "microsoft-excel:worksheets") {
      return {
        ok: true,
        source,
        items: [{ value: WORKSHEET, label: WORKSHEET }],
        hasMore: false,
      };
    }
    return {
      ok: false,
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown source '${source}' (test mock).`,
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

it("Excel add_row meta — values is a string-array chip editor, rows is a keyvalue-list row builder, and no field copy mentions JSON — CONFIG-UX-AUDIT-1 meta guard", () => {
  const byName = new Map(microsoftExcelAddRowMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("values")!.type).toBe("string-array");
  expect(byName.get("rows")!.type).toBe("keyvalue-list");
  expect(byName.get("rows")!.listMaxItems).toBe(1000);
  for (const f of microsoftExcelAddRowMeta.fields) {
    expect(f.label.toLowerCase()).not.toContain("json");
    expect((f.description ?? "").toLowerCase()).not.toContain("json");
  }
});

it(
  "end-to-end: pick workbook + worksheet → build a batch row visually (Add row, column/value pairs) → Modal Save → Toolbar Save persists a REAL Array<Record> that AddRowConfigSchema accepts",
  async () => {
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

    // 2. Drill into Microsoft Excel → Add Row.
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await user.click(
      screen.getByRole("button", { name: /browse microsoft excel actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Add Row")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Row"));
    const action = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.kind === "action")!;
    expect(action.provider).toBe("microsoft-excel");
    expect(action.type).toBe("add_row");

    // 3. Open config rail — the visual editors render; NO paste-JSON
    //    affordance or JSON language anywhere in the setup panel.
    await openLastNodeOfKind("action");
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: /^workbook$/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("keyvalue-list-rows")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /^row values/i }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/paste json|json array|json object/i);

    // 4. Pick workbook, then worksheet (dependsOn cascade).
    await pickComboboxOption(user, /^workbook$/i, "Sales.xlsx");
    expect(
      useConfigSlice.getState().drafts[action.id]!.values.workbookId,
    ).toBe(WORKBOOK_ID);
    await pickComboboxOption(user, /^worksheet$/i, WORKSHEET);
    expect(
      useConfigSlice.getState().drafts[action.id]!.values.worksheetName,
    ).toBe(WORKSHEET);

    // 5. Build one batch row visually: Add row → column name + value.
    await user.click(screen.getByTestId("keyvalue-list-rows-add-row"));
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 name/i }),
      "Name",
    );
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 value/i }),
      "Ada",
    );
    await user.click(screen.getByRole("button", { name: /add column to row 1/i }));
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 2 name/i }),
      "Email",
    );
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 2 value/i }),
      "ada@example.com",
    );
    expect(useConfigSlice.getState().drafts[action.id]!.values.rows).toEqual([
      { Name: "Ada", Email: "ada@example.com" },
    ]);

    // 6. Modal Save flushes the draft.
    const modal = screen.getByRole("complementary", {
      name: /node configuration/i,
    });
    await user.click(within(modal).getByRole("button", { name: /^save$/i }));
    const pendingConfig = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === action.id)!.config;
    expect(pendingConfig.rows).toEqual([
      { Name: "Ada", Email: "ada@example.com" },
    ]);
    // `values` untouched → absent, so the schema's XOR refine passes.
    expect(pendingConfig.values).toBeUndefined();

    // The persisted config is EXACTLY what the runtime schema accepts —
    // this is the correctness half of the fix (paste-JSON strings were
    // rejected by z.array at execution time).
    expect(() => AddRowConfigSchema.parse(pendingConfig)).not.toThrow();

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
      config: Record<string, unknown>;
    }>;
    const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
    expect(persistedAction.config.rows).toEqual([
      { Name: "Ada", Email: "ada@example.com" },
    ]);
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  },
  15_000,
);

it(
  "single-row mode: add Row values chips → saved config is a REAL string[] that AddRowConfigSchema accepts",
  async () => {
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

    await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
    await waitFor(() => {
      expect(screen.getByText("Manual")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Manual"));
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await user.click(
      screen.getByRole("button", { name: /browse microsoft excel actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Add Row")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Row"));
    const action = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.kind === "action")!;

    await openLastNodeOfKind("action");
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: /^workbook$/i }),
      ).toBeInTheDocument();
    });
    await pickComboboxOption(user, /^workbook$/i, "Sales.xlsx");
    await pickComboboxOption(user, /^worksheet$/i, WORKSHEET);

    const valuesInput = screen.getByRole("textbox", { name: /^row values/i });
    for (const cell of ["Ada", "ada@example.com"]) {
      await user.type(valuesInput, cell);
      await user.keyboard("{Enter}");
    }
    expect(useConfigSlice.getState().drafts[action.id]!.values.values).toEqual([
      "Ada",
      "ada@example.com",
    ]);

    const modal = screen.getByRole("complementary", {
      name: /node configuration/i,
    });
    await user.click(within(modal).getByRole("button", { name: /^save$/i }));
    const pendingConfig = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === action.id)!.config;
    expect(pendingConfig.values).toEqual(["Ada", "ada@example.com"]);
    expect(pendingConfig.rows).toBeUndefined();
    expect(() => AddRowConfigSchema.parse(pendingConfig)).not.toThrow();
  },
  15_000,
);
