/**
 * Microsoft Excel `add_table_row` guided configuration
 * (EXCEL-GUIDED-CONFIG-2).
 *
 * Before this slice the action asked for a blind list of cell values "in
 * the table's column order" — the user had to know that order by heart.
 * An Excel table publishes its own columns, which is a stronger source of
 * truth than the row-1 heuristic a worksheet needs, and the resolver for
 * it (`microsoft-excel:table_columns`) already existed but had never been
 * wired to this field.
 *
 * The load-bearing risk this suite guards is compatibility. The action
 * schema accepts TWO `values` shapes and the handler treats them
 * differently — a positional array is written verbatim, a column-keyed
 * record is aligned by name. So the editor must give back whichever one
 * it was handed, and must never quietly convert between them.
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
import { microsoftExcelAddTableRowMeta } from "@/integrations/microsoft-excel/actions/addTableRow.meta";
import { AddTableRowConfigSchema } from "@/integrations/microsoft-excel/actions/addTableRow.schema";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail, WorkflowNode } from "@/contracts/workflow";
import { openLastNodeOfKind } from "../helpers/openLastNodeOfKind";
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

const WORKBOOK_ID = "wb-1";
const TABLE = "Orders";
const COLUMNS = ["Name", "Email", "Notes"];

function workflowWith(nodes: readonly WorkflowNode[]): WorkflowDetail {
  return {
    id: "wf-1",
    name: "Test",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: { nodes: [...nodes], edges: [] },
    deletedAt: null,
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
  };
}

const emptyWorkflow = workflowWith([]);
const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [
  { id: "microsoft-excel", displayName: "Microsoft Excel" },
];

function optionsFor(source: string, deps: Record<string, string> | undefined) {
  if (source === "microsoft-excel:workbooks") {
    return {
      ok: true as const,
      source,
      items: [
        { value: WORKBOOK_ID, label: "Sales.xlsx" },
        { value: "wb-2", label: "Ops.xlsx" },
      ],
      hasMore: false,
    };
  }
  if (source === "microsoft-excel:tables") {
    if (!deps?.workbookId) {
      return {
        ok: false as const,
        source,
        code: "MISSING_DEPENDENCY",
        message: "Select a workbook first.",
      };
    }
    return {
      ok: true as const,
      source,
      items: [
        { value: TABLE, label: TABLE },
        { value: "Returns", label: "Returns" },
      ],
      hasMore: false,
    };
  }
  if (source === "microsoft-excel:table_columns") {
    if (!deps?.workbookId || !deps?.tableName) {
      return {
        ok: false as const,
        source,
        code: "MISSING_DEPENDENCY",
        message: "Select a table first.",
      };
    }
    return {
      ok: true as const,
      source,
      items: COLUMNS.map((name) => ({ value: name, label: name })),
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
    p === "microsoft-excel" ? [microsoftExcelAddTableRowMeta] : [],
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

async function addTableRowAndOpen(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual")).toBeInTheDocument());
  await user.click(screen.getByText("Manual"));
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse microsoft excel actions/i }),
  );
  await waitFor(() =>
    expect(screen.getByText("Add Table Row")).toBeInTheDocument(),
  );
  await user.click(screen.getByText("Add Table Row"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  await openLastNodeOfKind("action");
  await waitFor(() =>
    expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
  );
  return action;
}

it("add_table_row metadata reads the table's own columns instead of asking for blind cells", () => {
  const byName = new Map(
    microsoftExcelAddTableRowMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("workbookId")!.optionsSource).toBe(
    "microsoft-excel:workbooks",
  );
  expect(byName.get("tableName")!.optionsSource).toBe("microsoft-excel:tables");
  expect(byName.get("tableName")!.dependsOn).toBe("workbookId");

  const values = byName.get("values")!;
  expect(values.type).toBe("spreadsheet-rows");
  expect(values.optionsSource).toBe("microsoft-excel:table_columns");
  expect(values.dependsOn).toEqual(["workbookId", "tableName"]);
  // A table row is a single row — the action has no batch branch to offer.
  expect(values.batchRowsField).toBeUndefined();
  // No Google Sheets write settings were smuggled in.
  const names = microsoftExcelAddTableRowMeta.fields.map((f) => f.name);
  expect(names).not.toContain("valueInputOption");
  expect(names).not.toContain("insertDataOption");
});

describe("configuring a new table row", () => {
  it("asks for the workbook and table, then fills the table's real columns by name", async () => {
    mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
      ...emptyWorkflow,
      draftDefinition: body.draftDefinition,
    }));
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const action = await addTableRowAndOpen(user);

    await pickComboboxOption(user, /^workbook$/i, "Sales.xlsx");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^table$/i })).toBeInTheDocument(),
    );
    await pickComboboxOption(user, /^table$/i, TABLE);

    // The columns resolver is asked with BOTH dependencies.
    await waitFor(() => {
      expect(mockFetchOptionsSource).toHaveBeenCalledWith(
        "microsoft-excel:table_columns",
        expect.objectContaining({
          deps: { workbookId: WORKBOOK_ID, tableName: TABLE },
        }),
      );
    });

    await user.click(screen.getByTestId("guided-next-mapping"));
    for (const column of COLUMNS) {
      await waitFor(() => {
        expect(
          screen.getByRole("textbox", { name: new RegExp(`^${column}$`, "i") }),
        ).toBeInTheDocument();
      });
    }

    await user.type(screen.getByRole("textbox", { name: /^name$/i }), "Ada");
    await user.type(
      screen.getByRole("textbox", { name: /^notes$/i }),
      "pioneer",
    );

    // A NEW configuration keeps this action's long-standing positional
    // shape — the middle blank preserved so later cells stay on their own
    // columns.
    await waitFor(() => {
      const committed = useConfigSlice.getState().drafts[action.id]!.values
        .values;
      expect(committed).toEqual(["Ada", "", "pioneer"]);
    });

    const draft = useConfigSlice.getState().drafts[action.id]!.values;
    expect(() =>
      AddTableRowConfigSchema.parse({
        workbookId: draft.workbookId,
        tableName: draft.tableName,
        values: draft.values,
      }),
    ).not.toThrow();
  }, 30000);

  it("states what Excel will do instead of inventing write options", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await addTableRowAndOpen(user);

    await user.click(screen.getByTestId("guided-step-write-header"));
    const step = screen.getByTestId("guided-step-write");
    expect(within(step).getByTestId("guided-write-empty")).toHaveTextContent(
      /adds the values as a new row in the selected Excel table/i,
    );
    // Excel has no RAW/USER_ENTERED or insert-mode choice, so offering one
    // would be a decision that changes nothing.
    expect(within(step).queryAllByRole("radio")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(
      /parse as|plain text|push them down|write over whatever/i,
    );
  });
});

describe("configurations saved before this slice", () => {
  const positionalNode: WorkflowNode = {
    id: "n-positional",
    kind: "action",
    provider: "microsoft-excel",
    type: "add_table_row",
    config: {
      workbookId: WORKBOOK_ID,
      tableName: TABLE,
      values: ["Ada", "", "pioneer"],
    },
    position: { x: 0, y: 0 },
  } as WorkflowNode;

  const keyedNode: WorkflowNode = {
    id: "n-keyed",
    kind: "action",
    provider: "microsoft-excel",
    type: "add_table_row",
    // The schema's OTHER valid branch — reachable from templates, the API
    // and AI-authored configs even though the old UI only wrote arrays.
    config: {
      workbookId: WORKBOOK_ID,
      tableName: TABLE,
      values: { Name: "Ada", Notes: "pioneer" },
    },
    position: { x: 0, y: 0 },
  } as WorkflowNode;

  it.each([
    ["a positional array", positionalNode],
    ["a column-keyed record", keyedNode],
  ])("opens %s without rewriting a single value", async (_label, node) => {
    render(
      <WorkflowBuilder
        workflow={workflowWith([node])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");
    await waitFor(() =>
      expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
    );
    // Let the columns resolve so any conversion would have happened.
    await waitFor(() => {
      expect(mockFetchOptionsSource).toHaveBeenCalledWith(
        "microsoft-excel:table_columns",
        expect.anything(),
      );
    });

    const stored = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === node.id)!;
    expect(stored.config).toEqual(node.config);
    expect(useConfigSlice.getState().drafts[node.id]?.isDirty ?? false).toBe(
      false,
    );
  });

  it("shows a saved column-keyed row against its own column names", async () => {
    render(
      <WorkflowBuilder
        workflow={workflowWith([keyedNode])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");
    await waitFor(() =>
      expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
    );

    // Name and Notes carry the saved values; Email is genuinely absent, not
    // a shifted-along value.
    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveValue("Ada");
    });
    expect(screen.getByLabelText("Notes")).toHaveValue("pioneer");
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("keeps a column-keyed row KEYED when the user edits it", async () => {
    // Converting it to positional would hand the handler a shape it aligns
    // by position rather than by name — a different destination column.
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={workflowWith([keyedNode])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Ada"),
    );

    await user.type(
      screen.getByLabelText("Email"),
      "ada@example.test",
    );

    await waitFor(() => {
      expect(useConfigSlice.getState().drafts["n-keyed"]!.values.values).toEqual(
        {
          Name: "Ada",
          Email: "ada@example.test",
          Notes: "pioneer",
        },
      );
    });
    const draft = useConfigSlice.getState().drafts["n-keyed"]!.values;
    expect(() =>
      AddTableRowConfigSchema.parse({
        workbookId: draft.workbookId,
        tableName: draft.tableName,
        values: draft.values,
      }),
    ).not.toThrow();
  }, 30000);

  it("refuses to render a keyed row as blanks while its columns are unavailable", async () => {
    // Blank inputs over real saved data are a trap: the next keystroke
    // would commit over values the user cannot see.
    mockFetchOptionsSource.mockImplementation(
      async (source: string, args?: { deps?: Record<string, string> }) => {
        if (source === "microsoft-excel:table_columns") {
          return {
            ok: false as const,
            source,
            code: "PROVIDER_ERROR",
            message: "Couldn't read the table's columns. Try again.",
          };
        }
        return optionsFor(source, args?.deps);
      },
    );

    render(
      <WorkflowBuilder
        workflow={workflowWith([keyedNode])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");

    const notice = await screen.findByTestId(
      "spreadsheet-rows-values-record-needs-columns",
    );
    expect(notice).toHaveTextContent(/your saved values are untouched/i);
    expect(screen.queryByLabelText("Name")).toBeNull();

    const stored = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === "n-keyed")!;
    expect(stored.config.values).toEqual({ Name: "Ada", Notes: "pioneer" });
  });
});

describe("when the provider will not answer", () => {
  const configured: WorkflowNode = {
    id: "n-configured",
    kind: "action",
    provider: "microsoft-excel",
    type: "add_table_row",
    config: {
      workbookId: WORKBOOK_ID,
      tableName: TABLE,
      values: ["kept-value", "", "also-kept"],
    },
    position: { x: 0, y: 0 },
  } as WorkflowNode;

  it("distinguishes a provider failure from a table that genuinely has no columns", async () => {
    mockFetchOptionsSource.mockImplementation(
      async (source: string, args?: { deps?: Record<string, string> }) => {
        if (source === "microsoft-excel:table_columns") {
          return {
            ok: false as const,
            source,
            code: "PROVIDER_ERROR",
            message: "Couldn't read the table's columns. Try again.",
          };
        }
        return optionsFor(source, args?.deps);
      },
    );

    render(
      <WorkflowBuilder
        workflow={workflowWith([configured])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");

    const problem = await screen.findByTestId(
      "spreadsheet-rows-values-columns-error",
    );
    expect(problem).toHaveTextContent(/couldn.t read|try again/i);
    // An empty column list would read as "this table has no columns".
    expect(
      screen.queryByTestId("spreadsheet-rows-values-no-columns"),
    ).toBeNull();
  });

  it("surfaces a revoked connection with a reconnect route, not a blank list", async () => {
    mockFetchOptionsSource.mockImplementation(
      async (source: string, args?: { deps?: Record<string, string> }) => {
        if (source === "microsoft-excel:table_columns") {
          return {
            ok: false as const,
            source,
            code: "INTEGRATION_DISCONNECTED",
            message: "Reconnect Microsoft Excel and try again.",
          };
        }
        return optionsFor(source, args?.deps);
      },
    );

    render(
      <WorkflowBuilder
        workflow={workflowWith([configured])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");

    const problem = await screen.findByTestId(
      "spreadsheet-rows-values-columns-error",
    );
    expect(problem).toHaveTextContent(/reconnect/i);
  });

  it("does not erase the mappings the user already saved", async () => {
    mockFetchOptionsSource.mockImplementation(
      async (source: string, args?: { deps?: Record<string, string> }) => {
        if (source === "microsoft-excel:table_columns") {
          return {
            ok: false as const,
            source,
            code: "PROVIDER_ERROR",
            message: "Couldn't read the table's columns. Try again.",
          };
        }
        return optionsFor(source, args?.deps);
      },
    );

    render(
      <WorkflowBuilder
        workflow={workflowWith([configured])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");
    await screen.findByTestId("spreadsheet-rows-values-columns-error");

    const stored = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === "n-configured")!;
    expect(stored.config.values).toEqual(["kept-value", "", "also-kept"]);
  });

  it("clears a stale table when the workbook changes", async () => {
    // A table name from the previous workbook may not exist in the new one.
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={workflowWith([configured])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: /^workbook$/i }),
      ).toBeInTheDocument(),
    );

    await pickComboboxOption(user, /^workbook$/i, "Ops.xlsx");

    await waitFor(() => {
      expect(
        useConfigSlice.getState().drafts["n-configured"]!.values.tableName,
      ).toBeUndefined();
    });
  }, 30000);
});
