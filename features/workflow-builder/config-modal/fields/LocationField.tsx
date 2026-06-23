"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import {
  fetchLocationSuggestions,
  type LocationSuggestion,
} from "@/lib/api/geoapify";
import type { FieldRendererProps } from "./types";

/**
 * `location` field renderer — address autocomplete backed by the server-proxied
 * Geoapify route (`/api/geoapify/autocomplete`), with a free-text fallback.
 *
 * Value contract: a plain string — the formatted address the provider field
 * already accepts (e.g. Google Calendar `location`). Picking a suggestion
 * stores its `label`; typing freely stores exactly what was typed. No
 * `place_id` / lat-lng is stored (launch scope). `undefined` when cleared.
 *
 * Safety / behavior:
 *   - The browser only ever calls our own route; the Geoapify key is server-
 *     only and never reaches the client.
 *   - Queries are debounced and very short inputs are skipped (no fetch).
 *   - `{{variable}}` tokens are never sent to the autocomplete (treated as
 *     free text), so upstream variable references work unchanged.
 *   - Any failure (no key, error, no matches) degrades to a normal text input —
 *     never a dead control.
 */

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

function looksLikeVariable(value: string): boolean {
  return value.includes("{{");
}

export const LocationField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;

  // `query` is the text to autocomplete on. It is set ONLY by user typing —
  // selecting a suggestion sets the value but clears `query` so we don't
  // immediately re-search the chosen address.
  const [query, setQuery] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<LocationSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);

  const describedBy = error
    ? `${controlId}-err`
    : field.description
      ? `${controlId}-help`
      : undefined;

  React.useEffect(() => {
    if (query === null) return;
    const trimmed = query.trim();

    // Skip short inputs and variable tokens — no network call, clear the list.
    if (trimmed.length < MIN_QUERY_LENGTH || looksLikeVariable(trimmed)) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchLocationSuggestions(trimmed, { signal: controller.signal })
        .then((items) => {
          setSuggestions(items);
        })
        .catch(() => {
          // AbortError or anything else → leave the field as free text.
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const commitFreeText = (raw: string) => {
    onChange(raw === "" ? undefined : raw);
    setQuery(raw);
    setOpen(true);
  };

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    onChange(suggestion.label);
    setQuery(null);
    setSuggestions([]);
    setOpen(false);
  };

  const showList = open && suggestions.length > 0 && !disabled;

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div className="relative">
        <Input
          id={controlId}
          name={field.name}
          type="text"
          autoComplete="off"
          data-testid={`location-${field.name}`}
          value={stringValue}
          placeholder={field.placeholder ?? "Start typing an address…"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-autocomplete="list"
          aria-expanded={showList}
          disabled={disabled}
          onChange={(e) => commitFreeText(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          // Delay close so a suggestion mousedown registers first.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {showList ? (
          <ul
            role="listbox"
            data-testid={`location-${field.name}-suggestions`}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-popover py-1 text-sm shadow-md"
          >
            {suggestions.map((suggestion, i) => (
              <li key={`${suggestion.placeId ?? suggestion.label}-${i}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-start px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  // mousedown (not click) so selection fires before input blur.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(suggestion);
                  }}
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FieldShell>
  );
};
