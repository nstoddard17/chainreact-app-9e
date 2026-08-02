/**
 * The rendered three-state update editor (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * The pure rules live in `_updateModel.test.ts`. This suite covers what only
 * rendering can answer: that every detected column is actually offered, that
 * the three states are operable from a keyboard and distinguishable by a
 * screen reader, that opening never writes, and that the two refusal states
 * (duplicate heading, columns unavailable) refuse rather than guess.
 *
 * The editor is presentational, so nothing is mocked here at all — the
 * component under test is the component that ships.
 */
import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpreadsheetUpdateEditor } from "@/features/workflow-builder/config-modal/fields/spreadsheet/SpreadsheetUpdateEditor";
import type { DetectedColumn } from "@/features/workflow-builder/config-modal/fields/spreadsheet/_updateModel";

const COLUMNS: DetectedColumn[] = [
  { value: "Name", label: "Name", hint: "Column A" },
  { value: "Email", label: "Email", hint: "Column B" },
  { value: "Notes", label: "Notes", hint: "Column C" },
];

let committed: Array<Record<string, unknown> | undefined>;

function Harness({
  initial,
  columns = COLUMNS,
  columnsUnavailable = false,
}: {
  initial?: unknown;
  columns?: DetectedColumn[];
  columnsUnavailable?: boolean;
}) {
  const [value, setValue] = React.useState<unknown>(initial);
  return (
    <SpreadsheetUpdateEditor
      fieldName="values"
      columns={columns}
      value={value}
      onChange={(next) => {
        committed.push(next);
        setValue(next);
      }}
      columnsUnavailable={columnsUnavailable}
      sources={[]}
    />
  );
}

beforeEach(() => {
  committed = [];
});

describe("every detected column is offered", () => {
  it("shows a control for each column, not only the ones already configured", () => {
    render(<Harness initial={{ Name: "Ada" }} />);
    for (const column of ["Name", "Email", "Notes"]) {
      expect(
        screen.getByRole("radio", { name: `${column} — Leave unchanged` }),
      ).toBeInTheDocument();
    }
  });

  it("hydrates a saved record into the right states", () => {
    render(<Harness initial={{ Name: "Ada", Notes: "" }} />);
    expect(
      screen.getByRole("radio", { name: "Name — Set to a value" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Notes — Set to blank" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Email — Leave unchanged" }),
    ).toBeChecked();
    expect(screen.getByLabelText("Name — new value")).toHaveValue("Ada");
  });

  it("opening writes nothing, so the draft is never dirtied by looking at it", () => {
    render(<Harness initial={{ Name: "Ada", Notes: null }} />);
    expect(committed).toEqual([]);
  });

  it("shows the column's position hint alongside its name", () => {
    render(<Harness />);
    expect(screen.getByText("Column B")).toBeInTheDocument();
  });
});

describe("the three states are operable and distinguishable", () => {
  it("is fully keyboard-operable — arrow keys move within one column's group", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const unchanged = screen.getByRole("radio", {
      name: "Email — Leave unchanged",
    });
    unchanged.focus();
    expect(unchanged).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("radio", { name: "Email — Set to blank" }),
    ).toBeChecked();
    expect(committed.at(-1)).toEqual({ Email: "" });
  });

  it("names each radio with its COLUMN, so twenty columns are not twenty identical controls", () => {
    render(<Harness />);
    // Without the column in the accessible name, these would all read
    // "Set to blank" and a screen-reader user could not tell which cell
    // they were about to erase.
    expect(screen.getAllByRole("radio", { name: /Set to blank$/ })).toHaveLength(3);
    for (const column of ["Name", "Email", "Notes"]) {
      expect(
        screen.getByRole("radio", { name: `${column} — Set to blank` }),
      ).toBeInTheDocument();
    }
  });

  it("states each option in WORDS, never by colour or position alone", () => {
    render(<Harness />);
    const group = screen.getByTestId("spreadsheet-update-values-column-0");
    expect(within(group).getByText("Leave unchanged")).toBeInTheDocument();
    expect(within(group).getByText("Set to blank")).toBeInTheDocument();
    expect(within(group).getByText("Set to a value")).toBeInTheDocument();
    // And explains the consequence of each, since "blank" alone does not
    // say that it erases what is there.
    expect(
      within(group).getByText("Keep whatever is already in this cell."),
    ).toBeInTheDocument();
    expect(within(group).getByText("Empty this cell.")).toBeInTheDocument();
  });

  it("reveals the value input only for 'set to a value'", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByLabelText("Notes — new value")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Notes — Set to a value" }));
    expect(screen.getByLabelText("Notes — new value")).toBeInTheDocument();
  });

  it("commits omitted / blank / value as three different configs", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Notes — Set to blank" }));
    expect(committed.at(-1)).toEqual({ Notes: "" });

    await user.click(screen.getByRole("radio", { name: "Name — Set to a value" }));
    await user.type(screen.getByLabelText("Name — new value"), "Ada");
    expect(committed.at(-1)).toEqual({ Notes: "", Name: "Ada" });

    // Back to unchanged: the key disappears entirely.
    await user.click(screen.getByRole("radio", { name: "Notes — Leave unchanged" }));
    expect(committed.at(-1)).toEqual({ Name: "Ada" });
  });

  it("dropping every change answers undefined rather than an empty record", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ Name: "Ada" }} />);
    await user.click(screen.getByRole("radio", { name: "Name — Leave unchanged" }));
    expect(committed.at(-1)).toBeUndefined();
  });

  it("nests no interactive control inside another", () => {
    render(<Harness initial={{ Name: "Ada" }} />);
    for (const el of document.querySelectorAll("button")) {
      expect(el.querySelector("button, input, select, textarea")).toBeNull();
    }
  });
});

describe("an unfinished 'set to a value' is never quietly resolved", () => {
  it("keeps the input on screen but commits nothing until a value is given", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Notes — Set to a value" }));
    // The intent is remembered — the box is there to type in…
    expect(screen.getByLabelText("Notes — new value")).toBeInTheDocument();
    // …but nothing has been written, so the column is still left alone.
    expect(committed.at(-1)).toBeUndefined();
  });

  it("does NOT downgrade it to 'set to blank' — the destructive reading", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Notes — Set to a value" }));
    // `{Notes: ""}` would clear the customer's cell. That is exactly the
    // silent conversion the three-state model exists to prevent.
    expect(committed.at(-1)).not.toEqual({ Notes: "" });
  });

  it("says so, in words, naming the column and both real choices", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Notes — Set to a value" }));
    const alert = screen.getByTestId("spreadsheet-update-values-incomplete");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert.textContent).toContain("Notes");
    expect(alert.textContent).toMatch(/or set it to blank/i);
    expect(alert.textContent).toMatch(/left exactly as it is/i);
  });

  it("clears once a value is typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Notes — Set to a value" }));
    await user.type(screen.getByLabelText("Notes — new value"), "checked");
    expect(screen.queryByTestId("spreadsheet-update-values-incomplete")).toBeNull();
    expect(committed.at(-1)).toEqual({ Notes: "checked" });
  });

  it("emptying a saved value returns the column to 'leave unchanged', not to blank", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ Notes: "checked" }} />);
    await user.clear(screen.getByLabelText("Notes — new value"));
    expect(committed.at(-1)).toBeUndefined();
    expect(committed.at(-1)).not.toEqual({ Notes: "" });
    // Still on screen and still flagged — the user's intent is intact.
    expect(screen.getByLabelText("Notes — new value")).toBeInTheDocument();
    expect(
      screen.getByTestId("spreadsheet-update-values-incomplete"),
    ).toBeInTheDocument();
  });

  it("choosing blank instead resolves it and commits the clear", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Notes — Set to a value" }));
    await user.click(screen.getByRole("radio", { name: "Notes — Set to blank" }));
    expect(committed.at(-1)).toEqual({ Notes: "" });
    expect(screen.queryByTestId("spreadsheet-update-values-incomplete")).toBeNull();
  });
});

describe("duplicate headings are refused, not guessed at", () => {
  const DUPLICATES: DetectedColumn[] = [
    { value: "Name", label: "Name" },
    { value: "Email", label: "Email" },
    { value: "Name", label: "Name" },
  ];

  it("offers neither duplicate as a selectable target", () => {
    render(<Harness columns={DUPLICATES} />);
    expect(
      screen.queryByRole("radio", { name: "Name — Set to a value" }),
    ).toBeNull();
    // The unambiguous column is unaffected.
    expect(
      screen.getByRole("radio", { name: "Email — Set to a value" }),
    ).toBeInTheDocument();
  });

  it("explains why, and names the fix the user can carry out in Excel", () => {
    render(<Harness columns={DUPLICATES} />);
    const notice = screen.getByTestId("spreadsheet-update-values-ambiguous-0");
    expect(notice.textContent).toMatch(/more than one column/i);
    expect(notice.textContent).toMatch(/different heading/i);
  });

  it("still SHOWS both duplicates — a customer's column is never hidden", () => {
    render(<Harness columns={DUPLICATES} />);
    expect(
      screen.getByTestId("spreadsheet-update-values-column-0"),
    ).toHaveAttribute("data-ambiguity", "duplicate-name");
    expect(
      screen.getByTestId("spreadsheet-update-values-column-2"),
    ).toHaveAttribute("data-ambiguity", "duplicate-name");
  });

  it("treats headings that differ only by spacing as ambiguous too", () => {
    render(
      <Harness
        columns={[
          { value: "Name", label: "Name" },
          { value: "Name ", label: "Name" },
        ]}
      />,
    );
    expect(
      screen.getByTestId("spreadsheet-update-values-column-1"),
    ).toHaveAttribute("data-ambiguity", "duplicate-label");
  });

  it("a lone heading with stray spacing stays usable, and says so", () => {
    render(<Harness columns={[{ value: "Name ", label: "Name" }]} />);
    expect(
      screen.getByRole("radio", { name: "Name — Set to a value" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("spreadsheet-update-values-whitespace-0").textContent,
    ).toMatch(/extra spacing/i);
  });
});

describe("stale saved columns are preserved and explained", () => {
  it("shows a saved key that is no longer in the worksheet", () => {
    render(<Harness initial={{ Name: "Ada", Phone: "555" }} />);
    const stale = screen.getByTestId("spreadsheet-update-values-stale");
    expect(within(stale).getByText("Phone")).toBeInTheDocument();
    expect(stale.textContent).toMatch(/run will fail/i);
  });

  it("does not delete it on its own — removal is an explicit user action", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ Name: "Ada", Phone: "555" }} />);
    expect(committed).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Remove Phone" }));
    expect(committed.at(-1)).toEqual({ Name: "Ada" });
  });

  it("keeps it through an unrelated edit", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ Phone: "555" }} />);
    await user.click(screen.getByRole("radio", { name: "Notes — Set to blank" }));
    expect(committed.at(-1)).toEqual({ Phone: "555", Notes: "" });
  });
});

describe("a resolver failure never paints blank controls over saved data", () => {
  it("refuses to render controls when columns are unavailable and a record is saved", () => {
    render(
      <Harness initial={{ Name: "Ada" }} columns={[]} columnsUnavailable />,
    );
    expect(
      screen.getByTestId("spreadsheet-update-values-record-needs-columns"),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    // Crucially: nothing was committed, so the saved record is intact.
    expect(committed).toEqual([]);
  });

  it("says the sheet has no headings when that is genuinely the case", () => {
    render(<Harness columns={[]} />);
    expect(
      screen.getByTestId("spreadsheet-update-values-no-columns"),
    ).toBeInTheDocument();
    // No invented column names.
    expect(document.body.textContent).not.toMatch(/Name|Email|Notes/);
  });
});

describe("the preview is honest about a change it cannot see the other side of", () => {
  it("titles itself as the change, never as the resulting row", () => {
    render(<Harness initial={{ Name: "Ada" }} />);
    const preview = screen.getByTestId("spreadsheet-preview-values");
    expect(preview.textContent).toContain("Changes we");
    expect(preview.textContent).not.toMatch(/the row we|current|before/i);
  });

  it("says a cleared column will be emptied rather than showing nothing", () => {
    render(<Harness initial={{ Notes: "" }} />);
    expect(
      screen.getByTestId("spreadsheet-preview-values").textContent,
    ).toContain("will be emptied");
  });

  it("states how many columns are left alone", () => {
    render(<Harness initial={{ Name: "Ada" }} />);
    expect(
      screen.getByTestId("spreadsheet-preview-values-unchanged").textContent,
    ).toMatch(/2 other columns keep whatever is already in them/);
  });
});
