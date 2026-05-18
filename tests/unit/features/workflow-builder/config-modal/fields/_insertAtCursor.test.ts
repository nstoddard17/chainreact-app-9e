/**
 * @jest-environment node
 *
 * Tests for features/workflow-builder/config-modal/fields/_insertAtCursor.
 *
 * Slice 3.7 — bridges `<input>` and `<textarea>` for picker insertion.
 * Pure function; covers the standard insert, collapsed-caret insert,
 * range-selection-replace insert, and the null-selection fallback
 * (appends to end).
 */

import { insertAtCursor } from "@/features/workflow-builder/config-modal/fields/_insertAtCursor";

describe("insertAtCursor", () => {
  it("inserts at a collapsed caret", () => {
    const result = insertAtCursor({
      value: "Hello world",
      insert: "{{trigger.name}}",
      selectionStart: 6,
      selectionEnd: 6,
    });
    expect(result.nextValue).toBe("Hello {{trigger.name}}world");
    expect(result.nextSelection).toBe(6 + "{{trigger.name}}".length);
  });

  it("replaces a range selection with the inserted token", () => {
    const result = insertAtCursor({
      value: "Hello world",
      insert: "{{x.y}}",
      selectionStart: 6,
      selectionEnd: 11,
    });
    expect(result.nextValue).toBe("Hello {{x.y}}");
    expect(result.nextSelection).toBe(6 + "{{x.y}}".length);
  });

  it("appends to the end when selection is null (field never focused)", () => {
    const result = insertAtCursor({
      value: "abc",
      insert: "{{n.x}}",
      selectionStart: null,
      selectionEnd: null,
    });
    expect(result.nextValue).toBe("abc{{n.x}}");
    expect(result.nextSelection).toBe("abc{{n.x}}".length);
  });

  it("appends to the end when selection is undefined", () => {
    const result = insertAtCursor({
      value: "abc",
      insert: "Z",
      selectionStart: undefined,
      selectionEnd: undefined,
    });
    expect(result.nextValue).toBe("abcZ");
    expect(result.nextSelection).toBe(4);
  });

  it("inserts at the start when selection is 0", () => {
    const result = insertAtCursor({
      value: "abc",
      insert: "X",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.nextValue).toBe("Xabc");
    expect(result.nextSelection).toBe(1);
  });

  it("inserts an empty string as a no-op except for cursor position", () => {
    const result = insertAtCursor({
      value: "abc",
      insert: "",
      selectionStart: 1,
      selectionEnd: 1,
    });
    expect(result.nextValue).toBe("abc");
    expect(result.nextSelection).toBe(1);
  });

  it("normalizes reversed selection (start > end)", () => {
    const result = insertAtCursor({
      value: "abcdef",
      insert: "Z",
      selectionStart: 5,
      selectionEnd: 2,
    });
    expect(result.nextValue).toBe("abZf");
    expect(result.nextSelection).toBe(3);
  });
});
