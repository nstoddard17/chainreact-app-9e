/**
 * Tests for JsonField (CONFIG-UX-AUDIT-2) — the advanced JSON escape
 * hatch renderer. User-facing behavior:
 *   - valid JSON commits the PARSED value (array/object), never a string;
 *   - invalid JSON keeps the typed text on screen, shows friendly copy,
 *     and commits the raw string (which the Save gate blocks on);
 *   - pure {{...}} variables commit as the string token;
 *   - hydrates from a saved parsed value (pretty-printed for editing);
 *   - no parser/renderer internals ever render.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { JsonField } from "@/features/workflow-builder/config-modal/fields/JsonField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "blocks",
    label: "Blocks",
    type: "json",
    required: true,
    advanced: true,
    jsonShape: "array",
    ...overrides,
  } as FieldMeta;
}

describe("JsonField", () => {
  it("valid array text commits a REAL array (never a JSON-encoded string)", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<JsonField field={field()} value={undefined} onChange={onChange} />);

    await user.click(screen.getByTestId("json-field-blocks"));
    await user.paste('[{"type":"section"}]');
    const committed = onChange.mock.lastCall![0];
    expect(committed).toEqual([{ type: "section" }]);
    expect(typeof committed).not.toBe("string");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("valid object text commits a REAL object for jsonShape 'object'", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <JsonField
        field={field({ name: "automaticTax", jsonShape: "object" })}
        value={undefined}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("json-field-automaticTax"));
    await user.paste('{"enabled": true}');
    expect(onChange.mock.lastCall![0]).toEqual({ enabled: true });
  });

  it("invalid JSON keeps the typed text, shows friendly copy, commits the raw draft string, leaks no internals", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<JsonField field={field()} value={undefined} onChange={onChange} />);

    const textarea = screen.getByTestId("json-field-blocks");
    await user.click(textarea);
    await user.paste('[{"type": "section"');

    // Typed text survives on screen.
    expect(textarea).toHaveValue('[{"type": "section"');
    // Friendly copy only.
    expect(screen.getByText(/this needs valid json/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /SyntaxError|Unexpected token|zod|renderer/i,
    );
    // Raw string committed so the Save gate can block on it.
    expect(onChange.mock.lastCall![0]).toBe('[{"type": "section"');
  });

  it("shape mismatch shows friendly copy (list expected)", async () => {
    const user = userEvent.setup();
    render(<JsonField field={field()} value={undefined} onChange={jest.fn()} />);
    await user.click(screen.getByTestId("json-field-blocks"));
    await user.paste('{"type":"section"}');
    expect(screen.getByText(/needs a list/i)).toBeInTheDocument();
  });

  it("a pure {{...}} variable commits as the string token with no error", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<JsonField field={field()} value={undefined} onChange={onChange} />);
    await user.click(screen.getByTestId("json-field-blocks"));
    await user.paste("{{trigger.payload.blocks}}");
    expect(onChange.mock.lastCall![0]).toBe("{{trigger.payload.blocks}}");
    expect(screen.queryByText(/valid json|needs a list/i)).not.toBeInTheDocument();
  });

  it("clearing the field commits undefined", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <JsonField field={field()} value={[{ type: "s" }]} onChange={onChange} />,
    );
    await user.clear(screen.getByTestId("json-field-blocks"));
    expect(onChange.mock.lastCall![0]).toBeUndefined();
  });

  it("hydrates from a saved parsed value as pretty-printed editable text", () => {
    render(
      <JsonField
        field={field()}
        value={[{ type: "section" }]}
        onChange={jest.fn()}
      />,
    );
    const textarea = screen.getByTestId("json-field-blocks");
    expect(textarea).toHaveValue('[\n  {\n    "type": "section"\n  }\n]');
    expect(screen.queryByText(/valid json/i)).not.toBeInTheDocument();
  });
});
