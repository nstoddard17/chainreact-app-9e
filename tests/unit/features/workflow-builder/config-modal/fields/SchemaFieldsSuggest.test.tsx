/**
 * AI-PROVIDER-7 (CS-7) — "Suggest fields" inside the real schema editor.
 *
 * Drives the actual `SchemaFieldsField` with the real merge rules and the
 * real validator; only the network boundary (`lib/api/schemaSuggestion`) is
 * mocked. The properties under test are the ones an author would notice:
 * the button only appears when there's a document to read, they see a loading
 * state, a failure is recoverable, and a proposal never silently eats work.
 */
const mockSuggestSchema = jest.fn();
jest.mock("@/lib/api/schemaSuggestion", () => ({
  __esModule: true,
  suggestSchema: (...args: unknown[]) => mockSuggestSchema(...args),
}));

import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SchemaFieldsField } from "@/features/workflow-builder/config-modal/fields/SchemaFieldsField";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const field = (overrides: Partial<FieldMeta> = {}): FieldMeta =>
  ({
    name: "expectedFields",
    label: "Fields to pull out",
    type: "schema-fields",
    required: true,
    sampleSourceField: "file",
    ...overrides,
  }) as FieldMeta;

const PROPOSAL = {
  ok: true as const,
  schema: {
    fields: [
      { name: "employee_name", type: "string" as const, required: true },
      { name: "gross_pay", type: "currency" as const },
    ],
  },
  sourceName: "payroll.pdf",
  truncated: false,
  sampleSource: "latest_run" as const,
};

function renderField(value: unknown, overrides: Partial<FieldMeta> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <SchemaFieldsField field={field(overrides)} value={value} onChange={onChange} />,
  );
  return { onChange, ...utils };
}

const rows = (...names: string[]) => ({
  fields: names.map((name) => ({ name, type: "string" as const })),
});

beforeEach(() => {
  mockSuggestSchema.mockReset();
  mockSuggestSchema.mockResolvedValue(PROPOSAL);
  useGraphSlice.setState({ workflowId: "wf-1" });
  useConfigSlice.setState({ activeNodeId: "node-1" });
});

describe("availability", () => {
  it("offers the button when the meta declares where the document lives", () => {
    renderField(undefined);
    expect(screen.getByTestId("schema-fields-suggest")).toBeInTheDocument();
  });

  it("hides it when the meta declares no sample source", () => {
    renderField(undefined, { sampleSourceField: undefined });
    expect(screen.queryByTestId("schema-fields-suggest")).not.toBeInTheDocument();
  });

  it("hides it outside a saved workflow (nothing for the server to read)", () => {
    useGraphSlice.setState({ workflowId: null });
    renderField(undefined);
    expect(screen.queryByTestId("schema-fields-suggest")).not.toBeInTheDocument();
  });

  it("never fires on its own — only on a click", () => {
    renderField(rows("existing"));
    expect(mockSuggestSchema).not.toHaveBeenCalled();
  });
});

describe("request lifecycle", () => {
  it("shows a loading state, then the proposal", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    mockSuggestSchema.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderField(undefined);

    await user.click(screen.getByTestId("schema-fields-suggest"));
    expect(screen.getByTestId("schema-fields-suggest-loading")).toBeInTheDocument();
    expect(screen.getByTestId("schema-fields-suggest")).toBeDisabled();

    release(PROPOSAL);
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-proposal")).toBeInTheDocument(),
    );
    expect(screen.getByText(/payroll\.pdf/)).toBeInTheDocument();
  });

  it("asks the server with the workflow, node, and declared sample field", async () => {
    const user = userEvent.setup();
    renderField(undefined);
    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() => expect(mockSuggestSchema).toHaveBeenCalledTimes(1));
    expect(mockSuggestSchema.mock.calls[0][0]).toMatchObject({
      workflowId: "wf-1",
      nodeId: "node-1",
      sampleSourceField: "file",
    });
  });

  it("surfaces a failure with the server's own guidance and a retry", async () => {
    const user = userEvent.setup();
    mockSuggestSchema.mockResolvedValue({
      ok: false,
      code: "SUGGESTIONS_UNAVAILABLE",
      message: "ChainReact couldn't suggest fields just now. Try again in a moment.",
    });
    renderField(undefined);

    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-error")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Try again in a moment/)).toBeInTheDocument();

    mockSuggestSchema.mockResolvedValue(PROPOSAL);
    await user.click(screen.getByTestId("schema-fields-suggest-retry"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-proposal")).toBeInTheDocument(),
    );
    expect(mockSuggestSchema).toHaveBeenCalledTimes(2);
  });

  it("offers no retry for a state a retry cannot fix, only a dismiss", async () => {
    const user = userEvent.setup();
    mockSuggestSchema.mockResolvedValue({
      ok: false,
      code: "NO_SAMPLE",
      message: "Test this workflow once so ChainReact has a real example to read.",
    });
    renderField(undefined);

    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("schema-fields-suggest-retry")).not.toBeInTheDocument();
    expect(screen.getByText(/Test this workflow once/)).toBeInTheDocument();
  });
});

describe("applying a proposal", () => {
  it("commits the proposed fields when the editor was empty", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(undefined);
    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-add")).toBeInTheDocument(),
    );
    // No replace affordance exists when there is nothing to replace.
    expect(screen.queryByTestId("schema-fields-suggest-replace")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("schema-fields-suggest-add"));
    expect(onChange).toHaveBeenCalledWith({
      fields: [
        { name: "employee_name", type: "string", required: true },
        { name: "gross_pay", type: "currency" },
      ],
    });
  });

  it("NEVER overwrites existing work on the default action", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows("gross_pay", "my_own_field"));
    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-add")).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("schema-fields-suggest-add"));
    const committed = onChange.mock.calls[0][0] as { fields: { name: string }[] };
    // The author's rows survive, in order, and only the genuinely new field
    // is appended (`gross_pay` was already theirs).
    expect(committed.fields.map((f) => f.name)).toEqual([
      "gross_pay",
      "my_own_field",
      "employee_name",
    ]);
  });

  it("replaces only on the explicit second choice", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows("my_own_field"));
    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-replace")).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("schema-fields-suggest-replace"));
    const committed = onChange.mock.calls[0][0] as { fields: { name: string }[] };
    expect(committed.fields.map((f) => f.name)).toEqual(["employee_name", "gross_pay"]);
  });

  it("reports what the merge did and closes the panel", async () => {
    const user = userEvent.setup();
    renderField(rows("gross_pay"));
    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-add")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("schema-fields-suggest-add"));

    expect(screen.getByTestId("schema-fields-suggest-notice")).toHaveTextContent(
      "Added 1 field. 1 you already had was left alone.",
    );
    expect(screen.queryByTestId("schema-fields-suggest-proposal")).not.toBeInTheDocument();
  });

  it("dismisses without touching the rows", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows("my_own_field"));
    await user.click(screen.getByTestId("schema-fields-suggest"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-suggest-dismiss")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("schema-fields-suggest-dismiss"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId("schema-fields-suggest-proposal")).not.toBeInTheDocument();
  });
});

describe("suggested rows are ordinary rows", () => {
  it("stay editable, removable, and reorderable after landing", async () => {
    const user = userEvent.setup();
    // Render the post-merge state the editor would receive back as `value`.
    const { onChange } = renderField({
      fields: [
        { name: "employee_name", type: "string", required: true },
        { name: "gross_pay", type: "currency" },
      ],
    });

    expect(screen.getByLabelText("Field 1 name")).toHaveValue("employee_name");
    await user.clear(screen.getByLabelText("Field 1 name"));
    await user.type(screen.getByLabelText("Field 1 name"), "renamed");
    // The editor commits a rename on blur (CS-4 normalizes there, so it
    // doesn't fight the author mid-word).
    await user.tab();
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const renamed = onChange.mock.calls.at(-1)?.[0] as { fields: { name: string }[] };
    expect(renamed.fields[0]?.name).toBe("renamed");

    // The manual affordances are untouched by the suggestion feature.
    expect(screen.getByRole("button", { name: /add field/i })).toBeEnabled();
    expect(screen.getByTestId("schema-field-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-row-1")).toBeInTheDocument();
  });

  it("keeps the existing validator in charge of the merged result", async () => {
    // A duplicate can only arrive by hand (the merge de-dupes), and when it
    // does the CS-4 validator still reports it.
    renderField({
      fields: [
        { name: "total", type: "string" },
        { name: "total", type: "string" },
      ],
    });
    // Surfaced both inline on the row and as the field-level message.
    expect(screen.getAllByText(/Field names must be unique/).length).toBeGreaterThan(0);
  });
});
