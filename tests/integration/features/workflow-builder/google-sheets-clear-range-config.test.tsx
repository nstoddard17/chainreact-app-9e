/**
 * Slice 3.GSHEETS-4 integration test — Google Sheets `clear_range`
 * config end-to-end through the live WorkflowBuilder shell.
 *
 * Pins the first destructive Google Sheets action through the builder
 * config rail. Covers:
 *   - spreadsheetId combobox sourced from `google-sheets:spreadsheets`,
 *   - range text (A1 notation),
 *   - the meta carries `isDestructive: true` + `requiresConfirmation: true`
 *     + `riskLevel: "high"` + a `riskDescription` — these flags are what
 *     drive the existing destructive-confirmation modal at activation /
 *     Run-now time. The modal flow itself is covered exhaustively by
 *     `destructive-action-confirmation-modal.test.tsx`; this test does
 *     NOT re-exercise that path per the slice rule "use existing modal
 *     tests rather than duplicating."
 *   - Modal Save flushes the draft into pendingNodes,
 *   - Toolbar Save persists the config with `{spreadsheetId, range}` intact.
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
import { googleSheetsClearRangeMeta } from "@/integrations/google-sheets/actions/clearRange.meta";
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
const RANGE = "Sheet1!A2:Z100";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "google-sheets" ? [googleSheetsClearRangeMeta] : [],
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

it("Google Sheets clear_range meta declares isDestructive + requiresConfirmation + riskLevel=high + non-empty riskDescription — Slice 3.GSHEETS-4 meta guard", () => {
  expect(googleSheetsClearRangeMeta.isDestructive).toBe(true);
  expect(googleSheetsClearRangeMeta.requiresConfirmation).toBe(true);
  expect(googleSheetsClearRangeMeta.riskLevel).toBe("high");
  expect(googleSheetsClearRangeMeta.riskDescription).toBeDefined();
  expect(googleSheetsClearRangeMeta.riskDescription!.length).toBeGreaterThan(0);

  // Schema-anchored: clear_range takes { spreadsheetId, range } only.
  const names = googleSheetsClearRangeMeta.fields.map((f) => f.name);
  expect(names).toEqual(["spreadsheetId", "range"]);
  expect(names).not.toContain("sheetName");

  const byName = new Map(
    googleSheetsClearRangeMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("spreadsheetId")!.type).toBe("combobox");
  expect(byName.get("spreadsheetId")!.optionsSource).toBe(
    "google-sheets:spreadsheets",
  );
  expect(byName.get("range")!.type).toBe("text");
  expect(byName.get("range")!.required).toBe(true);
});

it("end-to-end: pick spreadsheet → type range → Modal Save (draft only) → Toolbar Save (updateWorkflow once with spreadsheetId + range)", async () => {
  // Destructive-confirmation flow at activation / Run-now time is
  // covered by `destructive-action-confirmation-modal.test.tsx` — the
  // meta's risk flags drive that path. This test focuses on the
  // config-rail round-trip only.
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

  // 2. Drill into Google Sheets → Clear Range.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse google sheets actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Clear Range")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Clear Range"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("google-sheets");
  expect(action.type).toBe("clear_range");

  // 3. Open config rail. Verify spreadsheet combobox + range text both
  //    render. sheetName is intentionally absent (schema is single-range).
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^spreadsheet$/i }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^range$/i })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /^sheet$/i })).toBeNull();

  // 4. Pick the spreadsheet via the async picker.
  await pickComboboxOption(user, /^spreadsheet$/i, "Q4 Forecast");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.spreadsheetId,
  ).toBe(SPREADSHEET_ID);

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

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 7. Toolbar Save persists once. The destructive-confirmation flow
  //    fires on Activate / Run Now (covered separately); save-from-
  //    draft is unaffected.
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
  expect(persistedAction.type).toBe("clear_range");
  expect(persistedAction.config.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(persistedAction.config.range).toBe(RANGE);

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
