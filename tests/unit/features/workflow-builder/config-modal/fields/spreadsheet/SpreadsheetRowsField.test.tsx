/**
 * SPREADSHEET-CONFIG-REDESIGN-1 — the `spreadsheet-rows` composite
 * editor. Column names come from a mocked options response shaped
 * EXACTLY like the `microsoft-excel:worksheet_columns` resolver output
 * (value/label = real header text, description = column letter) — never
 * hardcoded UI-only columns. The saved config is proven against the
 * REAL AddRowConfigSchema for both modes.
 */

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

const mockUpstream = jest.fn();
jest.mock(
  "@/features/workflow-builder/hooks/useActiveNodeUpstreamVariables",
  () => ({
    __esModule: true,
    useActiveNodeUpstreamVariables: () => mockUpstream(),
  }),
);

import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpreadsheetRowsField } from "@/features/workflow-builder/config-modal/fields/spreadsheet/SpreadsheetRowsField";
import { AddRowConfigSchema } from "@/integrations/microsoft-excel/actions/addRow.schema";
import type { FieldMeta } from "@/contracts/actionMeta";

/** The `values` field exactly as the Excel add_row meta declares it. */
const FIELD: FieldMeta = {
  name: "values",
  label: "Row values",
  description:
    "Add one value per column. Columns come from your selected worksheet; leave a field blank to keep that cell empty.",
  type: "spreadsheet-rows",
  required: false,
  optionsSource: "microsoft-excel:worksheet_columns",
  dependsOn: ["workbookId", "worksheetName"],
  batchRowsField: "rows",
};

const DEPS = { workbookId: "wb-1", worksheetName: "Sheet1" };

/** Resolver-shaped fixture (microsoft-excel:worksheet_columns output). */
const COLUMNS_RESPONSE = {
  ok: true,
  source: "microsoft-excel:worksheet_columns",
  items: [
    { value: "Name", label: "Name", description: "Column A" },
    { value: "Email", label: "Email", description: "Column B" },
    { value: "Notes", label: "Notes", description: "Column C" },
  ],
  hasMore: false,
};

/**
 * Stateful harness standing in for SchemaForm + configSlice: owns the
 * whole config record, routes `onChange` to the field's own key and
 * `onChangeField` to any key — mirroring the real wiring.
 */
let latestConfig: Record<string, unknown> = {};
function Harness({ initial = {} }: { initial?: Record<string, unknown> }) {
  const [config, setConfig] = React.useState<Record<string, unknown>>(initial);
  latestConfig = config;
  const setKey = (name: string, value: unknown) =>
    setConfig((prev) => ({ ...prev, [name]: value }));
  return (
    <SpreadsheetRowsField
      field={FIELD}
      value={config["values"]}
      onChange={(v) => setKey("values", v)}
      deps={DEPS}
      enabled
      formValues={config}
      onChangeField={setKey}
    />
  );
}

beforeEach(() => {
  latestConfig = {};
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockResolvedValue(COLUMNS_RESPONSE);
  mockUpstream.mockReset();
  mockUpstream.mockReturnValue({
    sources: [
      {
        sourceId: "trigger",
        displayName: "Manual",
        kind: "trigger",
        provider: "native",
        outputs: [{ name: "email", type: "string" }],
      },
    ],
    loading: false,
    latestValuesBySource: {},
  });
});

function fullConfig(): Record<string, unknown> {
  return { ...DEPS, ...latestConfig };
}

describe("SpreadsheetRowsField — one row (columns detected)", () => {
  it("renders one input per REAL resolver column (with column letters) and no JSON language", async () => {
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Column B")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /json|paste|positional|keyed|array|object/i,
    );
    // Columns were requested from the resolver with both parents.
    expect(mockFetchOptionsSource).toHaveBeenCalledWith(
      "microsoft-excel:worksheet_columns",
      expect.objectContaining({ deps: DEPS }),
    );
  });

  it("typing into columns commits a positional row (blanks preserved in the middle) that AddRowConfigSchema accepts", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Notes"), "pioneer");
    expect(latestConfig["values"]).toEqual(["Ada", "", "pioneer"]);
    expect(latestConfig["rows"]).toBeUndefined();
    expect(() => AddRowConfigSchema.parse(fullConfig())).not.toThrow();
  });

  it("shows a preview of how the row will look", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText("Name"), "Ada");
    const preview = screen.getByTestId("spreadsheet-preview-values");
    expect(preview.textContent).toContain("How your row will look");
    expect(preview.textContent).toContain("Name");
    expect(preview.textContent).toContain("Ada");
  });

  it("variable insertion into a cell persists the {{...}} token in the saved config", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByLabelText("Email")).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: /insert variable into email/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /insert \{\{trigger\.email\}\}/i }),
    );
    expect(latestConfig["values"]).toEqual(["", "{{trigger.email}}"]);
    expect(() => AddRowConfigSchema.parse(fullConfig())).not.toThrow();
  });
});

describe("SpreadsheetRowsField — several rows (columns detected)", () => {
  it("mode toggle switches to the row-card editor; rows commit as header-keyed records; exactly one shape present", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toBeInTheDocument(),
    );
    // Put something in one-row mode first to prove the switch clears it.
    await user.type(screen.getByLabelText("Name"), "Ada");
    expect(latestConfig["values"]).toEqual(["Ada"]);

    await user.click(screen.getByRole("radio", { name: /several rows/i }));
    expect(latestConfig["values"]).toBeUndefined();

    await user.click(
      screen.getByTestId("spreadsheet-batch-rows-values-add-row"),
    );
    await user.type(screen.getByLabelText("Row 1 Name"), "Grace");
    await user.type(screen.getByLabelText("Row 1 Email"), "grace@example.com");
    expect(latestConfig["rows"]).toEqual([
      { Name: "Grace", Email: "grace@example.com" },
    ]);
    expect(latestConfig["values"]).toBeUndefined();
    expect(() => AddRowConfigSchema.parse(fullConfig())).not.toThrow();

    // Batch preview shows the row count.
    expect(
      screen.getByTestId("spreadsheet-preview-values").textContent,
    ).toContain("1 row will be added");
  });

  it("hydrates existing batch rows into the editor when reopened", async () => {
    render(
      <Harness initial={{ rows: [{ Name: "Ada", Email: "ada@example.com" }] }} />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Row 1 Name")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Row 1 Name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Row 1 Email")).toHaveValue("ada@example.com");
  });
});

describe("SpreadsheetRowsField — honest fallback (no columns detected)", () => {
  beforeEach(() => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: true,
      source: "microsoft-excel:worksheet_columns",
      items: [],
      hasMore: false,
    });
  });

  it("says columns couldn't be detected (no invented names) and offers manual one-row entry", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() =>
      expect(
        screen.getByTestId("spreadsheet-rows-values-no-columns"),
      ).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toMatch(/Date|Customer|Amount|Status/);

    await user.type(screen.getByLabelText("1st column"), "Ada");
    await user.click(
      screen.getByTestId("spreadsheet-single-row-values-add-cell"),
    );
    await user.type(screen.getByLabelText("2nd column"), "ada@example.com");
    expect(latestConfig["values"]).toEqual(["Ada", "ada@example.com"]);
    expect(() => AddRowConfigSchema.parse(fullConfig())).not.toThrow();
  });

  it("several-rows fallback is the manual column-name/value row builder and drops empty rows from the saved config", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() =>
      expect(
        screen.getByTestId("spreadsheet-rows-values-no-columns"),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("radio", { name: /several rows/i }));
    await user.click(screen.getByTestId("keyvalue-list-rows-add-row"));
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 name/i }),
      "Name",
    );
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 value/i }),
      "Ada",
    );
    expect(latestConfig["rows"]).toEqual([{ Name: "Ada" }]);
    expect(() => AddRowConfigSchema.parse(fullConfig())).not.toThrow();
  });
});

describe("SpreadsheetRowsField — destination gating", () => {
  it("asks for the destination first when parents are missing (no columns fetch)", () => {
    render(
      <SpreadsheetRowsField
        field={FIELD}
        value={undefined}
        onChange={jest.fn()}
        enabled={false}
        parentLabel="Workbook, Worksheet"
        formValues={{}}
        onChangeField={jest.fn()}
      />,
    );
    expect(
      screen.getByTestId("spreadsheet-rows-values-parent-missing").textContent,
    ).toContain("Select Workbook, Worksheet first");
    expect(mockFetchOptionsSource).not.toHaveBeenCalled();
  });
});
