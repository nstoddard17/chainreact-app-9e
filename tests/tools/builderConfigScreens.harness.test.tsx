/**
 * SPREADSHEET-GUIDED-CONFIG-S3 — guided node-configuration panel visual harness.
 *
 * Same approach as the accepted harnesses: render the REAL components with
 * synthetic fixtures, write the markup to `owner-review/html/bcfg-*.html`, and
 * let `scripts/responsive/measure-app-shell.mjs` wrap it and measure
 * continuously from 360→1600 in Chromium.
 *
 * WHY THIS SURFACE, NOW. S1 and S2 both recorded the same honest limitation:
 * the guided panel had no emitter, so `npm run verify:responsive` had never
 * measured it. Until now its content was short and uniform — three steps, a
 * handful of cells. Update Row changes that: a worksheet with twenty columns
 * produces twenty stacked control groups inside a surface that is an OVERLAY
 * SHEET below 1280px (`builderLayoutPolicy.configPresentation`). That is the
 * first guided surface with genuinely unbounded vertical AND horizontal
 * content, which is exactly the condition the sweep exists to measure. The
 * fixture therefore lands BEFORE the editor it has to hold.
 *
 * WHAT IS REAL HERE. `GuidedConfigLayout`, `GuidedStepSection`,
 * `GuidedDestinationStep`, `GuidedWriteStep`, `SchemaForm`, every field
 * renderer including `SpreadsheetRowsField`, and the shipped `ActionMeta` of
 * the actions themselves. Only two things are stubbed, both at the NETWORK
 * boundary the components already treat as external: `fetchOptionsSource`
 * (the options route) and the upstream-variables hook (which reads run state
 * this harness has no builder around to provide). Nothing about layout,
 * wrapping, truncation or control presence is simulated — a simplified mock
 * panel could not catch the regressions this exists to catch.
 *
 * THE HOST IS THE REAL HOST. `DrawerHost` mirrors `BuilderRightDrawer`'s two
 * presentations exactly: `w-[min(24rem,92vw)]` as the overlay sheet below
 * 1280px, `w-[380px]` in-flow at and above it. Measuring the 380px column at
 * 360px would be measuring a state the builder never produces.
 *
 * FIXTURE SAFETY: every value is synthetic. No production payloads, customer
 * data, emails, tokens, keys, secrets or signed URLs.
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
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GuidedConfigLayout } from "@/features/workflow-builder/config-modal/guided/GuidedConfigLayout";
import { getGuidedSpreadsheetAdapter } from "@/features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters";
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";
import { microsoftExcelAddRowMeta } from "@/integrations/microsoft-excel/actions/addRow.meta";
import type { ActionMeta } from "@/contracts/actionMeta";

const OUT = join(process.cwd(), "owner-review", "html");

// ── Synthetic content at the widest realistic forms ──────────────────────────

/**
 * A twenty-column worksheet with names as long as a real finance team writes
 * them. This is the state the whole fixture exists for: the panel is 331px of
 * usable width at 360px, and every one of these has to stay contained,
 * readable and reachable inside it.
 */
const WIDE_COLUMNS: readonly string[] = [
  "Invoice number",
  "Customer account name as recorded in the billing system",
  "Billing contact",
  "Purchase order reference",
  "Invoice date",
  "Payment due date",
  "Net amount excluding sales tax",
  "Sales tax rate applied",
  "Total amount including all applicable taxes and adjustments",
  "Currency",
  "Payment status",
  "Days outstanding",
  "Collections owner",
  "Escalation tier",
  "Dispute reason code",
  "Credit note reference",
  "Reconciliation batch identifier",
  "Ledger account code",
  "Cost centre",
  "Notes from the collections review meeting",
];

const SHORT_COLUMNS: readonly string[] = ["Date", "Customer", "Amount", "Status"];

function columnItems(names: readonly string[]) {
  return names.map((name, i) => ({
    value: name,
    label: name,
    description: `Column ${String.fromCharCode(65 + (i % 26))}`,
  }));
}

const LONG_WORKBOOK =
  "FY26 Q3 accounts receivable reconciliation and collections tracker";
const LONG_WORKSHEET = "Outstanding invoices — collections review";

// ── Options + upstream stubs ────────────────────────────────────────────────

type OptionsResponse =
  | { ok: true; source: string; items: ReturnType<typeof columnItems>; hasMore: boolean }
  | { ok: false; source: string; code: string; message: string };

/** Which resolver answers with what, per fixture state. */
function respondWith(columns: readonly string[] | "error" | "empty") {
  mockFetchOptionsSource.mockImplementation(
    async (source: string): Promise<OptionsResponse> => {
      const isColumns =
        source === "microsoft-excel:worksheet_columns" ||
        source === "google-sheets:columns";
      if (!isColumns) {
        // Destination pickers: a short, honest list.
        return {
          ok: true,
          source,
          items: [
            { value: "wb-1", label: LONG_WORKBOOK, description: "OneDrive" },
            { value: "wb-2", label: "Weekly ops log", description: "OneDrive" },
          ],
          hasMore: false,
        };
      }
      if (columns === "error") {
        return {
          ok: false,
          source,
          code: "PROVIDER_ERROR",
          message: "Couldn't read the worksheet's columns. Try again.",
        };
      }
      if (columns === "empty") {
        return { ok: true, source, items: [], hasMore: false };
      }
      return { ok: true, source, items: columnItems(columns), hasMore: false };
    },
  );
}

const UPSTREAM_SOURCES = [
  {
    sourceId: "trigger",
    label: "When a new invoice is created",
    outputs: [
      { name: "invoiceNumber", label: "Invoice number", path: "invoiceNumber" },
      { name: "customer", label: "Customer", path: "customer" },
      { name: "total", label: "Total", path: "total" },
    ],
  },
];

const UPSTREAM_LATEST = {
  trigger: {
    invoiceNumber: "INV-2026-004182",
    customer: "Northwind Traders (EMEA) Limited",
    total: 18425.5,
  },
};

// ── The real drawer host ────────────────────────────────────────────────────

/**
 * `BuilderRightDrawer`'s two presentations, expressed in flow so they stay
 * measurable. Below 1280px node configuration is an overlay sheet capped at
 * `min(24rem, 92vw)`; at and above it, the in-flow 380px column. Both come
 * straight from the shipped component — see `BuilderRightDrawer.tsx` and
 * `builderLayoutPolicy.configPresentation`.
 */
function DrawerHost({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0" style={{ height: "900px" }}>
      <div className="min-w-0 flex-1" />
      <section
        data-testid="builder-right-drawer"
        className="flex w-[min(24rem,92vw)] flex-col border-l xl:w-[380px] xl:shrink-0"
        style={{
          background: "var(--builder-panel)",
          borderColor: "var(--builder-border)",
          minHeight: 0,
        }}
      >
        <header
          data-testid="builder-right-drawer-header"
          className="relative z-30 flex items-center justify-between gap-3 border-b px-3 py-2.5"
          style={{ borderColor: "var(--builder-border)" }}
        >
          <h2 className="truncate text-[13px] font-semibold">Add Row</h2>
          <button
            type="button"
            aria-label="Close drawer"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border text-[15px] leading-none"
            style={{ borderColor: "var(--builder-border)" }}
          >
            ×
          </button>
        </header>
        <div
          className="flex min-w-0 flex-1 flex-col overflow-y-auto"
          style={{ minHeight: 0 }}
        >
          <section
            aria-label="Setup fields"
            data-testid="config-setup-body"
            className="flex min-w-0 flex-col gap-3 p-3"
          >
            {children}
          </section>
        </div>
      </section>
    </div>
  );
}

interface PanelProps {
  readonly meta: ActionMeta;
  readonly initial: Record<string, unknown>;
}

function Panel({ meta, initial }: PanelProps) {
  const adapter = getGuidedSpreadsheetAdapter(meta.key)!;
  const [values, setValues] = React.useState<Record<string, unknown>>(initial);
  return (
    <DrawerHost>
      <GuidedConfigLayout
        adapter={adapter}
        fields={meta.fields}
        values={values}
        errors={{}}
        onChange={(name, value) =>
          setValues((prev) => ({ ...prev, [name]: value }))
        }
      />
    </DrawerHost>
  );
}

// ── emit ────────────────────────────────────────────────────────────────────

/**
 * Write one fixture state and assert it is substantial. An emitter that
 * silently writes an empty box is how a green sweep starts lying.
 */
function emit(name: string, container: HTMLElement): void {
  mkdirSync(OUT, { recursive: true });
  const node = container.querySelector('[data-testid="builder-right-drawer"]');
  expect(node).not.toBeNull();
  const html = (node as Element).outerHTML;
  writeFileSync(join(OUT, `${name}.html`), html, "utf8");
  expect(html.length).toBeGreaterThan(1000);
  expect(html).toContain("guided-config-layout");
}

/**
 * The control-presence assertion geometry cannot make (rule §D). Every state
 * this harness emits must still offer all three steps and their headers — a
 * step that stopped rendering would measure perfectly and be unreachable.
 */
function expectAllThreeStepsReachable(): void {
  for (const step of ["destination", "mapping", "write"]) {
    const header = screen.getByTestId(`guided-step-${step}-header`);
    expect(header).toBeInTheDocument();
    expect(header.getAttribute("aria-controls")).toBeTruthy();
    const region = document.getElementById(header.getAttribute("aria-controls")!);
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("role", "region");
  }
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
  mockUpstream.mockReset();
  mockUpstream.mockReturnValue({
    sources: UPSTREAM_SOURCES,
    latestValuesBySource: UPSTREAM_LATEST,
  });
  respondWith(SHORT_COLUMNS);
});

// ── states ──────────────────────────────────────────────────────────────────

describe("guided configuration panel — emitted responsive states", () => {
  it("bcfg-01 — step 1 open, nothing chosen yet", async () => {
    const { container } = render(
      <Panel meta={googleSheetsAppendRowMeta} initial={{}} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("guided-step-destination")).toHaveAttribute(
        "data-open",
        "true",
      ),
    );
    expectAllThreeStepsReachable();
    // The destination pickers and the "paste a link" escape hatch are the
    // controls this step promises.
    expect(screen.getByTestId("guided-paste-link-open")).toBeInTheDocument();
    expect(screen.getByTestId("guided-next-mapping")).toBeInTheDocument();
    emit("bcfg-01-sheets-step1-empty", container);
  });

  it("bcfg-02 — step 2 open on a four-column tab with values and a preview", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Panel
        meta={googleSheetsAppendRowMeta}
        initial={{
          spreadsheetId: "wb-1",
          sheetName: LONG_WORKSHEET,
          range: `'${LONG_WORKSHEET}'!A:D`,
          values: ["{{trigger.invoiceNumber}}", "{{trigger.customer}}", "18425.5", ""],
          valueInputOption: "USER_ENTERED",
        }}
      />,
    );
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(screen.getByLabelText("Customer")).toBeInTheDocument(),
    );
    // The preview is a promised control: it must be present AND state its
    // provenance rather than implying untested data is real.
    const preview = screen.getByTestId("spreadsheet-preview-values");
    expect(preview).toHaveAttribute("data-provenance", "real");
    expectAllThreeStepsReachable();
    emit("bcfg-02-sheets-step2-values", container);
  });

  it("bcfg-03 — step 2 open on a TWENTY-column worksheet with long names", async () => {
    respondWith(WIDE_COLUMNS);
    const user = userEvent.setup();
    const { container } = render(
      <Panel
        meta={microsoftExcelAddRowMeta}
        initial={{
          workbookId: "wb-1",
          worksheetName: LONG_WORKSHEET,
          values: [
            "{{trigger.invoiceNumber}}",
            "{{trigger.customer}}",
            "billing@example.invalid",
          ],
        }}
      />,
    );
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(screen.getByLabelText(WIDE_COLUMNS[0]!)).toBeInTheDocument(),
    );
    // Every detected column has an input — none dropped at a narrow width.
    for (const column of WIDE_COLUMNS) {
      expect(screen.getByLabelText(column)).toBeInTheDocument();
    }
    expectAllThreeStepsReachable();
    emit("bcfg-03-excel-step2-wide", container);
  });

  it("bcfg-04 — step 3 open with the write-behavior choice and its warning", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Panel
        meta={googleSheetsAppendRowMeta}
        initial={{
          spreadsheetId: "wb-1",
          sheetName: LONG_WORKSHEET,
          range: `'${LONG_WORKSHEET}'!A:D`,
          values: ["a", "b", "c", "d"],
          valueInputOption: "USER_ENTERED",
          insertDataOption: "OVERWRITE",
        }}
      />,
    );
    await user.click(screen.getByTestId("guided-step-write-header"));
    await waitFor(() =>
      expect(
        screen.getByTestId("guided-write-insertDataOption-danger"),
      ).toBeInTheDocument(),
    );
    // Both radio groups present and named — the destructive one warns in words.
    const groups = screen.getAllByRole("radiogroup");
    expect(groups.length).toBe(2);
    for (const group of groups) {
      expect(group.getAttribute("aria-label")).toBeTruthy();
    }
    expectAllThreeStepsReachable();
    emit("bcfg-04-sheets-step3-danger", container);
  });

  it("bcfg-05 — step 3 open where the action has nothing to decide", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Panel
        meta={microsoftExcelAddRowMeta}
        initial={{
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          values: ["a", "b", "c", "d"],
        }}
      />,
    );
    await user.click(screen.getByTestId("guided-step-write-header"));
    await waitFor(() =>
      expect(screen.getByTestId("guided-write-empty")).toBeInTheDocument(),
    );
    expectAllThreeStepsReachable();
    emit("bcfg-05-excel-step3-empty", container);
  });

  it("bcfg-06 — the columns resolver failed; the panel says so and edits nothing", async () => {
    respondWith("error");
    const user = userEvent.setup();
    const { container } = render(
      <Panel
        meta={microsoftExcelAddRowMeta}
        initial={{ workbookId: "wb-1", worksheetName: LONG_WORKSHEET }}
      />,
    );
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByTestId("spreadsheet-rows-values-columns-error"),
      ).toBeInTheDocument(),
    );
    // A recovery affordance, not a dead end.
    expect(
      within(
        screen.getByTestId("spreadsheet-rows-values-columns-error"),
      ).getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expectAllThreeStepsReachable();
    emit("bcfg-06-excel-columns-error", container);
  });

  it("bcfg-07 — no column names in the sheet; honest fallback, no invented columns", async () => {
    respondWith("empty");
    const user = userEvent.setup();
    const { container } = render(
      <Panel
        meta={microsoftExcelAddRowMeta}
        initial={{ workbookId: "wb-1", worksheetName: "Sheet1" }}
      />,
    );
    await user.click(screen.getByTestId("guided-step-mapping-header"));
    await waitFor(() =>
      expect(
        screen.getByTestId("spreadsheet-rows-values-no-columns"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("1st column")).toBeInTheDocument();
    expectAllThreeStepsReachable();
    emit("bcfg-07-excel-no-columns", container);
  });
});
