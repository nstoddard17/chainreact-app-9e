"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigFieldSetupState } from "@/core/workflows/configFieldClassification";

/**
 * Presentational setup hint rendered below a config field (Slice
 * 4.TEMPLATE-SETUP-UX-1).
 *
 * Driven entirely by the pure `classifyConfigFieldValue` state — the renderer
 * computes the state + an optional friendly source label and hands them here. It
 * never inspects the raw value, never resolves variables, never exposes a
 * `{{...}}` token or any id:
 *
 *   - `prefilled_variable` / `prefilled_mixed` -> a subtle "Pre-filled from
 *     earlier step" badge, plus the friendly source label when known
 *     ("Subject from the trigger"). This is the plain-English layer over the
 *     editable token shown in the input (the input remains the advanced/editor
 *     surface that intentionally exposes the token).
 *   - `needs_input` -> a quiet "Choose your <field>" prompt. It signals required
 *     setup WITHOUT implying ChainReact failed to fill it (these are
 *     account-specific resources only the user can pick).
 *   - everything else (`literal`, `optional_empty`, `unresolved_reference`) ->
 *     nothing. `unresolved_reference` is deliberately silent here because the
 *     field's own inline reference warning (`_variableValidator`) already
 *     surfaces it; this component must never paint an unresolved field as
 *     "pre-filled" / complete.
 */

export interface FieldSetupHintProps {
  readonly state: ConfigFieldSetupState;
  /** The field's display label, used to phrase the `needs_input` prompt. */
  readonly fieldLabel: string;
  /** Friendly source description for pre-filled fields, e.g. "Email from the Create Contact step". */
  readonly sourceLabel?: string | null;
  readonly className?: string;
}

export function FieldSetupHint({
  state,
  fieldLabel,
  sourceLabel,
  className,
}: FieldSetupHintProps) {
  if (state === "prefilled_variable" || state === "prefilled_mixed") {
    return (
      <p
        data-testid="field-prefill-hint"
        className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-xs", className)}
      >
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3" aria-hidden />
          Pre-filled from earlier step
        </span>
        {sourceLabel ? (
          <span className="text-muted-foreground" data-testid="field-prefill-source">
            {sourceLabel}
          </span>
        ) : null}
      </p>
    );
  }

  if (state === "needs_input") {
    return (
      <p
        data-testid="field-setup-required"
        role="note"
        className={cn("mt-1 text-xs text-muted-foreground", className)}
      >
        {`Choose your ${fieldLabel.toLowerCase()} to finish setting up this step.`}
      </p>
    );
  }

  return null;
}
