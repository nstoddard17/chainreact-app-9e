/**
 * Slice 3.GSHEETS-4 integration test — Google Sheets `row_changed`
 * trigger config end-to-end through the live WorkflowBuilder shell.
 *
 * Pins the first Google Sheets trigger through the builder config
 * rail. Covers:
 *   - spreadsheetId combobox sourced from `google-sheets:spreadsheets`,
 *   - sheetName combobox sourced from `google-sheets:sheets` with
 *     `dependsOn: spreadsheetId` — exercises the GSHEETS-2 cascade
 *     end-to-end through a trigger meta,
 *   - headerRow boolean,
 *   - changeKinds string-array (chip input) — pin that ['added',
 *     'updated', 'removed'] all flow through as a real `string[]`,
 *   - snapshotRowLimit bounded number,
 *   - keyColumn combobox sourced from `google-sheets:columns` with
 *     `dependsOn: [spreadsheetId, sheetName]` (RESOLVERS-1) — exercises a
 *     MULTI-parent cascade end-to-end and keeps the visibleWhen headerRow
 *     gate,
 *   - payload sensitive flags (rowValues, keyValue, previousValues)
 *     surface from the meta — pinned at the meta-shape level,
 *   - Modal Save flushes draft → Toolbar Save persists once.
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
import { googleSheetsRowChangedTriggerMeta } from "@/integrations/google-sheets/triggers/rowChanged/rowChanged.meta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "./helpers/comboboxField";

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

const triggerProviders = [{ id: "google-sheets", displayName: "Google Sheets" }];
const actionProviders = [{ id: "google-sheets", displayName: "Google Sheets" }];

const SPREADSHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ";
const SHEET_NAME = "Orders";
const KEY_COLUMN = "OrderId";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "google-sheets" ? [googleSheetsRowChangedTriggerMeta] : [],
  );
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
    if (source === "google-sheets:sheets") {
      return {
        ok: true,
        source: "google-sheets:sheets",
        items: [
          {
            value: SHEET_NAME,
            label: SHEET_NAME,
            description: "1000 rows × 26 columns",
          },
          { value: "Lookup", label: "Lookup", description: "50 rows × 5 columns" },
        ],
        hasMore: false,
      };
    }
    if (source === "google-sheets:columns") {
      // RESOLVERS-1 — the real row-1 headers of the chosen tab.
      return {
        ok: true,
        source: "google-sheets:columns",
        items: [
          { value: KEY_COLUMN, label: KEY_COLUMN, description: "Column A" },
          { value: "Customer", label: "Customer", description: "Column B" },
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

it("Google Sheets row_changed meta field shape + payload-sensitive flags — Slice 3.GSHEETS-4 meta guard", () => {
  // Trigger-level guards: activation, integration, category.
  expect(googleSheetsRowChangedTriggerMeta.activation).toBe("webhook");
  expect(googleSheetsRowChangedTriggerMeta.requiresIntegration).toBe(true);
  expect(googleSheetsRowChangedTriggerMeta.category).toBe("data");

  // Field shape pin — exact order matters for the form layout.
  expect(googleSheetsRowChangedTriggerMeta.fields.map((f) => f.name)).toEqual([
    "spreadsheetId",
    "sheetName",
    "headerRow",
    "changeKinds",
    "snapshotRowLimit",
    "keyColumn",
  ]);

  const byName = new Map(
    googleSheetsRowChangedTriggerMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("spreadsheetId")!.optionsSource).toBe(
    "google-sheets:spreadsheets",
  );
  expect(byName.get("sheetName")!.optionsSource).toBe("google-sheets:sheets");
  expect(byName.get("sheetName")!.dependsOn).toBe("spreadsheetId");
  // CONFIG-UX sweep — changeKinds is a static multi-select combobox
  // (typo-proof pick of the 3 runtime enum values; still commits string[]).
  const changeKinds = byName.get("changeKinds")!;
  expect(changeKinds.type).toBe("combobox");
  expect(changeKinds.multiple).toBe(true);
  expect(changeKinds.options!.map((o) => o.value).sort()).toEqual([
    "added",
    "removed",
    "updated",
  ]);
  expect(changeKinds.defaultValue).toEqual(["added"]);
  expect(byName.get("headerRow")!.defaultValue).toBe(false);
  expect(byName.get("snapshotRowLimit")!.numeric).toMatchObject({
    min: 100,
    max: 10000,
    integer: true,
  });
  // CONFIG-UX sweep — snapshot tuning lives in the Advanced tab; keyColumn
  // only renders while the Header row toggle is on (visibleWhen).
  expect(byName.get("snapshotRowLimit")!.advanced).toBe(true);
  const keyColumn = byName.get("keyColumn")!;
  expect(keyColumn.visibleWhen).toEqual({
    field: "headerRow",
    valueTruthy: true,
  });
  // RESOLVERS-1 — keyColumn picks a REAL row-1 header via google-sheets:columns
  // (deps spreadsheetId + sheetName) instead of asking authors to type it.
  // visibleWhen headerRow is preserved: keyColumn without headerRow is a
  // combination the trigger schema rejects at parse time.
  expect(keyColumn.type).toBe("combobox");
  expect(keyColumn.optionsSource).toBe("google-sheets:columns");
  expect(keyColumn.dependsOn).toEqual(["spreadsheetId", "sheetName"]);
  expect(keyColumn.allowManualEntry).toBe(true);
  expect(keyColumn.required).toBe(false);
  expect(keyColumn.options).toBeUndefined();

  // Payload sensitive pins.
  const payload = new Map(
    googleSheetsRowChangedTriggerMeta.payloadShape.map((o) => [o.name, o]),
  );
  expect(payload.get("rowValues")!.sensitive).toBe(true);
  expect(payload.get("keyValue")!.sensitive).toBe(true);
  expect(payload.get("previousValues")!.sensitive).toBe(true);
  expect(payload.get("headers")!.sensitive).toBeFalsy();
  expect(payload.get("changeKind")!.sensitive).toBeFalsy();
  expect(payload.get("rowIndex")!.sensitive).toBeFalsy();
});

it("end-to-end: trigger picker → spreadsheet → sheet (cascade) → headerRow + changeKinds chips + snapshotRowLimit + keyColumn → Modal Save → Toolbar Save persists all values", async () => {
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

  // 1. Open the trigger picker.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));

  // 2. Drill into Google Sheets → Row Changed.
  await user.click(
    screen.getByRole("button", { name: /browse google sheets triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Row Changed")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Row Changed"));

  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger")!;
  expect(trigger.provider).toBe("google-sheets");
  expect(trigger.type).toBe("row_changed");
  // Meta defaults seed the draft via deriveDefaultConfig.
  expect(trigger.config.changeKinds).toEqual(["added"]);
  expect(trigger.config.headerRow).toBe(false);
  expect(trigger.config.snapshotRowLimit).toBe(1000);

  // 3. Open the trigger config rail.
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^spreadsheet$/i }),
    ).toBeInTheDocument();
  });

  // 4. Pick the spreadsheet — sheet picker is gated until then.
  await pickComboboxOption(user, /^spreadsheet$/i, "Q4 Forecast");
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.spreadsheetId).toBe(
    SPREADSHEET_ID,
  );

  // 5. Sheet picker fetches scoped to the selected spreadsheetId
  //    (GSHEETS-2 cascade). Pick the sheet.
  await waitFor(() => {
    const sheetCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "google-sheets:sheets",
    );
    expect(sheetCalls.length).toBeGreaterThan(0);
    const lastCall = sheetCalls[sheetCalls.length - 1]!;
    const args = lastCall[1] as { deps?: Record<string, string> } | undefined;
    expect(args?.deps?.spreadsheetId).toBe(SPREADSHEET_ID);
  });
  await pickComboboxOption(user, /^sheet$/i, SHEET_NAME);
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.sheetName).toBe(
    SHEET_NAME,
  );

  // 6. Toggle headerRow on (required precondition for keyColumn).
  const headerRowSwitch = screen.getByRole("switch", { name: /^header row$/i });
  await user.click(headerRowSwitch);
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.headerRow).toBe(
    true,
  );

  // 7. changeKinds multi-pick (CONFIG-UX sweep — static options popover):
  //    remove the default `added` chip, then pick Updated + Removed to
  //    exercise the full snapshot-diff path. Still commits string[].
  await user.click(
    screen.getByRole("button", { name: /Remove Change kinds item Rows added/i }),
  );
  await user.click(screen.getByTestId("multi-select-changeKinds"));
  await user.click(await screen.findByRole("option", { name: /rows updated/i }));
  await user.click(await screen.findByRole("option", { name: /rows removed/i }));
  await user.keyboard("{Escape}");
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.changeKinds).toEqual(
    ["updated", "removed"],
  );

  // 8. snapshotRowLimit — bump to 2000. Lives in the Advanced tab now
  //    (CONFIG-UX sweep), so switch tabs around the edit.
  await user.click(screen.getByRole("tab", { name: /advanced/i }));
  const snapshotInput = await screen.findByRole("spinbutton", {
    name: /snapshot row limit/i,
  });
  await user.clear(snapshotInput);
  await user.type(snapshotInput, "2000");
  expect(
    useConfigSlice.getState().drafts[trigger.id]!.values.snapshotRowLimit,
  ).toBe(2000);
  await user.click(screen.getByRole("tab", { name: /setup/i }));

  // 9. keyColumn — pick a REAL row-1 header from google-sheets:columns
  //    (RESOLVERS-1). The committed value is still the header string.
  await pickComboboxOption(user, /^key column$/i, KEY_COLUMN);
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.keyColumn).toBe(
    KEY_COLUMN,
  );
  // The columns picker is cascaded on BOTH parents — pin that the request
  // actually carried them (a missing dep short-circuits at the route).
  await waitFor(() => {
    const call = mockFetchOptionsSource.mock.calls.find(
      (c) => c[0] === "google-sheets:columns",
    );
    expect(call).toBeDefined();
    const args = call![1] as { deps?: Record<string, string> } | undefined;
    expect(args?.deps?.spreadsheetId).toBe(SPREADSHEET_ID);
    expect(args?.deps?.sheetName).toBe(SHEET_NAME);
  });

  // 10. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === trigger.id)!.config;
  expect(pendingConfig.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(pendingConfig.sheetName).toBe(SHEET_NAME);
  expect(pendingConfig.headerRow).toBe(true);
  // changeKinds persists as a native string[], not JSON / CSV.
  expect(pendingConfig.changeKinds).toEqual(["updated", "removed"]);
  expect(Array.isArray(pendingConfig.changeKinds)).toBe(true);
  expect(pendingConfig.snapshotRowLimit).toBe(2000);
  expect(pendingConfig.keyColumn).toBe(KEY_COLUMN);

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 11. Toolbar Save persists once.
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
  const persistedTrigger = persistedNodes.find((n) => n.kind === "trigger")!;
  expect(persistedTrigger.provider).toBe("google-sheets");
  expect(persistedTrigger.type).toBe("row_changed");
  expect(persistedTrigger.config.spreadsheetId).toBe(SPREADSHEET_ID);
  expect(persistedTrigger.config.sheetName).toBe(SHEET_NAME);
  expect(persistedTrigger.config.headerRow).toBe(true);
  expect(persistedTrigger.config.changeKinds).toEqual(["updated", "removed"]);
  expect(persistedTrigger.config.snapshotRowLimit).toBe(2000);
  expect(persistedTrigger.config.keyColumn).toBe(KEY_COLUMN);

  // Server-managed activation state stays untouched by Save.
  expect(persistedTrigger.config.channelId).toBeUndefined();
  expect(persistedTrigger.config.resourceId).toBeUndefined();
  expect(persistedTrigger.config.expiresAt).toBeUndefined();
  expect(persistedTrigger.config.snapshot).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
