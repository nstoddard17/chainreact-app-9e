"use client";

import * as React from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import { FileRefSchema, type FileRef } from "@/contracts/file";
import { parseReferences } from "@/core/workflows/variableReferences";
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
 *   - Anything else: silent reject (clear the input so the user knows
 *     the attempt landed).
 *   - Exact-string duplicate of an existing entry (same token OR same
 *     FileRef payload by canonical JSON string) is silently rejected.
 *
 * Cap:
 *   - `field.fileArrayMaxItems` honored. At cap: Add button disabled +
 *     label reads "Add (max N)"; Enter inert.
 *
 * Disabled:
 *   - Existing chips remain visible. Input row + Add button + per-chip
 *     ✕ disabled (decision D-FRA-10).
 *
 * Out of scope (deferred slices):
 *   - Variable picker chip-append branch.
 *   - Drag-and-drop reorder.
 *   - FileRef sub-field drilling.
 *   - Async file upload UI / storage picker / signed-URL minting.
 *   - Client-side URL fetch / resolution.
 */

// Entry shape used internally by the renderer. The on-disk array
// contains the raw `string` (token) or `FileRef` (object) values; the
// `Entry` discriminated form is for rendering only.
type Entry =
  | { readonly kind: "token"; readonly value: string }
  | { readonly kind: "fileRef"; readonly value: FileRef };

/** Returns true when the trimmed string is a single token spanning the whole input. */
function isExactToken(trimmed: string): boolean {
  if (!trimmed.startsWith("{{") || !trimmed.endsWith("}}")) return false;
  const refs = parseReferences(trimmed);
  if (refs.length !== 1) return false;
  return refs[0]!.token === trimmed;
}

/** Try to parse a paste-text input as a FileRef JSON literal. */
function tryParseFileRef(trimmed: string): FileRef | null {
  // FileRef literals are JSON objects — quick prefix check avoids
  // pointlessly parsing every paste.
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = FileRefSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Coerce arbitrary input into the canonical on-disk array. Drops any
 * entry that is neither a valid token string nor a FileRefSchema parse.
 * Filtering (not throwing) keeps a malformed workflow draft openable so
 * the author can recover; the resolved-config Zod parse at save time is
 * the authoritative gate.
 */
function coerceValue(value: unknown): Array<string | FileRef> {
  if (!Array.isArray(value)) return [];
  const out: Array<string | FileRef> = [];
  for (const raw of value) {
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0 && isExactToken(trimmed)) {
        out.push(trimmed);
      }
      continue;
    }
    if (raw && typeof raw === "object") {
      const parsed = FileRefSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
    }
  }
  return out;
}

/** Build the renderer's internal Entry list from the on-disk array. */
function toEntries(values: ReadonlyArray<string | FileRef>): Entry[] {
  return values.map((v) =>
    typeof v === "string"
      ? ({ kind: "token", value: v } as const)
      : ({ kind: "fileRef", value: v } as const),
  );
}

/** Canonical comparison key for dedup. Tokens compare by literal; FileRefs by JSON.stringify of the validated object. */
function entryKey(value: string | FileRef): string {
  if (typeof value === "string") return `t:${value}`;
  // Deterministic key — FileRef objects are strict + small; JSON.stringify
  // on a validated discriminated-union object is a stable hash for dedup.
  return `f:${JSON.stringify(value)}`;
}

/** Display label for a chip — token shorthand or FileRef.name. */
function entryLabel(entry: Entry): string {
  if (entry.kind === "token") return entry.value;
  return entry.value.name;
}

/** Stable accessible name for the chip's remove button. */
function entryAriaLabel(label: string, entry: Entry): string {
  return `Remove ${label} item ${entryLabel(entry)}`;
}

export const FileRefArrayField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const items = coerceValue(value);
  const entries = toEntries(items);
  const controlId = `field-${field.name}`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = React.useState("");

  const maxItems = field.fileArrayMaxItems;
  const atCap = maxItems !== undefined && items.length >= maxItems;

  function tryAdd(): void {
    if (disabled || atCap) return;
    const trimmed = pending.trim();
    if (trimmed.length === 0) return; // silent reject

    let next: string | FileRef | null = null;
    if (isExactToken(trimmed)) {
      next = trimmed;
    } else {
      const ref = tryParseFileRef(trimmed);
      if (ref) next = ref;
    }
    if (next === null) {
      // Paste was neither a token nor a parseable FileRef. Silent reject
      // — clear the input so the user knows the attempt landed.
      setPending("");
      return;
    }

    const nextKey = entryKey(next);
    if (items.some((existing) => entryKey(existing) === nextKey)) {
      // Silent dedupe — clear the input so the user knows the attempt
      // landed but produced no new chip.
      setPending("");
      return;
    }

    onChange([...items, next]);
    setPending("");
    inputRef.current?.focus();
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
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
            }
            disabled={disabled || atCap}
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={tryAdd}
            disabled={disabled || atCap}
            aria-label={`Add ${field.label} item`}
          >
            <Plus className="h-4 w-4" />
            Add{atCap ? ` (max ${maxItems})` : ""}
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No attachments.</p>
        ) : (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={`field-${field.name}-chips`}
          >
            {entries.map((entry, i) => {
              const label = entryLabel(entry);
              return (
                <Badge
                  key={`${i}-${entryKey(items[i]!)}`}
                  variant="outline"
                  className="gap-1 pr-1"
                  data-entry-kind={entry.kind}
                >
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span>{label}</span>
                  <button
                    type="button"
                    aria-label={entryAriaLabel(field.label, entry)}
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
