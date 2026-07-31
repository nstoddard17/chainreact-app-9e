"use client";

import * as React from "react";
import { Link2 } from "lucide-react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { Button } from "@/components/ui/button";
import { SchemaForm } from "../SchemaForm";
import type { GuidedSpreadsheetAdapter } from "./guidedSpreadsheetAdapters";
import { legacyDestinationHint } from "./guidedStepModel";

/**
 * Step 1 — "Pick the sheet" (SHEETS-GUIDED-CONFIG-1).
 *
 * Draws the adapter's destination fields through the ORDINARY renderers
 * (`SchemaForm only=`), so the spreadsheet and tab pickers keep every
 * behavior they already have: async option loading, search, manual
 * entry, and the shared disconnected / reconnect / owner-gated recovery
 * states. This step adds only the two things the generic form cannot
 * know about:
 *
 *   1. **"Paste a link instead."** A user who already has the sheet open
 *      in another tab should not have to search for it by name.
 *   2. **An honest account of a legacy range.** A node saved before the
 *      tab picker existed has a range but no tab. Opening it must not
 *      rewrite it, so we explain what the saved range points at and let
 *      the user confirm — see `legacyDestinationHint`.
 */

export interface GuidedDestinationStepProps {
  readonly adapter: GuidedSpreadsheetAdapter;
  readonly fields: readonly FieldMeta[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly disabled?: boolean;
  readonly highlightFieldName?: string;
  /** Set when a tab change kept a hand-written range instead of deriving one. */
  readonly customRangeNotice: string | null;
  readonly onUseDerivedRange: () => void;
  readonly hint: string;
}

export function GuidedDestinationStep({
  adapter,
  fields,
  values,
  errors,
  onChange,
  disabled,
  highlightFieldName,
  customRangeNotice,
  onUseDerivedRange,
  hint,
}: GuidedDestinationStepProps) {
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkText, setLinkText] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const legacy = legacyDestinationHint({ adapter, values });

  function applyLink(): void {
    const parsed = adapter.parseResourceLink?.(linkText) ?? null;
    if (!parsed) {
      setLinkError(
        "That doesn't look like a Google Sheets link. Copy the address from your browser while the sheet is open.",
      );
      return;
    }
    setLinkError(null);
    setLinkText("");
    setLinkOpen(false);
    onChange(parsed.field, parsed.value);
  }

  return (
    <div className="flex flex-col gap-3">
      {adapter.destinationFields.map((name) => (
        <SchemaForm
          key={name}
          fields={fields}
          values={values}
          errors={errors}
          onChange={onChange}
          only={name}
          {...(disabled !== undefined && { disabled })}
          {...(highlightFieldName ? { highlightFieldName } : {})}
        />
      ))}

      {adapter.parseResourceLink ? (
        <div className="flex flex-col gap-2">
          {linkOpen ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="guided-paste-link"
                className="text-xs font-medium text-muted-foreground"
              >
                Paste a Google Sheets link
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="guided-paste-link"
                  data-testid="guided-paste-link-input"
                  type="text"
                  value={linkText}
                  disabled={disabled}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyLink();
                    }
                  }}
                  className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                  {...(linkError ? { "aria-describedby": "guided-paste-link-error" } : {})}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={applyLink}
                  disabled={disabled}
                  data-testid="guided-paste-link-apply"
                >
                  Use
                </Button>
              </div>
              {linkError ? (
                <p
                  id="guided-paste-link-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {linkError}
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLinkOpen(true)}
              disabled={disabled}
              data-testid="guided-paste-link-open"
              className="inline-flex w-fit items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              Paste a link instead
            </button>
          )}
        </div>
      ) : null}

      {legacy.kind === "suggest-tab" ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
          data-testid="guided-legacy-tab-suggestion"
        >
          <span>
            This step was set up with the cell range{" "}
            <code className="font-mono">{legacy.range}</code>, which points at
            the tab &ldquo;{legacy.tab}&rdquo;. Choose it above to load that
            tab&rsquo;s column names. Nothing changes until you save.
          </span>
        </div>
      ) : legacy.kind === "unreadable" ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
          data-testid="guided-legacy-tab-unreadable"
        >
          <span>
            This step was set up with the cell range{" "}
            <code className="font-mono">{legacy.range}</code>. We can&rsquo;t
            tell which tab that is, so pick the tab above to load its column
            names. Your saved range is kept in Advanced until you change it.
          </span>
        </div>
      ) : null}

      {customRangeNotice ? (
        <div
          className="flex flex-col items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
          data-testid="guided-custom-range-notice"
          role="status"
        >
          <span>
            You set a custom cell range (
            <code className="font-mono">{customRangeNotice}</code>), so we
            kept it instead of using the whole tab. It is still what this step
            writes to.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUseDerivedRange}
            disabled={disabled}
            data-testid="guided-custom-range-reset"
          >
            Use the whole tab instead
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
