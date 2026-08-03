"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { SpreadsheetCellInput } from "./SpreadsheetCellInput";
import type { ClassifiedColumn, UpdateCellState } from "./_updateModel";
import type { VariableSource } from "../../../hooks/useUpstreamVariables";

/**
 * One detected column's three-state control
 * (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * Why three real radios and not a text box whose emptiness gets
 * interpreted: for an UPDATE, "I left this empty" is genuinely ambiguous —
 * it could mean *leave this column alone* or *erase what is in it*, and
 * those write different things to a customer's spreadsheet. A control that
 * cannot express the difference forces the product to guess, and the safe
 * guess (leave alone) makes clearing a cell impossible while the
 * convenient guess (erase) destroys data. So the user says which.
 *
 * Accessibility here is load-bearing, not decoration:
 *   - A real `<fieldset>`/`<legend>` per column with three real radios, so
 *     arrow keys move within a column and Tab moves between columns.
 *   - Each radio's accessible name carries the COLUMN as well as the
 *     choice ("Notes — Set to blank"), because "Set to blank" alone is
 *     identical on twenty columns and tells a screen-reader user nothing
 *     about which cell they are about to erase. The visible label text is
 *     contained in that name (WCAG 2.5.3).
 *   - Every state is stated in WORDS. Nothing distinguishes unchanged from
 *     blank by colour, tint or position alone.
 *   - The legend WRAPS. A worksheet column can be a whole sentence, and
 *     the column name is the only thing identifying which cell this
 *     control writes to, so it is never abbreviated away.
 */

const STATE_OPTIONS: ReadonlyArray<{
  readonly state: UpdateCellState;
  readonly label: string;
  readonly hint: string;
}> = [
  {
    state: "unchanged",
    label: "Leave unchanged",
    hint: "Keep whatever is already in this cell.",
  },
  {
    state: "blank",
    label: "Set to blank",
    hint: "Empty this cell.",
  },
  {
    state: "value",
    label: "Set to a value",
    hint: "Replace this cell with the value below.",
  },
];

export interface SpreadsheetUpdateCellProps {
  readonly fieldName: string;
  readonly index: number;
  readonly column: ClassifiedColumn;
  readonly state: UpdateCellState;
  readonly value: string;
  /**
   * This column is an untouched legacy `null` — saved before S4, meaning
   * "leave this cell alone", and kept exactly as it is. Shown so the state
   * is explained rather than merely correct.
   */
  readonly legacyPreserved?: boolean | undefined;
  readonly onStateChange: (next: UpdateCellState) => void;
  readonly onValueChange: (next: string) => void;
  readonly disabled?: boolean | undefined;
  readonly sources: readonly VariableSource[];
  readonly latestValuesBySource?: Readonly<Record<string, unknown>> | undefined;
}

export function SpreadsheetUpdateCell({
  fieldName,
  index,
  column,
  state,
  value,
  legacyPreserved,
  onStateChange,
  onValueChange,
  disabled,
  sources,
  latestValuesBySource,
}: SpreadsheetUpdateCellProps) {
  const groupName = `${fieldName}-col-${index}`;
  const valueInputId = `field-${fieldName}-col-${index}-value`;
  const ambiguous = column.ambiguity !== "none";
  const noticeId = `${groupName}-notice`;

  return (
    <fieldset
      className="min-w-0 rounded-md border border-input p-2.5"
      data-testid={`spreadsheet-update-${fieldName}-column-${index}`}
      data-column-state={state}
      data-ambiguity={column.ambiguity}
      disabled={disabled || ambiguous}
    >
      <legend className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 break-words px-1 text-xs font-medium">
        <span className="min-w-0 break-words">{column.label}</span>
        {column.hint ? (
          <span className="text-[10px] font-normal text-muted-foreground">
            {column.hint}
          </span>
        ) : null}
      </legend>

      {ambiguous ? (
        /*
          A record is keyed by column NAME, so two columns that share a name
          cannot be told apart in the saved configuration. The runtime
          handler's header map silently keeps the last one. Rather than pick
          for the user and hope, this column is not offered — and the fix is
          stated, because it is one the user can actually carry out in Excel.
        */
        <p
          role="status"
          data-testid={`spreadsheet-update-${fieldName}-ambiguous-${index}`}
          className="flex min-w-0 items-start gap-1.5 break-words text-[11px] text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {column.ambiguity === "duplicate-name"
              ? `More than one column in this worksheet is called “${column.label}”. We can't tell them apart, so this column can't be updated safely. Give each column a different heading in Excel, then reopen this step.`
              : `Another column reads the same as “${column.label}” once spacing is ignored. We can't tell them apart, so this column can't be updated safely. Make the headings clearly different in Excel, then reopen this step.`}
          </span>
        </p>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-1">
            {STATE_OPTIONS.map((option) => {
              const inputId = `${groupName}-${option.state}`;
              return (
                <label
                  key={option.state}
                  htmlFor={inputId}
                  className="flex min-w-0 cursor-pointer items-start gap-2 text-xs"
                >
                  <input
                    id={inputId}
                    type="radio"
                    name={groupName}
                    value={option.state}
                    checked={state === option.state}
                    disabled={disabled}
                    aria-label={`${column.label} — ${option.label}`}
                    onChange={() => onStateChange(option.state)}
                    className="mt-0.5 shrink-0 accent-[var(--builder-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-medium">
                      {option.label}
                    </span>
                    <span className="block break-words text-[11px] text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {legacyPreserved ? (
            /*
              EXCEL-UPDATE-ROW-CONCURRENCY-4 — this column was saved with an
              explicit empty marker by an older version of this step, which
              described it as clearing the cell. It never did: Excel treats
              that marker as "leave this cell alone". The setting is kept
              exactly as it is and the label now matches what actually
              happens, so the note explains the correction rather than
              leaving the user to notice a silent change of meaning.
            */
            <p
              className="mt-1.5 break-words text-[11px] text-muted-foreground"
              data-testid={`spreadsheet-update-${fieldName}-legacy-${index}`}
            >
              This column was set up before we corrected how &ldquo;empty&rdquo;
              was saved. It has always left the cell as it is, and it still
              does. Choose one of the options above if you want it to change.
            </p>
          ) : null}

          {column.hasHiddenWhitespace ? (
            /*
              The picker shows the trimmed heading, but the saved key is the
              RAW one, because that is what the handler matches. Saying so
              keeps the two honest with each other instead of leaving the
              user to discover the space at run time.
            */
            <p
              id={noticeId}
              className="mt-1.5 break-words text-[11px] text-muted-foreground"
              data-testid={`spreadsheet-update-${fieldName}-whitespace-${index}`}
            >
              This heading has extra spacing in Excel. We use it exactly as it
              is written there, so the update still lands on the right column.
            </p>
          ) : null}

          {state === "value" ? (
            <div className="mt-2">
              <SpreadsheetCellInput
                id={valueInputId}
                label="New value"
                value={value}
                onChange={onValueChange}
                disabled={disabled}
                sources={sources}
                latestValuesBySource={latestValuesBySource}
                ariaLabel={`${column.label} — new value`}
              />
            </div>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
