/**
 * Guided Google Sheets configuration through the live builder shell
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * The guided experience is a presentation of the SAME configuration
 * draft, so the things worth asserting are the ones a rearrangement can
 * silently break:
 *
 *   - three steps that are all reachable and operable by keyboard;
 *   - a recommendation that is NOT a selection (Q11);
 *   - a cell range that follows the chosen tab, unless a person wrote it;
 *   - a node saved before the tab picker opening unchanged;
 *   - an unadapted action still getting the generic form.
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
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";
import { googleSheetsReadRowsMeta } from "@/integrations/google-sheets/actions/readRows.meta";
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

const SPREADSHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ";
const TAB = "Email log";
const COLUMNS = ["Timestamp", "From", "Subject"];

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
const actionProviders = [{ id: "google-sheets", displayName: "Google Sheets" }];

function optionsFor(source: string, deps: Record<string, string> | undefined) {
  if (source === "google-sheets:spreadsheets") {
    return {
      ok: true as const,
      source,
      items: [
        { value: SPREADSHEET_ID, label: "Workflow activity log" },
        { value: "other-file", label: "Q3 client intake" },
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
        { value: TAB, label: TAB },
        { value: "Archive", label: "Archive" },
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
    p === "google-sheets"
      ? [googleSheetsAppendRowMeta, googleSheetsReadRowsMeta]
      : [],
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

async function addAppendRowAndOpen(user: ReturnType<typeof userEvent.setup>) {
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
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  await openLastNodeOfKind("action");
  await waitFor(() =>
    expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
  );
  return action;
}

describe("the guided three steps", () => {
  it("presents all three questions, with the first unfinished one open", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await addAppendRowAndOpen(user);

    // All three steps are PRESENT — a collapsed step is still reachable.
    expect(screen.getByTestId("guided-step-destination")).toBeInTheDocument();
    expect(screen.getByTestId("guided-step-mapping")).toBeInTheDocument();
    expect(screen.getByTestId("guided-step-write")).toBeInTheDocument();

    // A brand-new node opens on step 1.
    expect(
      screen.getByTestId("guided-step-destination-header"),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("guided-step-mapping-header")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("can be driven entirely from the keyboard, and advancing moves focus to the next step", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await addAppendRowAndOpen(user);

    // Advance with the keyboard, not the mouse.
    const next = screen.getByTestId("guided-next-mapping");
    next.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("guided-step-mapping-header")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
    // Focus lands on the step the user was sent to — otherwise a keyboard
    // user is dropped back at the top of the panel.
    await waitFor(() => {
      expect(screen.getByTestId("guided-step-mapping-header")).toHaveFocus();
    });

    // A completed step can be reopened — the accordion is not a one-way wizard.
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    await user.click(screen.getByTestId("guided-step-destination-header"));
    expect(
      screen.getByTestId("guided-step-destination-header"),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("recommends a write behavior without choosing it (Q11)", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const action = await addAppendRowAndOpen(user);

    await user.click(screen.getByTestId("guided-step-write-header"));

    // The recommendation is a visible label…
    expect(
      screen.getByTestId("guided-write-valueInputOption-recommended"),
    ).toHaveTextContent(/recommended/i);
    // …and nothing is selected on the user's behalf.
    const group = screen.getByTestId("guided-write-valueInputOption");
    for (const radio of within(group).getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
    expect(
      useConfigSlice.getState().drafts[action.id]?.values.valueInputOption,
    ).toBeUndefined();

    // Choosing commits the real enum value, not the friendly label.
    await user.click(screen.getByRole("radio", { name: /like something you typed in/i }));
    expect(
      useConfigSlice.getState().drafts[action.id]!.values.valueInputOption,
    ).toBe("USER_ENTERED");
  });

  it("warns in words when the row-overwriting option is chosen", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await addAppendRowAndOpen(user);
    await user.click(screen.getByTestId("guided-step-write-header"));

    // The safe option is the declared default, so no warning is showing.
    expect(
      screen.queryByTestId("guided-write-insertDataOption-danger"),
    ).toBeNull();

    await user.click(
      screen.getByRole("radio", { name: /write over whatever is there/i }),
    );

    const warning = await screen.findByTestId(
      "guided-write-insertDataOption-danger",
    );
    expect(warning).toHaveTextContent(/permanently erase/i);
    // The consequence is tied to the control, not left to colour.
    const chosen = screen.getByRole("radio", {
      name: /write over whatever is there/i,
    });
    expect(chosen).toHaveAttribute("aria-describedby", warning.id);
  });
});

describe("the cell range follows the tab", () => {
  it("derives the range from the chosen tab so the user never writes A1 notation", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const action = await addAppendRowAndOpen(user);

    await pickComboboxOption(user, /^spreadsheet$/i, "Workflow activity log");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^tab$/i })).toBeInTheDocument(),
    );
    await pickComboboxOption(user, /^tab$/i, TAB);

    await waitFor(() => {
      expect(useConfigSlice.getState().drafts[action.id]!.values.range).toBe(
        "'Email log'!A:Z",
      );
    });
  });

  it("keeps a hand-written range when the tab changes, and says so", async () => {
    const user = userEvent.setup();
    const saved: WorkflowNode = {
      id: "n-sheets",
      kind: "action",
      provider: "google-sheets",
      type: "append_row",
      config: {
        spreadsheetId: SPREADSHEET_ID,
        // Someone deliberately targeted a table that does not start at A1.
        range: "'Data'!B2:F10",
        values: ["x"],
        valueInputOption: "RAW",
      },
      position: { x: 0, y: 0 },
    } as WorkflowNode;

    render(
      <WorkflowBuilder
        workflow={workflowWith([saved])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");
    await waitFor(() =>
      expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^tab$/i })).toBeInTheDocument(),
    );
    await pickComboboxOption(user, /^tab$/i, TAB);

    // The custom range survives…
    await waitFor(() => {
      expect(useConfigSlice.getState().drafts["n-sheets"]!.values.range).toBe(
        "'Data'!B2:F10",
      );
    });
    // …and the user is told, rather than finding out from a wrong row later.
    const notice = screen.getByTestId("guided-custom-range-notice");
    expect(notice).toHaveTextContent(/custom cell range/i);
    expect(notice).toHaveTextContent(/'Data'!B2:F10/);

    // They can still opt into the whole tab explicitly.
    await user.click(screen.getByTestId("guided-custom-range-reset"));
    await waitFor(() => {
      expect(useConfigSlice.getState().drafts["n-sheets"]!.values.range).toBe(
        "'Email log'!A:Z",
      );
    });
  });
});

describe("a node saved before the tab picker existed", () => {
  const legacy: WorkflowNode = {
    id: "n-legacy",
    kind: "action",
    provider: "google-sheets",
    type: "append_row",
    config: {
      spreadsheetId: SPREADSHEET_ID,
      range: "'Email log'!A:F",
      values: ["a", "b"],
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
    },
    position: { x: 0, y: 0 },
  } as WorkflowNode;

  it("opens without changing a single stored value", async () => {
    render(
      <WorkflowBuilder
        workflow={workflowWith([legacy])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");
    await waitFor(() =>
      expect(screen.getByTestId("guided-config-layout")).toBeInTheDocument(),
    );

    // The saved node is untouched — merely opening a step must never edit a
    // live workflow.
    const node = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === "n-legacy")!;
    expect(node.config).toEqual(legacy.config);
    expect(node.config.sheetName).toBeUndefined();
    // …and nothing is queued as an unsaved edit either.
    expect(useConfigSlice.getState().drafts["n-legacy"]?.isDirty ?? false).toBe(
      false,
    );
  });

  it("explains which tab the saved range points at instead of guessing", async () => {
    render(
      <WorkflowBuilder
        workflow={workflowWith([legacy])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");

    const hint = await screen.findByTestId("guided-legacy-tab-suggestion");
    expect(hint).toHaveTextContent(/Email log/);
    expect(hint).toHaveTextContent(/nothing changes until you save/i);
  });

  it("admits when it cannot tell which tab a saved range means", async () => {
    const ambiguous = {
      ...legacy,
      id: "n-ambiguous",
      config: { ...legacy.config, range: "A:Z" },
    } as WorkflowNode;
    render(
      <WorkflowBuilder
        workflow={workflowWith([ambiguous])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await openLastNodeOfKind("action");

    const hint = await screen.findByTestId("guided-legacy-tab-unreadable");
    expect(hint).toHaveTextContent(/can.t tell which tab/i);
  });
});

describe("pasting a link instead of searching", () => {
  it("accepts a Google Sheets URL and selects that spreadsheet", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const action = await addAppendRowAndOpen(user);

    await user.click(screen.getByTestId("guided-paste-link-open"));
    await user.type(
      screen.getByTestId("guided-paste-link-input"),
      "https://docs.google.com/spreadsheets/d/pasted-file-id/edit#gid=0",
    );
    await user.click(screen.getByTestId("guided-paste-link-apply"));

    await waitFor(() => {
      expect(
        useConfigSlice.getState().drafts[action.id]!.values.spreadsheetId,
      ).toBe("pasted-file-id");
    });
  });

  it("says so plainly when the pasted text is not a sheet link", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const action = await addAppendRowAndOpen(user);

    await user.click(screen.getByTestId("guided-paste-link-open"));
    await user.type(
      screen.getByTestId("guided-paste-link-input"),
      "https://example.com/something",
    );
    await user.click(screen.getByTestId("guided-paste-link-apply"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /doesn.t look like a Google Sheets link/i,
    );
    // Nothing was guessed into the configuration.
    expect(
      useConfigSlice.getState().drafts[action.id]?.values.spreadsheetId,
    ).toBeUndefined();
  });
});

describe("actions without a guided adapter are unaffected", () => {
  it("Read Rows still renders the ordinary form", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={emptyWorkflow}
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
      expect(screen.getByText("Read Rows")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Read Rows"));
    await openLastNodeOfKind("action");

    await waitFor(() =>
      expect(screen.getByTestId("schema-form")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("guided-config-layout")).toBeNull();
  });
});
