/**
 * Guided spreadsheet panel — control presence and accessibility
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * This is the assertion class the browser sweep is structurally
 * incapable of carrying (responsive-layout-and-validation.md §D):
 * geometry measures boxes that exist and is silent about a box that
 * stopped existing. The marketing nav proved a fully green sweep can
 * sit on a page whose navigation is gone.
 *
 * The guided panel's defence is structural — it renders ONE element
 * tree at every width, with no breakpoint-scoped visibility (pinned by
 * tests/structure/guided-spreadsheet-config-source.test.ts). This suite
 * carries the behavioural half: every step, every control the panel
 * promises, and the Advanced escape hatch are present and OPERABLE,
 * with the semantics a keyboard and a screen reader need.
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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidedConfigLayout } from "@/features/workflow-builder/config-modal/guided/GuidedConfigLayout";
import { getGuidedSpreadsheetAdapter } from "@/features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters";
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";

const adapter = getGuidedSpreadsheetAdapter("google-sheets:append_row")!;

const CONFIGURED = {
  spreadsheetId: "sheet-1",
  sheetName: "Email log",
  values: ["2026-07-31", "", "Invoice"],
  valueInputOption: "USER_ENTERED",
  range: "'Email log'!A:C",
};

function Harness({ initial = CONFIGURED }: { initial?: Record<string, unknown> }) {
  const [values, setValues] = React.useState<Record<string, unknown>>(initial);
  return (
    <GuidedConfigLayout
      adapter={adapter}
      fields={googleSheetsAppendRowMeta.fields}
      values={values}
      errors={{}}
      onChange={(name, value) =>
        setValues((prev) => ({ ...prev, [name]: value }))
      }
    />
  );
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockResolvedValue({
    ok: true,
    source: "google-sheets:columns",
    items: [
      { value: "Timestamp", label: "Timestamp", description: "Column A" },
      { value: "From", label: "From", description: "Column B" },
      { value: "Subject", label: "Subject", description: "Column C" },
    ],
    hasMore: false,
  });
  mockUpstream.mockReset();
  mockUpstream.mockReturnValue({
    sources: [],
    loading: false,
    latestValuesBySource: {},
  });
});

describe("every step the panel promises is present and reachable", () => {
  it("renders all three steps regardless of viewport — one DOM, no hidden controls", () => {
    render(<Harness />);
    // The panel renders the same tree at every width; there is no width
    // input to vary, which is exactly the guarantee.
    for (const step of ["destination", "mapping", "write"]) {
      expect(screen.getByTestId(`guided-step-${step}`)).toBeInTheDocument();
      expect(
        screen.getByTestId(`guided-step-${step}-header`),
      ).toBeInTheDocument();
    }
  });

  it("lets a keyboard user open any step and read its state without a pointer", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const writeHeader = screen.getByTestId("guided-step-write-header");
    expect(writeHeader).toHaveAttribute("aria-expanded", "false");

    writeHeader.focus();
    expect(writeHeader).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(writeHeader).toHaveAttribute("aria-expanded", "true");

    // Space is the other key a button must honour.
    await user.keyboard(" ");
    expect(writeHeader).toHaveAttribute("aria-expanded", "false");
  });

  it("ties each step header to the region it controls", () => {
    render(<Harness />);
    for (const step of ["destination", "mapping", "write"]) {
      const header = screen.getByTestId(`guided-step-${step}-header`);
      const controlled = header.getAttribute("aria-controls");
      expect(controlled).toBeTruthy();
      const region = document.getElementById(controlled!);
      expect(region).not.toBeNull();
      expect(region).toHaveAttribute("role", "region");
      // The region is named by its header, so a screen reader announces
      // which step it just entered.
      expect(region).toHaveAttribute("aria-labelledby", header.id);
    }
  });

  it("states completion in words, never by colour alone", () => {
    render(<Harness />);
    const header = screen.getByTestId("guided-step-destination-header");
    // A tick glyph and a tint are reinforcement; the text is the signal.
    expect(within(header).getByText("Done")).toBeInTheDocument();
  });

  it("keeps a live summary of each collapsed step, so nothing is hidden behind a chevron", () => {
    render(<Harness />);
    expect(
      screen.getByTestId("guided-step-destination-summary"),
    ).toHaveTextContent("Email log");
    expect(screen.getByTestId("guided-step-write-summary")).toHaveTextContent(
      /like something you typed in/i,
    );
  });
});

describe("write-behavior controls carry real radio semantics", () => {
  it("groups the options and names the group", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("guided-step-write-header"));

    const groups = screen.getAllByRole("radiogroup");
    expect(groups.length).toBe(2);
    for (const group of groups) {
      expect(group.getAttribute("aria-label")).toBeTruthy();
    }
    // Each option is a real radio, so arrow keys and screen readers work.
    expect(
      screen.getByRole("radio", { name: /like something you typed in/i }),
    ).toBeInTheDocument();
  });

  it("does not nest an interactive control inside another", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("guided-step-write-header"));
    // A button inside a button (or a radio inside a button) is unreachable
    // for keyboard users and ambiguous for assistive tech.
    for (const el of document.querySelectorAll("button")) {
      expect(el.querySelector("button, input, select, textarea")).toBeNull();
    }
  });
});

describe("the Advanced escape hatch is never the casualty of a narrow panel", () => {
  it("keeps the raw cell range out of the guided steps but still declared on the action", () => {
    render(<Harness />);
    // It is deliberately NOT drawn inside the three guided steps…
    expect(
      screen.queryByRole("textbox", { name: /^cell range$/i }),
    ).toBeNull();
    // …because it belongs to the Advanced tab, which the config shell renders
    // at every width. Losing the field from the metadata entirely would strand
    // the power case, so the contract is pinned here.
    const range = googleSheetsAppendRowMeta.fields.find(
      (f) => f.name === "range",
    );
    expect(range?.advanced).toBe(true);
    expect(range?.required).toBe(true);
  });
});
