"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { VariablePickerButton } from "../VariablePickerButton";
import { insertAtCursor } from "../_insertAtCursor";
import type { VariableSource } from "../../../hooks/useUpstreamVariables";

/**
 * One spreadsheet cell input (SPREADSHEET-CONFIG-REDESIGN-1): a labeled
 * text input with the standard variable-picker affordance. Cells accept
 * either typed text or `{{...}}` variable tokens inserted at the cursor
 * (same insertion contract as TextField). Used by both the one-row and
 * several-rows editors so every cell gets identical behavior.
 */

export interface SpreadsheetCellInputProps {
  id: string;
  /** Column name (or positional label in manual mode). */
  label: string;
  /** Secondary hint, e.g. the column letter ("Column B"). */
  hint?: string | undefined;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean | undefined;
  sources: readonly VariableSource[];
  latestValuesBySource?: Readonly<Record<string, unknown>> | undefined;
  /** Accessible label; defaults to the visible column label. */
  ariaLabel?: string;
}

export function SpreadsheetCellInput({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  sources,
  latestValuesBySource,
  ariaLabel,
}: SpreadsheetCellInputProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function handleInsertAtCursor(token: string): void {
    const el = inputRef.current;
    const { nextValue } = insertAtCursor({
      value,
      insert: token,
      selectionStart: el?.selectionStart,
      selectionEnd: el?.selectionEnd,
    });
    onChange(nextValue);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* A worksheet column name can be a sentence ("Total amount including
          all applicable taxes and adjustments"), and this label sits in a
          331px overlay sheet. It WRAPS rather than truncating: the column
          name is the only thing identifying which cell the input writes to,
          so hiding half of it would be worse than two lines. `break-words`
          covers a single unbroken token. */}
      <label
        htmlFor={id}
        className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 break-words text-xs font-medium"
      >
        <span className="min-w-0 break-words">{label}</span>
        {hint ? (
          <span className="text-[10px] font-normal text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </label>
      {/* SPREADSHEET-GUIDED-CONFIG-S3 — `min-w-0` on the row and the input.
          Without it the input's default `min-width: auto` (its content size)
          kept it from shrinking and pushed the variable-picker button clean
          out of the row; the guided panel's first responsive sweep measured
          that escape at every width from 360 to 1600. */}
      <div className="flex min-w-0 items-start gap-2">
        <Input
          ref={inputRef}
          id={id}
          value={value}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1"
        />
        <VariablePickerButton
          sources={sources}
          onInsertAtCursor={handleInsertAtCursor}
          ariaLabel={`Insert variable into ${ariaLabel ?? label}`}
          testIdRoot={`${id}-picker`}
          {...(latestValuesBySource !== undefined && { latestValuesBySource })}
        />
      </div>
    </div>
  );
}
