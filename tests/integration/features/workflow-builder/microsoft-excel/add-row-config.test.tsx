/**
 * SPREADSHEET-CONFIG-REDESIGN-1 integration test — Microsoft Excel
 * `add_row` config end-to-end through the live WorkflowBuilder shell
 * (supersedes the CONFIG-UX-AUDIT-1 pin of the chip/pair editors).
 *
 * Pins the redesigned spreadsheet config experience:
 *   - readiness banner at the top of Setup: "2 things left to fill in"
 *     → "One thing left to fill in" (destination picked) → "Ready to
 *     run" (at least one row value),
 *   - workbook combobox → worksheet combobox (dependsOn cascade),
 *   - the `spreadsheet-rows` editor renders ONE INPUT PER REAL COLUMN
 *     (from the worksheet_columns resolver response) with a One row /
 *     Several rows toggle and a row preview — NO standalone `rows`
 *     editor, NO JSON language anywhere in the setup panel,
 *   - Modal Save + Toolbar Save persist the UNCHANGED runtime shapes:
 *     positional string[] (`values`) XOR header-keyed records (`rows`),
 *     exactly one present, accepted by AddRowConfigSchema.
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

// CONNECTION-AWARE-READINESS-1 — the banner now folds in the server-resolved
// connection state; this suite pins the CONNECTED path (Excel is usable), so
// the spreadsheet readiness walk below stays about fields.
const mockGetConnectionReadiness = jest.fn();
jest.mock("@/lib/api/workflowConnectionReadiness", () => ({
  __esModule: true,
  getWorkflowConnectionReadiness: (...args: unknown[]) =>
    mockGetConnectionReadiness(...args),
}));

import { openLastNodeOfKind } from "../helpers/openLastNodeOfKind";
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
import { pickComboboxOption } from "../helpers/comboboxField";

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
    if (source === "microsoft-excel:worksheet_columns") {
      // Shaped exactly like the worksheet_columns resolver output — the
      // sheet's REAL first-row headers, in order, with column letters.
      return {
        ok: true,
        source,
        items: [
          { value: "Name", label: "Name", description: "Column A" },
          { value: "Email", label: "Email", description: "Column B" },
        ],
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
  mockGetConnectionReadiness.mockReset();
  mockGetConnectionReadiness.mockResolvedValue({
    workflowId: "wf-1",
    access: "OK",
    allRequiredConnected: true,
    providers: [
      {
        provider: "microsoft-excel",
        name: "Microsoft Excel",
        credentialClass: "personal",
        nodeIds: [],
        nodeCount: 1,
        status: "CONNECTED",
        ready: true,
        providerEnabled: true,
        refreshable: true,
        tokenExpired: false,
        scopesSatisfied: true,
        missingScopeCount: 0,
        reconnectNeeded: false,
        canReconnect: true,
      },
    ],
  });
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("Excel add_row meta — composite spreadsheet editor wiring (values owns rows via batchRowsField/renderedBy) and no JSON/shape copy anywhere", () => {
  const byName = new Map(microsoftExcelAddRowMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("values")!.type).toBe("spreadsheet-rows");
  expect(byName.get("values")!.batchRowsField).toBe("rows");
  expect(byName.get("values")!.optionsSource).toBe(
    "microsoft-excel:worksheet_columns",
  );
  expect(byName.get("values")!.dependsOn).toEqual(["workbookId", "worksheetName"]);
  expect(byName.get("rows")!.renderedBy).toBe("values");
  expect(byName.get("rows")!.type).toBe("keyvalue-list");
  expect(byName.get("rows")!.listMaxItems).toBe(1000);
  for (const f of microsoftExcelAddRowMeta.fields) {
    for (const text of [f.label, f.description ?? "", microsoftExcelAddRowMeta.description]) {
      expect(text.toLowerCase()).not.toContain("json");
      expect(text.toLowerCase()).not.toContain("positional");
      expect(text.toLowerCase()).not.toContain("keyed");
    }
  }
});

async function buildToOpenConfig(user: ReturnType<typeof userEvent.setup>) {
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
  expect(action.provider).toBe("microsoft-excel");
  expect(action.type).toBe("add_row");

  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^workbook$/i }),
    ).toBeInTheDocument();
  });
  return action;
}

function bannerText(): string {
  return screen.getByTestId("config-readiness-banner").textContent ?? "";
}

it(
  "end-to-end one-row: readiness banner walks 2 left → 1 left → Ready to run; column inputs come from the resolver; Save persists positional values AddRowConfigSchema accepts",
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
    const action = await buildToOpenConfig(user);

    // Readiness banner: nothing picked yet (waitFor lets the mocked
    // connection check resolve past its brief "Checking connection" state).
    await waitFor(() => {
      expect(bannerText()).toContain("2 things left to fill in");
    });
    expect(bannerText()).toContain("Pick a workbook and worksheet");
    expect(bannerText()).toContain("Fill in at least one row value");
    // Connection-aware readiness: the connected app shows as a checked row.
    expect(bannerText()).toContain("Microsoft Excel is connected");

    // The rows sibling never renders a duplicate standalone editor, and
    // the row editor asks for the destination first.
    expect(screen.queryByTestId("keyvalue-list-rows")).toBeNull();
    expect(
      screen.getByTestId("spreadsheet-rows-values-parent-missing"),
    ).toBeInTheDocument();

    // Pick destination → banner drops to one thing left.
    await pickComboboxOption(user, /^workbook$/i, "Sales.xlsx");
    await pickComboboxOption(user, /^worksheet$/i, WORKSHEET);
    await waitFor(() => {
      expect(bannerText()).toContain("One thing left to fill in");
    });

    // Column inputs from the REAL resolver response render, once the user
    // advances to guided step 2 (EXCEL-GUIDED-CONFIG-2).
    await user.click(screen.getByTestId("guided-next-mapping"));
    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByText("Column B")).toBeInTheDocument();

    // Fill one column → Ready to run + preview.
    await user.type(screen.getByLabelText("Name"), "Ada");
    await waitFor(() => {
      expect(bannerText()).toContain("Ready to run");
    });
    expect(
      screen.getByTestId("spreadsheet-preview-values").textContent,
    ).toContain("Ada");

    // No JSON or implementation language anywhere in the panel.
    expect(document.body.textContent).not.toMatch(
      /paste json|json array|json object|raw json|positional|header-keyed/i,
    );

    // Modal Save → the pending config is the runtime shape.
    const modal = screen.getByRole("complementary", {
      name: /node configuration/i,
    });
    await user.click(within(modal).getByRole("button", { name: /^save$/i }));
    const pendingConfig = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === action.id)!.config;
    expect(pendingConfig.values).toEqual(["Ada"]);
    expect(pendingConfig.rows).toBeUndefined();
    expect(() => AddRowConfigSchema.parse(pendingConfig)).not.toThrow();

    // Toolbar Save persists once.
    const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
    const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
    await user.click(toolbarSave);
    await waitFor(() => {
      expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
    });
    const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
      .nodes as Array<{ kind: string; config: Record<string, unknown> }>;
    const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
    expect(persistedAction.config.values).toEqual(["Ada"]);
    expect(persistedAction.config.rows).toBeUndefined();
  },
  20_000,
);

it(
  "end-to-end several rows: toggle → row cards with column inputs → Save persists header-keyed records AddRowConfigSchema accepts (values cleared)",
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
    const action = await buildToOpenConfig(user);

    await pickComboboxOption(user, /^workbook$/i, "Sales.xlsx");
    await pickComboboxOption(user, /^worksheet$/i, WORKSHEET);

    // EXCEL-GUIDED-CONFIG-2 — the column editor lives in guided step 2, so
    // a user reaches it by advancing from the destination step.
    await user.click(screen.getByTestId("guided-next-mapping"));
    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeInTheDocument();
    });

    // Switch to several rows and build one row visually.
    await user.click(screen.getByRole("radio", { name: /several rows/i }));
    await user.click(
      screen.getByTestId("spreadsheet-batch-rows-values-add-row"),
    );
    await user.type(screen.getByLabelText("Row 1 Name"), "Ada");
    await user.type(screen.getByLabelText("Row 1 Email"), "ada@example.com");

    expect(useConfigSlice.getState().drafts[action.id]!.values.rows).toEqual([
      { Name: "Ada", Email: "ada@example.com" },
    ]);
    await waitFor(() => {
      expect(bannerText()).toContain("Ready to run");
    });

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
    expect(pendingConfig.values).toBeUndefined();
    expect(() => AddRowConfigSchema.parse(pendingConfig)).not.toThrow();
  },
  20_000,
);
