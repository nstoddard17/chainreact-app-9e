"use client";

import * as React from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "./FieldShell";
import { VariablePickerButton } from "./VariablePickerButton";
import type { FileRef } from "@/contracts/file";
import {
  coerceFileRefArray,
  entryKey,
  entryLabel,
  isExactToken,
  tryParseFileRef,
} from "./_fileRefEntry";
import type { FieldRendererProps } from "./types";

/**
 * `file-array` field renderer — Slice 3.21.
 *
 * Renders a chip list of file attachments. Two chip kinds:
 *   1. Variable token chips — strings of the form `{{nodeId.path}}`.
 *      The runtime variable resolver swaps these for upstream FileRef
 *      producer outputs (e.g. `gmail:get_attachment`) before the
 *      resolved-config Zod parse. Stored on disk as the literal token
 *      string.
 *   2. FileRef literal chips — paste-text fallback where the author
 *      writes a JSON FileRef literal. Parsed against `FileRefSchema` at
 *      paste time. Stored on disk as the FileRef object.
 *
 * Plan reference: docs/slices/phase-3/file-ref-array-field-plan.md.
 *
 * Value contract (matches `StringArrayField` semantics):
 *   - On-disk value: `Array<string | FileRef>` — mixed by design so the
 *     same array can carry both token references and pasted literals.
 *   - Never JSON-encoded, never CSV, never base64.
 *   - Non-array initial value coerces to `[]` (defensive — same pattern
 *     as KeyValueField + StringArrayField). Entries that are neither a
 *     valid token string nor a valid `FileRefSchema` parse are
 *     filtered out.
 *   - Initial mount with a non-empty value does NOT fire `onChange`
 *     (avoids spurious dirty-flag).
 *   - Empty / untouched optional fields stay `undefined`; the renderer
 *     never manufactures `[]` for a never-touched field (decision
 *     D-FRA-3 in the plan).
 *
 * Add behavior (single auto-detecting input — variable-picker
 * integration is a follow-up slice):
 *   - Input + Add button. Enter inside the input also adds.
 *   - Trim input; reject empty / whitespace-only silently.
 *   - If the trimmed input contains a `{{nodeId.path}}` token (one
 *     token, exact match for the whole input after trim), accept as a
 *     token chip.
 *   - Else, try to `JSON.parse` and `FileRefSchema.safeParse`. On
 *     success, accept as a FileRef chip.
 *   - Anything else: inline error, input text PRESERVED (Batch R1 —
 *     silent clearing read as success; the invalid and duplicate cases
 *     show DISTINCT messages so a rejected value can never look
 *     successfully added).
 *   - Exact-string duplicate of an existing entry (same token OR same
 *     FileRef payload by canonical JSON string) shows an "already in
 *     the list" message and preserves the input.
 *
 * Pending-input safety (Batch R1):
 *   - Blur auto-commits valid pending text (or shows the inline error),
 *     so typed-but-not-Added values survive Save / Cancel / tab-switch
 *     (every pointer/keyboard route there blurs this input first).
 *
 * Cap:
 *   - `field.fileArrayMaxItems` honored. At cap: Add button disabled +
 *     label reads "Add (max N)"; Enter inert.
 *
 * Disabled:
 *   - Existing chips remain visible. Input row + Add button + per-chip
 *     ✕ disabled (decision D-FRA-10).
 *
 * Variable picker chip-append (Slice 3.22):
 *   - The renderer embeds its own `VariablePickerButton` next to the
 *     input, mirroring how `TextField` / `TextareaField` /
 *     `RouterRoutesField` per-row inputs each carry their own picker.
 *     Each renderer's insertion callback decides what "insert" means
 *     for its value shape — no global focused-field state needed.
 *   - On insert, the picker emits a canonical `{{nodeId.path}}` token
 *     (from `formatReference`). This renderer appends it to the chip
 *     array. Existing chips are preserved.
 *   - Dedup by `entryKey` (token literal). Duplicate selections are
 *     silently dropped, matching the paste-text Add semantics.
 *   - No pre-filtering of picker outputs by type — per plan §6 / D-FRA-6.
 *     Authors can pick any output; the runtime resolved-config Zod
 *     parse remains authoritative on whether the resolved value is a
 *     valid `FileRef`.
 *   - The picker hides itself automatically when there are no upstream
 *     sources (`sources.length === 0` inside `VariablePickerButton`),
 *     so trigger-node configs that surface a file-array field gracefully
 *     render the paste-text path only.
 *
 * Out of scope (deferred slices):
 *   - Drag-and-drop reorder.
 *   - FileRef sub-field drilling.
 *   - Async file upload UI / storage picker / signed-URL minting.
 *   - Client-side URL fetch / resolution.
 *   - Type-aware picker filtering (show only `fileRef` outputs).
 */

/** Stable accessible name for the chip's remove button. */
function chipAriaLabel(fieldLabel: string, value: string | FileRef): string {
  return `Remove ${fieldLabel} item ${entryLabel(value)}`;
}

export const FileRefArrayField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const items = coerceFileRefArray(value);
  const controlId = `field-${field.name}`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = React.useState("");
  // Batch R1 — inline message for a rejected Add (invalid paste vs.
  // duplicate get DISTINCT copy). Cleared on the next keystroke or a
  // successful add; the typed text is preserved alongside it.
  const [inputIssue, setInputIssue] = React.useState<string | null>(null);
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();

  const maxItems = field.fileArrayMaxItems;
  const atCap = maxItems !== undefined && items.length >= maxItems;

  const DUPLICATE_MSG = "That file is already in the list.";

  /**
   * Shared Add path for the Add button, Enter, and blur auto-commit.
   * `refocus` is false on blur — grabbing focus back during a blur
   * would trap the user in the field.
   */
  function tryAdd(opts?: { refocus?: boolean }): void {
    if (disabled || atCap) return;
    const trimmed = pending.trim();
    if (trimmed.length === 0) return; // nothing typed — nothing to lose

    let next: string | FileRef | null = null;
    if (isExactToken(trimmed)) {
      next = trimmed;
    } else {
      const ref = tryParseFileRef(trimmed);
      if (ref) next = ref;
    }
    if (next === null) {
      // Batch R1 — neither a token nor a parseable FileRef. Keep the
      // text and say so; never silently clear.
      setInputIssue(
        "That text isn't a file reference. Choose a file from an earlier step instead.",
      );
      return;
    }

    const nextKey = entryKey(next);
    if (items.some((existing) => entryKey(existing) === nextKey)) {
      // Batch R1 — duplicate gets its own message (distinct from the
      // invalid case) and the input is preserved, so a rejected value
      // never looks successfully added.
      setInputIssue(DUPLICATE_MSG);
      return;
    }

    onChange([...items, next]);
    setPending("");
    setInputIssue(null);
    if (opts?.refocus !== false) inputRef.current?.focus();
  }

  /**
   * Batch R1 — pending-input safety. Any pointer/keyboard route to
   * Save / Cancel / another tab blurs this input first; committing
   * valid pending text here means typed-but-not-Added values can no
   * longer be silently discarded. Invalid/duplicate text stays put
   * with its inline message.
   */
  function handleBlur(): void {
    if (pending.trim().length === 0) return;
    tryAdd({ refocus: false });
  }

  function removeAt(index: number): void {
    if (disabled) return;
    onChange(items.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== "Enter") return;
    // Prevent Enter from submitting any enclosing form.
    e.preventDefault();
    tryAdd();
  }

  function handlePendingChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setPending(e.target.value);
    // Editing the text starts a correction — drop the stale message.
    if (inputIssue) setInputIssue(null);
  }

  /**
   * Slice 3.22 — variable-picker insertion path. The picker emits a
   * canonical `{{nodeId.path}}` token (always a well-formed token from
   * `formatReference`). We append it to the chip array, deduping by
   * the same `entryKey` the paste-text path uses. At-cap / disabled
   * mirror the paste-text path's gating so the picker can't bypass
   * the cap.
   */
  function handleInsertAtCursor(token: string): void {
    if (disabled || atCap) return;
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    // Defense: the picker always emits canonical tokens, but stay
    // tolerant if a future picker source emits something else — silently
    // drop anything that isn't a valid token. Never coerces a malformed
    // token to a FileRef literal.
    if (!isExactToken(trimmed)) return;
    const nextKey = entryKey(trimmed);
    if (items.some((existing) => entryKey(existing) === nextKey)) {
      // Batch R1 — re-picking an already-added output used to be a
      // silent no-op, indistinguishable from a successful add. Say so.
      setInputIssue(DUPLICATE_MSG);
      return;
    }
    onChange([...items, trimmed]);
    setInputIssue(null);
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div className="flex flex-col gap-2" role="group" aria-labelledby={controlId}>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={controlId}
            name={field.name}
            value={pending}
            placeholder={field.placeholder}
            aria-invalid={error || inputIssue ? true : undefined}
            aria-describedby={
              inputIssue
                ? `${controlId}-input-err`
                : error
                  ? `${controlId}-err`
                  : field.description
                    ? `${controlId}-help`
                    : undefined
            }
            disabled={disabled || atCap}
            onChange={handlePendingChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => tryAdd()}
            disabled={disabled || atCap}
            aria-label={`Add ${field.label} item`}
          >
            <Plus className="h-4 w-4" />
            Add{atCap ? ` (max ${maxItems})` : ""}
          </Button>
          <VariablePickerButton
            sources={sources}
            onInsertAtCursor={handleInsertAtCursor}
            ariaLabel={`Insert variable into ${field.label}`}
            testIdRoot={`file-array-${field.name}-picker`}
            latestValuesBySource={latestValuesBySource}
          />
        </div>
        {inputIssue ? (
          <p
            id={`${controlId}-input-err`}
            role="alert"
            data-testid={`field-${field.name}-input-error`}
            className="text-xs text-destructive"
          >
            {inputIssue}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            No attachments yet — add one from an earlier step above.
          </p>
        ) : (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={`field-${field.name}-chips`}
          >
            {items.map((entry, i) => {
              const entryKind = typeof entry === "string" ? "token" : "fileRef";
              return (
                <Badge
                  key={`${i}-${entryKey(entry)}`}
                  variant="outline"
                  className="gap-1 pr-1"
                  data-entry-kind={entryKind}
                >
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span>{entryLabel(entry)}</span>
                  <button
                    type="button"
                    aria-label={chipAriaLabel(field.label, entry)}
                    onClick={() => removeAt(i)}
                    disabled={disabled}
                    className="rounded-sm p-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </FieldShell>
  );
};
