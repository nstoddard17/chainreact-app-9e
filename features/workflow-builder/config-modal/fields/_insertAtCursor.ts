/**
 * Insert a string at the current selection of an input / textarea.
 *
 * Slice 3.7 — shared by TextField, TextareaField, and
 * RouterRoutesField row inputs. The picker doesn't know whether the
 * target is an `<input>` or `<textarea>`; this pure helper bridges
 * the two via the DOM `selectionStart` / `selectionEnd` API both
 * elements support.
 *
 * Returns the new string value (which the renderer passes through
 * `onChange`) and the new cursor position (which the renderer
 * applies via `setSelectionRange` in a `useLayoutEffect` if it
 * wants the caret restored after the insert).
 *
 * Permissive: when `selectionStart` / `selectionEnd` are null
 * (Element not yet focused), the insert appends to the end. This
 * matches "click the picker without first clicking the field"
 * intent — author wants a token, position doesn't matter.
 */

export interface InsertAtCursorInput {
  value: string;
  insert: string;
  selectionStart: number | null | undefined;
  selectionEnd: number | null | undefined;
}

export interface InsertAtCursorResult {
  nextValue: string;
  nextSelection: number;
}

export function insertAtCursor({
  value,
  insert,
  selectionStart,
  selectionEnd,
}: InsertAtCursorInput): InsertAtCursorResult {
  const start =
    typeof selectionStart === "number" && selectionStart >= 0
      ? selectionStart
      : value.length;
  const end =
    typeof selectionEnd === "number" && selectionEnd >= 0
      ? selectionEnd
      : start;
  const safeStart = Math.min(start, end);
  const safeEnd = Math.max(start, end);
  const nextValue =
    value.slice(0, safeStart) + insert + value.slice(safeEnd);
  return {
    nextValue,
    nextSelection: safeStart + insert.length,
  };
}
