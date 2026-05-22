"use client";

import * as React from "react";
import { Paperclip, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveNodeUpstreamVariables } from "../../hooks/useActiveNodeUpstreamVariables";
import { FieldShell } from "./FieldShell";
import { VariablePickerButton } from "./VariablePickerButton";
import type { FileRef } from "@/contracts/file";
import {
  coerceSingleFileRef,
  entryKey,
  entryLabel,
  isExactToken,
  tryParseFileRef,
} from "./_fileRefEntry";
import type { FieldRendererProps } from "./types";

/**
 * `file` field renderer — Slice 3.25 upgrade.
 *
 * Mirrors `FileRefArrayField` (Slice 3.21/3.22) but for the single-
 * value FileRef case. The shipped placeholder from Slice 3.1
 * (paste-text Input only, no picker, no JSON parsing, no chip) was a
 * known gap — Slice 3.7 added the variable picker for text-style
 * fields but did NOT upgrade FileField. Slack `upload_file` and
 * (future) Airtable `add_attachment` need a working FileRef config
 * field; this renderer is the gating dependency.
 *
 * Plan reference: docs/slices/phase-3/single-file-ref-metadata-plan.md
 * decisions D-SFR-3 / D-SFR-5 / D-SFR-6 / D-SFR-7 / D-SFR-10.
 *
 * Value contract:
 *   - On-disk value: `string | FileRef | undefined`.
 *   - Strings are canonical `{{nodeId.path}}` tokens (resolved at
 *     runtime to an upstream FileRef producer output).
 *   - Objects are `FileRefSchema`-valid refs (paste-text literal
 *     fallback for power users).
 *   - Untouched optional fields stay `undefined`. The renderer NEVER
 *     manufactures a value on mount.
 *   - Initial mount with a non-empty value does NOT fire `onChange`.
 *   - A prop that's neither a valid token nor a valid FileRef parse
 *     (e.g. a `[]`, a number, a non-token string from a stale workflow)
 *     renders the empty state but is NOT auto-cleared — the parent's
 *     draft still carries the raw value, and silently rewriting it
 *     would mask the upstream-producer bug.
 *
 * Add path (single auto-detecting input — mirrors FileRefArrayField):
 *   - Trim. Reject empty / whitespace-only silently.
 *   - If exactly one `{{nodeId.path}}` token → set value to the token
 *     (REPLACES any existing value — single-value semantics).
 *   - Else try `JSON.parse` + `FileRefSchema.safeParse` → set value to
 *     the FileRef (REPLACES).
 *   - Anything else → silent reject, clear input.
 *   - Setting the same token / FileRef when one already lives in the
 *     field is a no-op (`onChange` skipped to avoid spurious dirty).
 *
 * Variable picker:
 *   - Embedded `VariablePickerButton` next to the input. Picker hides
 *     itself when no upstream sources exist (same VariablePickerButton
 *     early-return as the array case).
 *   - Insertion REPLACES the current value (D-SFR-6 — single-value
 *     semantics; no append). No type-aware filtering (D-SFR-10
 *     inherited).
 *   - Re-selecting the same upstream output produces no `onChange`
 *     (same dedup guard as paste-text Add).
 *
 * Remove (✕):
 *   - Clears the value back to `undefined`. The input row reappears.
 *
 * Disabled:
 *   - Chip (when present) stays visible — D-FRA-10 parallel.
 *   - Input + Add + picker + ✕ disabled.
 *
 * Out of scope (deferred slices):
 *   - Async file upload UI / drag-drop / storage picker.
 *   - Signed-URL minting / client-side URL fetch.
 *   - Type-aware variable picker filtering.
 *   - Per-provider acceptedKinds / maxSizeBytes / providerUrlAllowed
 *     hints (D-SFR-2 — defer until UX feedback proves a need).
 *   - FileRef sub-field drilling.
 */

/** Stable accessible name for the chip's remove button. */
function chipAriaLabel(fieldLabel: string, value: string | FileRef): string {
  return `Remove ${fieldLabel} value ${entryLabel(value)}`;
}

export const FileField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const current = coerceSingleFileRef(value);
  const controlId = `field-${field.name}`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = React.useState("");
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();

  function commit(next: string | FileRef): void {
    if (disabled) return;
    // No-op when the new value's canonical key matches the existing
    // one. Skips a spurious `onChange` (and an associated dirty-flag
    // flip) when the user picks the same upstream output twice or
    // re-pastes an identical literal.
    if (current !== undefined && entryKey(current) === entryKey(next)) return;
    onChange(next);
  }

  function tryAdd(): void {
    if (disabled) return;
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
      // Paste was neither a token nor a parseable FileRef. Silent
      // reject — clear the input so the user knows the attempt
      // landed.
      setPending("");
      return;
    }
    commit(next);
    setPending("");
    inputRef.current?.focus();
  }

  function clearValue(): void {
    if (disabled) return;
    onChange(undefined);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== "Enter") return;
    // Prevent Enter from submitting any enclosing form.
    e.preventDefault();
    tryAdd();
  }

  /**
   * Variable-picker insertion path. The picker always emits a
   * canonical `{{nodeId.path}}` token via `formatReference`; commit
   * REPLACES any existing value (single-value semantics).
   */
  function handleInsertAtCursor(token: string): void {
    if (disabled) return;
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    // Defense: the picker is canonical today, but a future picker
    // source could emit something else. Drop malformed input silently
    // rather than coerce.
    if (!isExactToken(trimmed)) return;
    commit(trimmed);
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div
        className="flex flex-col gap-2"
        role="group"
        aria-labelledby={controlId}
      >
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={controlId}
            name={field.name}
            value={pending}
            placeholder={field.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error
                ? `${controlId}-err`
                : field.description
                  ? `${controlId}-help`
                  : undefined
            }
            disabled={disabled}
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={tryAdd}
            disabled={disabled}
            aria-label={`Set ${field.label} value`}
          >
            Set
          </Button>
          <VariablePickerButton
            sources={sources}
            onInsertAtCursor={handleInsertAtCursor}
            ariaLabel={`Insert variable into ${field.label}`}
            testIdRoot={`file-${field.name}-picker`}
            latestValuesBySource={latestValuesBySource}
          />
        </div>
        {current === undefined ? (
          <p className="text-xs italic text-muted-foreground">No file.</p>
        ) : (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={`field-${field.name}-chip`}
          >
            <Badge
              variant="outline"
              className="gap-1 pr-1"
              data-entry-kind={typeof current === "string" ? "token" : "fileRef"}
            >
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span>{entryLabel(current)}</span>
              <button
                type="button"
                aria-label={chipAriaLabel(field.label, current)}
                onClick={clearValue}
                disabled={disabled}
                className="rounded-sm p-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          </div>
        )}
      </div>
    </FieldShell>
  );
};
