"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { FieldMeta } from "@/contracts/actionMeta";
import type { GuidedSpreadsheetAdapter } from "./guidedSpreadsheetAdapters";

/**
 * Step 3 — "Confirm how it's written" (SHEETS-GUIDED-CONFIG-1).
 *
 * The action's own `select` fields, rendered as radio groups so both
 * outcomes are readable side by side instead of hidden behind a closed
 * dropdown. The values committed are the field's declared option values,
 * unchanged — this is presentation, not a second vocabulary.
 *
 * Two rules here are user-safety rules, not styling:
 *
 *   1. **A recommendation is not a selection.** `valueInputOption` is a
 *      Q11 field: it decides whether "=SUM(A1:A9)" becomes a formula or
 *      stays text, so ChainReact must not answer it on the user's
 *      behalf. The recommended option carries a *label*; nothing is
 *      pre-checked, and readiness keeps naming the choice until it is
 *      made. A field that legitimately has a declared default (such as
 *      `insertDataOption`) does show that default as the current answer.
 *   2. **The destructive option warns in words.** The warning is text
 *      tied to the option with `aria-describedby`, in a live region, so
 *      it is not carried by colour alone.
 */

export interface GuidedWriteStepProps {
  readonly adapter: GuidedSpreadsheetAdapter;
  readonly fields: readonly FieldMeta[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly disabled?: boolean;
  readonly emptyCopy: string;
}

export function GuidedWriteStep({
  adapter,
  fields,
  values,
  onChange,
  disabled,
  emptyCopy,
}: GuidedWriteStepProps) {
  const writeFields = adapter.writeBehaviorFields
    .map((name) => fields.find((f) => f.name === name))
    .filter((f): f is FieldMeta => f !== undefined);

  if (writeFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="guided-write-empty">
        {emptyCopy}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {writeFields.map((field) => {
        const recommended = adapter.recommendedValues?.[field.name];
        const danger = adapter.dangerValues?.[field.name];
        // A declared default IS the current answer; a Q11 field with no
        // default stays genuinely unanswered until the user picks.
        const current =
          typeof values[field.name] === "string"
            ? (values[field.name] as string)
            : field.defaultValue !== undefined
              ? String(field.defaultValue)
              : "";
        const dangerSelected = danger !== undefined && current === danger;
        const warningId = `guided-write-${field.name}-warning`;
        const dangerOption = (field.options ?? []).find(
          (o) => o.value === danger,
        );

        return (
          <fieldset
            key={field.name}
            className="min-w-0 border-0 p-0"
            data-testid={`guided-write-${field.name}`}
          >
            <legend className="mb-1.5 text-xs font-medium text-foreground">
              {field.label}
              {field.required ? (
                <span className="ml-1 text-destructive" aria-hidden>
                  *
                </span>
              ) : null}
            </legend>
            {field.description ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {field.description}
              </p>
            ) : null}
            <div
              role="radiogroup"
              aria-label={field.label}
              className="flex flex-col gap-2"
            >
              {(field.options ?? []).map((option) => {
                const checked = current === option.value;
                const isDanger = option.value === danger;
                const inputId = `guided-write-${field.name}-${option.value}`;
                return (
                  <label
                    key={option.value}
                    htmlFor={inputId}
                    className={`flex min-w-0 cursor-pointer gap-2.5 rounded-md border p-2.5 ${
                      checked ? "border-primary bg-primary/5" : "border-input"
                    }`}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name={`guided-write-${field.name}`}
                      value={option.value}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onChange(field.name, option.value)}
                      className="mt-0.5 shrink-0 accent-[var(--builder-accent)]"
                      {...(isDanger && dangerSelected
                        ? { "aria-describedby": warningId }
                        : {})}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {option.label}
                        {recommended === option.value ? (
                          <span
                            className="ml-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                            data-testid={`guided-write-${field.name}-recommended`}
                          >
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {/* Always-present live region: announces when the risky option is
                chosen, without the container appearing and shifting layout. */}
            <div role="status" aria-live="polite">
              {dangerSelected ? (
                <p
                  id={warningId}
                  data-testid={`guided-write-${field.name}-danger`}
                  className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
                >
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    {dangerOption?.description ??
                      "This can permanently erase existing data."}
                  </span>
                </p>
              ) : null}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
