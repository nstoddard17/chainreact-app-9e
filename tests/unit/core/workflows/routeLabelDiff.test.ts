/** @jest-environment node */
import { describe, expect, it } from "@jest/globals";
import {
  classifyRouteLabelEdit,
  isWiringPreservingRename,
  type RouteLike,
} from "@/core/workflows/routeLabelDiff";

/**
 * 5.DUAL-BUILDER-1 CS-7 — the pure Router route-label edit classifier. Locks the
 * nine classifications the full Router editor + graphSlice depend on, and the
 * locked rule: ONLY an exact one-to-one rename is wiring-preserving.
 */

const route = (label: string, value: unknown = label): RouteLike => ({
  label,
  condition: { input: "{{trigger.x}}", operator: "equals", value },
});

describe("classifyRouteLabelEdit", () => {
  it("no_change when labels, order, and conditions are identical", () => {
    const rs = [route("hot"), route("warm")];
    expect(classifyRouteLabelEdit(rs, [route("hot"), route("warm")])).toEqual({
      kind: "no_change",
    });
  });

  it("reorder_only when the same routes swap position", () => {
    expect(
      classifyRouteLabelEdit([route("hot"), route("warm")], [route("warm"), route("hot")]),
    ).toEqual({ kind: "reorder_only" });
  });

  it("condition_only when a label's condition changes but labels/order hold", () => {
    expect(
      classifyRouteLabelEdit(
        [route("hot", "a"), route("warm", "b")],
        [route("hot", "CHANGED"), route("warm", "b")],
      ),
    ).toEqual({ kind: "condition_only" });
  });

  it("exact_rename when exactly one label changes and other routes are identical", () => {
    const diff = classifyRouteLabelEdit(
      [route("hot"), route("warm")],
      [route("scorching"), route("warm")],
    );
    expect(diff).toEqual({ kind: "exact_rename", oldLabel: "hot", newLabel: "scorching" });
    expect(isWiringPreservingRename(diff)).toBe(true);
  });

  it("exact_rename tolerates a simultaneous condition change on the renamed route", () => {
    const diff = classifyRouteLabelEdit(
      [route("hot", "a"), route("warm", "b")],
      [route("scorching", "DIFFERENT"), route("warm", "b")],
    );
    expect(diff).toEqual({ kind: "exact_rename", oldLabel: "hot", newLabel: "scorching" });
  });

  it("ambiguous_rename when one label changes AND another route also changes structurally", () => {
    const diff = classifyRouteLabelEdit(
      [route("hot", "a"), route("warm", "b")],
      [route("scorching", "a"), route("warm", "CHANGED")],
    );
    expect(diff).toEqual({ kind: "ambiguous_rename" });
    expect(isWiringPreservingRename(diff)).toBe(false);
  });

  it("multiple_rename when two labels change at once", () => {
    expect(
      classifyRouteLabelEdit(
        [route("hot"), route("warm")],
        [route("scorching"), route("tepid")],
      ),
    ).toEqual({ kind: "multiple_rename" });
  });

  it("addition when a route is added and none removed", () => {
    expect(
      classifyRouteLabelEdit([route("hot")], [route("hot"), route("warm")]),
    ).toEqual({ kind: "addition" });
  });

  it("removal when a route is removed and none added", () => {
    expect(
      classifyRouteLabelEdit([route("hot"), route("warm")], [route("hot")]),
    ).toEqual({ kind: "removal" });
  });

  it("collision when the proposed labels contain a duplicate", () => {
    expect(
      classifyRouteLabelEdit([route("hot"), route("warm")], [route("hot"), route("hot")]),
    ).toEqual({ kind: "collision" });
  });

  it("collision takes precedence even when it looks like a rename", () => {
    // warm -> hot would be a 1:1 rename, but it duplicates the existing hot label.
    expect(
      classifyRouteLabelEdit([route("hot"), route("warm")], [route("hot"), route("hot")]),
    ).toEqual({ kind: "collision" });
  });

  it("trims labels before comparing (whitespace is not a rename)", () => {
    expect(
      classifyRouteLabelEdit([route("hot")], [{ label: "  hot  ", condition: route("hot").condition }]),
    ).toEqual({ kind: "no_change" });
  });

  it("is total — never throws on empty/degenerate inputs", () => {
    expect(() => classifyRouteLabelEdit([], [])).not.toThrow();
    expect(classifyRouteLabelEdit([], [])).toEqual({ kind: "no_change" });
    expect(classifyRouteLabelEdit([], [route("hot")])).toEqual({ kind: "addition" });
    expect(classifyRouteLabelEdit([route("hot")], [])).toEqual({ kind: "removal" });
  });
});
