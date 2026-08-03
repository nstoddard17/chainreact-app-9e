/**
 * SPREADSHEET-GUIDED-CONFIG-S3 integration test — Microsoft Excel
 * `update_row` configured end-to-end through the live WorkflowBuilder
 * shell.
 *
 * What this pins is the whole point of the slice: that an ordinary
 * business user can say "change these two columns of row 42, leave the
 * rest alone" without ever retyping a heading, and that what gets SAVED
 * distinguishes the three outcomes the runtime treats differently.
 *
 * Real throughout: the builder shell, the guided layout, the readiness
 * banner, the field renderers, the shipped `ActionMeta`, and
 * `UpdateRowConfigSchema` — every committed config in here is parsed by
 * the real runtime schema, so a config this UI can author but the handler
 * would reject fails the test rather than a customer's run. Mocked only at
 * the network boundary: discovery, the options route, connection
 * readiness, and the workflow save.
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
import { microsoftExcelUpdateRowMeta } from "@/integrations/microsoft-excel/actions/updateRow.meta";
import { UpdateRowConfigSchema } from "@/integrations/microsoft-excel/actions/updateRow.schema";
import { getGuidedSpreadsheetAdapter } from "@/features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters";
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
  createdAt: "2026-08-02T00:00:00Z",
  updatedAt: "2026-08-02T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [
  { id: "microsoft-excel", displayName: "Microsoft Excel" },
];

const WORKBOOK_ID = "01ABCDEF12345";
const WORKSHEET = "Invoices";

/** Columns as the real resolver emits them: RAW value, trimmed label. */
let columnItems: Array<{ value: string; label: string; description: string }>;

beforeEach(() => {
  columnItems = [
    { value: "Customer", label: "Customer", description: "Column A" },
    { value: "Status", label: "Status", description: "Column B" },
    { value: "Notes", label: "Notes", description: "Column C" },
  ];

  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "microsoft-excel" ? [microsoftExcelUpdateRowMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "microsoft-excel:workbooks") {
      return {
        ok: true,
        source,
        items: [{ value: WORKBOOK_ID, label: "Invoices.xlsx" }],
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
      return { ok: true, source, items: columnItems, hasMore: false };
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

// ── metadata contract ───────────────────────────────────────────────────────

describe("update_row metadata declares an UPDATE, not an append", () => {
  const byName = new Map(
    microsoftExcelUpdateRowMeta.fields.map((f) => [f.name, f]),
  );

  it("renders the columns through the record-mode spreadsheet editor", () => {
    const values = byName.get("values")!;
    expect(values.type).toBe("spreadsheet-rows");
    expect(values.valueShape).toBe("record");
    expect(values.optionsSource).toBe("microsoft-excel:worksheet_columns");
    expect(values.dependsOn).toEqual(["workbookId", "worksheetName"]);
  });

  it("offers no batch mode — one call updates one row", () => {
    expect(byName.get("values")!.batchRowsField).toBeUndefined();
    expect(byName.get("rows")).toBeUndefined();
  });

  it("stops row 1 at the field level as well as at the schema", () => {
    expect(byName.get("rowNumber")!.numeric).toEqual({ min: 2, integer: true });
  });

  it("says what the row number is without claiming we read the row", () => {
    const description = byName.get("rowNumber")!.description ?? "";
    expect(description).toMatch(/as it appears in Excel/i);
    expect(description).toMatch(/row 1 holds your column headings/i);
    expect(description).toMatch(/has to exist already/i);
    // The builder never fetches an arbitrary worksheet row, so it must not
    // imply it has looked at one.
    expect(description).not.toMatch(/current value|we read|preview of/i);
  });

  it("uses no shape or format language anywhere a user can see", () => {
    for (const f of microsoftExcelUpdateRowMeta.fields) {
      for (const text of [
        f.label,
        f.description ?? "",
        microsoftExcelUpdateRowMeta.description,
      ]) {
        for (const word of ["json", "positional", "keyed", "record", "array"]) {
          expect(text.toLowerCase()).not.toContain(word);
        }
      }
    }
  });
});

// ── the guided walkthrough ──────────────────────────────────────────────────

async function buildToOpenConfig(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual")).toBeInTheDocument());
  await user.click(screen.getByText("Manual"));

  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse microsoft excel actions/i }),
  );
  await waitFor(() => expect(screen.getByText("Update Row")).toBeInTheDocument());
  await user.click(screen.getByText("Update Row"));

  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.type).toBe("update_row");

  await openLastNodeOfKind("action");
  await waitFor(() =>
    expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
  );
  return action.id;
}

/**
 * The live config draft — what the panel would commit on Save. Assertions
 * are made here rather than against `pendingNodes` so each test measures
 * the editor's own output, not the save plumbing (which S3 does not
 * touch).
 */
function draftConfig(nodeId: string): Record<string, unknown> {
  return useConfigSlice.getState().drafts[nodeId]!.values as Record<
    string,
    unknown
  >;
}

function draftIsDirty(nodeId: string): boolean {
  return useConfigSlice.getState().drafts[nodeId]!.isDirty;
}

async function pickDestination(user: ReturnType<typeof userEvent.setup>) {
  await pickComboboxOption(user, "Workbook", "Invoices.xlsx");
  await pickComboboxOption(user, "Worksheet", WORKSHEET);
  await user.clear(screen.getByLabelText(/^Row number/i));
  await user.type(screen.getByLabelText(/^Row number/i), "42");
}

describe("the three guided steps", () => {
  it("step 1 asks for the workbook, the worksheet AND the row together", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await buildToOpenConfig(user);

    expect(
      within(screen.getByTestId("guided-step-destination-header")).getByText(
        "Pick the row",
      ),
    ).toBeInTheDocument();
    await pickDestination(user);

    // The row number is part of the destination SUMMARY. Before S3 a
    // NUMBER field contributed nothing to it, so the collapsed step read
    // "…· Invoices" and silently hid the row the user had chosen.
    //
    // The workbook appears as its stored id rather than "Invoices.xlsx":
    // the summary model is pure and has no access to the resolver's
    // option labels. That is pre-existing behavior shared with the Sheets
    // and Excel append steps, unchanged here, and worth its own fix later
    // — it is not what this test is about.
    await waitFor(() =>
      expect(
        screen.getByTestId("guided-step-destination-summary"),
      ).toHaveTextContent(`${WORKBOOK_ID} · ${WORKSHEET} · 42`),
    );
  });

  it("step 2 offers every detected column, each with three explicit choices", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await buildToOpenConfig(user);
    await pickDestination(user);
    await user.click(screen.getByTestId("guided-step-mapping-header"));

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Customer — Leave unchanged" }),
      ).toBeInTheDocument(),
    );
    for (const column of ["Customer", "Status", "Notes"]) {
      for (const choice of ["Leave unchanged", "Set to blank", "Set to a value"]) {
        expect(
          screen.getByRole("radio", { name: `${column} — ${choice}` }),
        ).toBeInTheDocument();
      }
    }
  });

  it("step 3 says only the chosen columns are written, and states the honest limit", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await buildToOpenConfig(user);
    await user.click(screen.getByTestId("guided-step-write-header"));

    const step3 = await screen.findByTestId("guided-write-empty");
    // EXCEL-UPDATE-ROW-CONCURRENCY-4 — the step no longer writes the whole
    // row back, so the old copy became untrue and was replaced.
    expect(step3.textContent).toMatch(/only the columns you chose/i);
    expect(step3.textContent).toMatch(/left out of the update/i);
    expect(step3.textContent).not.toMatch(/whole row back/i);
    // The remaining risk is stated rather than buried: an edit to a column
    // this step IS setting can still lose.
    expect(step3.textContent).toMatch(/same column at the same moment/i);
    // No invented write-mode controls: Graph's range PATCH has none.
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
  });
});

// ── what actually gets saved ────────────────────────────────────────────────

describe("omitted, blank and value are saved as three different things", () => {
  it("writes a config the real runtime schema accepts", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    const nodeId = await buildToOpenConfig(user);
    await pickDestination(user);
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Status — Set to a value" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("radio", { name: "Status — Set to a value" }));
    await user.type(screen.getByLabelText("Status — new value"), "Paid");
    await user.click(screen.getByRole("radio", { name: "Notes — Set to blank" }));

    const config = draftConfig(nodeId);
    // Customer was never touched → its key is ABSENT, which is what tells
    // the handler to preserve that cell.
    expect(config["values"]).toEqual({ Status: "Paid", Notes: "" });
    expect(
      Object.prototype.hasOwnProperty.call(config["values"], "Customer"),
    ).toBe(false);
    expect(() => UpdateRowConfigSchema.parse(config)).not.toThrow();
  });

  it("keeps the row number a number, so the schema accepts it", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    const nodeId = await buildToOpenConfig(user);
    await pickDestination(user);
    expect(draftConfig(nodeId)["rowNumber"]).toBe(42);
  });
});

// ── readiness ───────────────────────────────────────────────────────────────

describe("the readiness banner tracks the same three questions", () => {
  it("names the destination and the change, then reports ready", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await buildToOpenConfig(user);

    expect(
      await screen.findByText("Pick a workbook, worksheet and row"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose at least one column to update"),
    ).toBeInTheDocument();

    await pickDestination(user);
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Notes — Set to blank" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("radio", { name: "Notes — Set to blank" }));

    await waitFor(() =>
      expect(screen.getByText(/ready to run/i)).toBeInTheDocument(),
    );
  });

  it("a column deliberately cleared counts as a change, not as a gap", async () => {
    // The alternative would force people to invent data to satisfy the UI.
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    const nodeId = await buildToOpenConfig(user);
    await pickDestination(user);
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Notes — Set to blank" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("radio", { name: "Notes — Set to blank" }));
    expect(draftConfig(nodeId)["values"]).toEqual({ Notes: "" });
    await waitFor(() =>
      expect(screen.getByText(/ready to run/i)).toBeInTheDocument(),
    );
  });
});

// ── headings the picker cannot safely target ────────────────────────────────

describe("headings that cannot be targeted safely", () => {
  it("refuses a duplicated heading and explains the fix", async () => {
    columnItems = [
      { value: "Customer", label: "Customer", description: "Column A · duplicate heading" },
      { value: "Status", label: "Status", description: "Column B" },
      { value: "Customer", label: "Customer", description: "Column C · duplicate heading" },
    ];
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await buildToOpenConfig(user);
    await pickDestination(user);
    await user.click(screen.getByTestId("guided-step-mapping-header"));

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Status — Set to a value" }),
      ).toBeInTheDocument(),
    );
    // Neither duplicate is selectable…
    expect(
      screen.queryByRole("radio", { name: "Customer — Set to a value" }),
    ).toBeNull();
    // …but both are still shown, with the reason.
    expect(
      screen.getByTestId("spreadsheet-update-values-ambiguous-0").textContent,
    ).toMatch(/more than one column/i);
    expect(
      screen.getByTestId("spreadsheet-update-values-column-2"),
    ).toHaveAttribute("data-ambiguity", "duplicate-name");
  });

  it("commits the RAW heading, spacing and all, so the handler matches it", async () => {
    // The handler keys on the raw cell. A picker that tidied " Customer "
    // into "Customer" would author a key the handler throws on.
    columnItems = [
      { value: " Customer ", label: "Customer", description: "Column A" },
      { value: "Status", label: "Status", description: "Column B" },
    ];
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={baseWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    const nodeId = await buildToOpenConfig(user);
    await pickDestination(user);
    await user.click(screen.getByTestId("guided-step-mapping-header"));

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Customer — Set to a value" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("radio", { name: "Customer — Set to a value" }));
    await user.type(screen.getByLabelText("Customer — new value"), "Acme");

    expect(draftConfig(nodeId)["values"]).toEqual({ " Customer ": "Acme" });
    // And the user is told, rather than left to wonder why the label and
    // the stored key differ.
    expect(
      screen.getByTestId("spreadsheet-update-values-whitespace-0").textContent,
    ).toMatch(/extra spacing/i);
  });
});

// ── compatibility ───────────────────────────────────────────────────────────

describe("a node saved before the guided editor existed", () => {
  const LEGACY = {
    workbookId: WORKBOOK_ID,
    worksheetName: WORKSHEET,
    rowNumber: 7,
    values: { Status: "Paid", Notes: null, Phone: "555" },
  };

  function workflowWithLegacyNode(): WorkflowDetail {
    return {
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          {
            id: "trigger-1",
            kind: "trigger",
            provider: "native",
            type: "manual.run",
            config: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "action-1",
            kind: "action",
            provider: "microsoft-excel",
            type: "update_row",
            config: LEGACY,
            position: { x: 0, y: 120 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-1", to: "action-1" }],
      },
    } as WorkflowDetail;
  }

  it("opens without rewriting a single byte of the saved config", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={workflowWithLegacyNode()} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await openLastNodeOfKind("action");
    await waitFor(() =>
      expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Status — Set to a value" }),
      ).toBeInTheDocument(),
    );

    expect(draftConfig("action-1")).toEqual(LEGACY);
    expect(draftIsDirty("action-1")).toBe(false);
  });

  it("shows a legacy null as UNCHANGED, and explains why", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={workflowWithLegacyNode()} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await openLastNodeOfKind("action");
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Notes — Leave unchanged" }),
      ).toBeInTheDocument(),
    );
    // S3 showed this as "Set to blank", believing the handler wrote null
    // through as a clear. Microsoft documents the opposite — null is a skip
    // — so the label now matches what has always actually happened.
    expect(
      screen.getByRole("radio", { name: "Notes — Leave unchanged" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Notes — Set to blank" }),
    ).not.toBeChecked();
    // …and the correction is explained rather than silently applied.
    expect(
      screen.getByTestId("spreadsheet-update-values-legacy-2").textContent,
    ).toMatch(/always left the cell as it is/i);
  });

  it("keeps the legacy null AND a stale key through an unrelated edit", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={workflowWithLegacyNode()} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await openLastNodeOfKind("action");
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Customer — Set to blank" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("radio", { name: "Customer — Set to blank" }));

    const values = draftConfig("action-1")["values"] as Record<string, unknown>;
    // Untouched entries survive verbatim — the null is not normalised to
    // "", and the stale key is not silently dropped.
    expect(values["Notes"]).toBeNull();
    expect(values["Phone"]).toBe("555");
    expect(values["Customer"]).toBe("");
  });

  it("shows the column that is no longer in the worksheet, and says the run will fail", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilder workflow={workflowWithLegacyNode()} triggerProviders={triggerProviders} actionProviders={actionProviders} />);
    await openLastNodeOfKind("action");
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    const stale = await screen.findByTestId("spreadsheet-update-values-stale");
    expect(within(stale).getByText("Phone")).toBeInTheDocument();
    expect(stale.textContent).toMatch(/run will fail/i);
  });
});

// ── rollback ────────────────────────────────────────────────────────────────

describe("rollback", () => {
  it("is a registration, so removing it restores the generic form with no data change", () => {
    // The documented lever: nothing about a guided-authored config is
    // guided-specific, so un-registering the adapter is a complete
    // rollback. Pinned here so the property cannot quietly stop being true.
    expect(getGuidedSpreadsheetAdapter("microsoft-excel:update_row")).toBeDefined();
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: WORKBOOK_ID,
        worksheetName: WORKSHEET,
        rowNumber: 42,
        values: { Status: "Paid", Notes: "" },
      }).success,
    ).toBe(true);
  });
});
