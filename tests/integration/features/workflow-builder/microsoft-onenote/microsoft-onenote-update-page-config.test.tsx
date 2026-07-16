/**
 * CONFIG-UX sweep — OneNote `update_page` conditional-visibility config
 * shape as it flows into the WorkflowBuilder shell.
 *
 * Pins the `visibleWhen` gating added in the config-UX sweep: `target`
 * and `position` are only relevant when `updateMode === "insert"` (the
 * runtime schema's `.superRefine` requires `target` for insert and the
 * handler only reads `target`/`position` on the insert branch), so both
 * fields are gated on `visibleWhen: { field: "updateMode", valueIn:
 * ["insert"] }`. `target` is `required: true` under the
 * required-when-visible semantics (hidden ⇒ not a readiness gap).
 */

import { microsoftOneNoteUpdatePageMeta } from "@/integrations/microsoft-onenote/actions/updatePage.meta";
import {
  UpdatePageConfigSchema,
  UpdatePageUpdateModeSchema,
} from "@/integrations/microsoft-onenote/actions/updatePage.schema";
import { isVisibleWhenMet } from "@/contracts/actionMeta";

const field = (name: string) =>
  microsoftOneNoteUpdatePageMeta.fields.find((f) => f.name === name)!;

describe("OneNote update_page meta — insert-mode visibleWhen gating", () => {
  it("target is gated on updateMode === 'insert' and required-when-visible", () => {
    const target = field("target");
    expect(target.visibleWhen).toEqual({
      field: "updateMode",
      valueIn: ["insert"],
    });
    expect(target.required).toBe(true);
  });

  it("position is gated on updateMode === 'insert' (defaulted, optional)", () => {
    const position = field("position");
    expect(position.visibleWhen).toEqual({
      field: "updateMode",
      valueIn: ["insert"],
    });
    expect(position.required).toBe(false);
    expect(position.defaultValue).toBe("after");
  });

  it("visibleWhen valueIn values are real runtime updateMode enum values", () => {
    for (const f of [field("target"), field("position")]) {
      for (const v of f.visibleWhen!.valueIn!) {
        expect(UpdatePageUpdateModeSchema.options).toContain(v);
      }
    }
  });

  it("controller (updateMode) is a known sibling with NO visibleWhen of its own (single hop)", () => {
    const controller = field("updateMode");
    expect(controller).toBeDefined();
    expect(controller.visibleWhen).toBeUndefined();
  });

  it("visibility semantics: hidden for append/prepend/replace, visible for insert", () => {
    const target = field("target");
    for (const mode of ["append", "prepend", "replace"]) {
      expect(isVisibleWhenMet(target.visibleWhen, { updateMode: mode })).toBe(
        false,
      );
    }
    expect(
      isVisibleWhenMet(target.visibleWhen, { updateMode: "insert" }),
    ).toBe(true);
  });

  it("runtime parity: schema requires target for insert mode, tolerates its absence otherwise", () => {
    expect(() =>
      UpdatePageConfigSchema.parse({
        pageId: "p-1",
        updateMode: "insert",
        content: "<p>x</p>",
      }),
    ).toThrow(/target is required/);
    expect(() =>
      UpdatePageConfigSchema.parse({
        pageId: "p-1",
        updateMode: "append",
        content: "<p>x</p>",
      }),
    ).not.toThrow();
  });

  it("position options carry the runtime enum values with outcome labels", () => {
    const position = field("position");
    expect(position.options?.map((o) => o.value).sort()).toEqual([
      "after",
      "before",
      "inside",
    ]);
  });
});
