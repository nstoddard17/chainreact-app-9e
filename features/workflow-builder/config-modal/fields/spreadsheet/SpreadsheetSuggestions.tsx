"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MappingSuggestion } from "../../guided/mappingSuggestions";

/**
 * "We matched these columns by name" (SHEETS-GUIDED-CONFIG-1, D3).
 *
 * Every proposed mapping is listed BEFORE anything is accepted, with
 * the step and output it would come from, because the whole risk of a
 * suggestion is that it is accepted at a glance. Nothing here is
 * applied automatically: the component renders candidates and reports
 * clicks. A suggestion the user ignores has no effect on configuration.
 */

export interface SpreadsheetSuggestionsProps {
  readonly fieldName: string;
  readonly suggestions: readonly MappingSuggestion[];
  readonly onAccept: (suggestion: MappingSuggestion) => void;
  readonly onAcceptAll: () => void;
  readonly disabled?: boolean | undefined;
}

export function SpreadsheetSuggestions({
  fieldName,
  suggestions,
  onAccept,
  onAcceptAll,
  disabled,
}: SpreadsheetSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-sky-500/40 bg-sky-500/5 p-3"
      data-testid={`spreadsheet-suggestions-${fieldName}`}
    >
      <p className="flex items-start gap-2 text-xs">
        <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden />
        <span>
          <b className="font-semibold">
            {suggestions.length === 1
              ? "We found 1 column that matches an earlier step by name."
              : `We found ${suggestions.length} columns that match earlier steps by name.`}
          </b>{" "}
          Check each one before using it — nothing is filled in until you
          choose.
        </span>
      </p>
      <ul className="flex flex-col gap-1">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.columnIndex}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
            data-testid={`spreadsheet-suggestion-${fieldName}-${suggestion.columnIndex}`}
          >
            <span className="font-medium">{suggestion.columnName}</span>
            <span aria-hidden className="text-muted-foreground">
              &larr;
            </span>
            <span className="text-muted-foreground">
              {suggestion.sourceLabel} · {suggestion.outputLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={disabled}
              onClick={() => onAccept(suggestion)}
              data-testid={`spreadsheet-suggestion-accept-${fieldName}-${suggestion.columnIndex}`}
            >
              {`Use for ${suggestion.columnName}`}
            </Button>
          </li>
        ))}
      </ul>
      {suggestions.length > 1 ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={onAcceptAll}
            data-testid={`spreadsheet-suggestions-accept-all-${fieldName}`}
          >
            Use all {suggestions.length} suggestions
          </Button>
        </div>
      ) : null}
    </div>
  );
}
