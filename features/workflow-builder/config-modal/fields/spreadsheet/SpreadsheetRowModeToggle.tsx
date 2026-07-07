"use client";

import * as React from "react";

/**
 * "One row" / "Several rows" mode toggle for the spreadsheet row editor
 * (SPREADSHEET-CONFIG-REDESIGN-1). Product language only — the two modes
 * map to the action's two save shapes, but the shapes never surface here.
 * Rendered as a segmented pair of buttons (radiogroup semantics).
 */

export type SpreadsheetRowMode = "one" | "several";

export interface SpreadsheetRowModeToggleProps {
  mode: SpreadsheetRowMode;
  onModeChange: (mode: SpreadsheetRowMode) => void;
  disabled?: boolean | undefined;
}

const OPTIONS: ReadonlyArray<{ mode: SpreadsheetRowMode; label: string }> = [
  { mode: "one", label: "One row" },
  { mode: "several", label: "Several rows" },
];

export function SpreadsheetRowModeToggle({
  mode,
  onModeChange,
  disabled,
}: SpreadsheetRowModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="What are you adding?"
      data-testid="spreadsheet-row-mode-toggle"
      className="inline-flex rounded-md border border-input p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = option.mode === mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => {
              if (!selected) onModeChange(option.mode);
            }}
            className={
              selected
                ? "rounded-sm bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-sm px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
