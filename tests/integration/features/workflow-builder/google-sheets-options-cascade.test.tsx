/**
 * Slice 3.GSHEETS-2 integration test — two-hop options-source cascade
 * (`google-sheets:spreadsheets` → `google-sheets:sheets`).
 *
 * Validates the first non-Slack production user of the Slice 3.33
 * `dependsOn` cascade. The two new Google Sheets resolvers back the
 * Spreadsheet → Sheet picker chain that 11 of the 12 future Google
 * Sheets action metas + 2 trigger metas will consume (per the
 * GSHEETS-1 plan §4).
 *
 * Scope:
 *   - Use SchemaForm directly with two synthetic combobox fields
 *     (`spreadsheetId` + `sheetName`). The fields reference the live
 *     options-source resolver keys, not registered action metas — the
 *     point of this test is to prove the cascade infrastructure
 *     end-to-end through SchemaForm + ComboboxField + useOptionsSource
 *     + the typed `fetchOptionsSource` client. Action metas come in
 *     GSHEETS-3 / GSHEETS-4 and have their own integration tests.
 *   - Mock `@/lib/api/options` so the test owns what the picker sees
 *     without a real HTTP round-trip.
 *
 * What this test does NOT cover (intentionally — handled elsewhere):
 *   - Resolver server-side logic (see
 *     `tests/unit/integrations/google-sheets/options/spreadsheets.test.ts`
 *     and `.../sheets.test.ts`).
 *   - The Drive API wrapper (see
 *     `tests/unit/integrations/google-sheets/api/listSpreadsheets.test.ts`).
 *   - Full WorkflowBuilder shell — discovery + meta resolution +
 *     graph persistence. Those land with the GSHEETS-3 / GSHEETS-4
 *     integration tests that use real metas.
 */

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import * as React from "react";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import { pickComboboxOption } from "./helpers/comboboxField";

// Synthetic field set — mirrors what a future Google Sheets action
// meta would declare. Two async comboboxes; the sheet picker depends
// on the spreadsheet picker. Field names match the GSHEETS-1 plan.
const fields: readonly FieldMeta[] = [
  {
    name: "spreadsheetId",
    label: "Spreadsheet",
    description: "Pick a spreadsheet to read or write.",
    type: "combobox",
    required: true,
    optionsSource: "google-sheets:spreadsheets",
  } as FieldMeta,
  {
    name: "sheetName",
    label: "Worksheet",
    description: "Pick a worksheet (tab) inside the chosen spreadsheet.",
    type: "combobox",
    required: true,
    dependsOn: "spreadsheetId",
    optionsSource: "google-sheets:sheets",
  } as FieldMeta,
];

/**
 * Test-host that wires SchemaForm to local state so the test can
 * drive value changes through the real onChange path (matching how
 * the live ConfigModal binds SchemaForm).
 */
function CascadeHost(props: {
  onSave: (values: Record<string, string>) => void;
}): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave(values);
      }}
    >
      <SchemaForm
        fields={fields}
        values={values}
        onChange={(name, value) => {
          setValues((prev) => {
            const next = { ...prev };
            if (value === undefined || value === null || value === "") {
              delete next[name];
            } else {
              next[name] = String(value);
            }
            return next;
          });
        }}
      />
      <button type="submit">Save</button>
    </form>
  );
}

function spreadsheetsResponse(items: ReadonlyArray<{ value: string; label: string; description?: string }>) {
  return {
    ok: true as const,
    source: "google-sheets:spreadsheets",
    items,
    hasMore: false,
  };
}

function sheetsResponse(items: ReadonlyArray<{ value: string; label: string; description?: string }>) {
  return {
    ok: true as const,
    source: "google-sheets:sheets",
    items,
    hasMore: false,
  };
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
});

describe("google-sheets options cascade — two-hop happy path", () => {
  it("loads spreadsheets, then loads sheets scoped to the chosen spreadsheetId, then saves both values", async () => {
    // First call: spreadsheets picker fetches its list. Second call:
    // sheets picker fetches scoped to spreadsheetId. The mock matches
    // by source string so order independence is preserved.
    mockFetchOptionsSource.mockImplementation((source: string) => {
      if (source === "google-sheets:spreadsheets") {
        return Promise.resolve(
          spreadsheetsResponse([
            {
              value: "1aBc",
              label: "Q4 Forecast",
              description: "Modified 2026-05-20",
            },
            {
              value: "2dEf",
              label: "Marketing Roster",
              description: "Modified 2026-04-10",
            },
          ]),
        );
      }
      if (source === "google-sheets:sheets") {
        return Promise.resolve(
          sheetsResponse([
            { value: "Sheet1", label: "Sheet1", description: "1000 rows × 26 columns" },
            { value: "Lookup", label: "Lookup", description: "50 rows × 5 columns" },
          ]),
        );
      }
      return Promise.resolve({
        ok: false,
        source,
        code: "UNKNOWN",
        message: "test mock: unknown source",
      });
    });

    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<CascadeHost onSave={onSave} />);

    // 1. Spreadsheet picker: opens, fetches, user selects.
    await pickComboboxOption(user, /spreadsheet/i, "Q4 Forecast");

    // Wait for the spreadsheet-side fetch to settle.
    await waitFor(() => {
      const spreadsheetCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "google-sheets:spreadsheets",
      );
      expect(spreadsheetCalls.length).toBeGreaterThan(0);
    });

    // 2. Sheet picker should now fetch scoped to the chosen
    // spreadsheetId. Wait for the dependsOn-driven fetch.
    await waitFor(() => {
      const sheetCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "google-sheets:sheets",
      );
      expect(sheetCalls.length).toBeGreaterThan(0);
      // The latest sheet call MUST carry deps.spreadsheetId.
      const lastCall = sheetCalls[sheetCalls.length - 1]!;
      const args = lastCall[1] as { deps?: Record<string, string> } | undefined;
      expect(args?.deps?.spreadsheetId).toBe("1aBc");
    });

    // 3. Worksheet picker: pick Sheet1.
    await pickComboboxOption(user, /worksheet/i, "Sheet1");

    // 4. Save and inspect captured values.
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      spreadsheetId: "1aBc",
      sheetName: "Sheet1",
    });
  });
});

describe("google-sheets options cascade — sheet picker is gated until spreadsheet is set", () => {
  it("does NOT fetch google-sheets:sheets while spreadsheetId is empty (Slice 3.33 cascade gate)", async () => {
    mockFetchOptionsSource.mockImplementation((source: string) => {
      if (source === "google-sheets:spreadsheets") {
        return Promise.resolve(spreadsheetsResponse([]));
      }
      return Promise.resolve({
        ok: false,
        source,
        code: "UNKNOWN",
        message: "test mock: should not be called",
      });
    });

    render(<CascadeHost onSave={jest.fn()} />);

    // Give the spreadsheet picker a moment to fetch its empty list.
    await waitFor(() => {
      expect(mockFetchOptionsSource).toHaveBeenCalledWith(
        "google-sheets:spreadsheets",
        expect.anything(),
      );
    });

    // The sheets picker MUST NOT have fetched — the cascade gates it
    // on the parent value being set.
    const sheetCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "google-sheets:sheets",
    );
    expect(sheetCalls).toEqual([]);

    // The sheet field should render its passive "Select Spreadsheet
    // first" trigger.
    expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
  });
});

describe("google-sheets options cascade — changing spreadsheet clears the dependent sheet", () => {
  it("after picking a sheet, changing the spreadsheet clears sheetName and re-fetches sheets for the new spreadsheetId", async () => {
    let sheetsCallCount = 0;
    mockFetchOptionsSource.mockImplementation(
      (source: string, args?: { deps?: Record<string, string> }) => {
        if (source === "google-sheets:spreadsheets") {
          return Promise.resolve(
            spreadsheetsResponse([
              { value: "wb-A", label: "Workbook A" },
              { value: "wb-B", label: "Workbook B" },
            ]),
          );
        }
        if (source === "google-sheets:sheets") {
          sheetsCallCount += 1;
          const id = args?.deps?.spreadsheetId;
          if (id === "wb-A") {
            return Promise.resolve(
              sheetsResponse([{ value: "A-Sheet1", label: "A-Sheet1" }]),
            );
          }
          if (id === "wb-B") {
            return Promise.resolve(
              sheetsResponse([{ value: "B-Sheet1", label: "B-Sheet1" }]),
            );
          }
        }
        return Promise.resolve({
          ok: false,
          source,
          code: "UNKNOWN",
          message: "test mock: unknown",
        });
      },
    );

    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<CascadeHost onSave={onSave} />);

    // Pick spreadsheet A → its sheet.
    await pickComboboxOption(user, /spreadsheet/i, "Workbook A");
    await pickComboboxOption(user, /worksheet/i, "A-Sheet1");

    // Switch to spreadsheet B. The Slice 3.33 cascade should:
    //   - clear sheetName from the values bag (so the new fetch isn't
    //     polluted by the stale A-Sheet1)
    //   - re-fetch google-sheets:sheets with deps.spreadsheetId = wb-B
    await pickComboboxOption(user, /spreadsheet/i, "Workbook B");

    await waitFor(() => {
      // At least two sheet fetches by now — one for wb-A and one for wb-B.
      const sheetCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "google-sheets:sheets",
      );
      // The latest sheet call should be scoped to wb-B.
      const last = sheetCalls[sheetCalls.length - 1]!;
      const args = last[1] as { deps?: Record<string, string> } | undefined;
      expect(args?.deps?.spreadsheetId).toBe("wb-B");
    });

    // Confirm the cascade fired at least twice — once per parent value.
    expect(sheetsCallCount).toBeGreaterThanOrEqual(2);

    // Pick the new sheet and save. sheetName MUST be the B value, not
    // the stale A value (the cascade clear is what enforces this).
    await pickComboboxOption(user, /worksheet/i, "B-Sheet1");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      spreadsheetId: "wb-B",
      sheetName: "B-Sheet1",
    });
  });
});
