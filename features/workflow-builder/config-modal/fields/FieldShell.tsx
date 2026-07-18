"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Shared field shell: label + required marker + description + child
 * input + inline error message. Each renderer wraps its actual input
 * with this so layout, accessibility, and validation surfaces stay
 * consistent across the FieldMeta.type axis.
 *
 * V1 visual hints carried forward:
 *   - Required marker is a red asterisk after the label.
 *   - Helper / description text is 12px slate-500 (text-xs
 *     text-muted-foreground), one line per concept.
 *   - Error text is 12px destructive, stacked ABOVE the helper (Batch
 *     R1 — the error used to REPLACE the description, hiding the
 *     guidance the user needs to fix the error exactly when they need
 *     it most).
 */

export interface FieldShellProps {
  /** ID used to associate the Label `htmlFor` with the input control. */
  controlId: string;
  label: string;
  required: boolean;
  description?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
  className?: string;
}

export function FieldShell({
  controlId,
  label,
  required,
  description,
  error,
  children,
  className,
}: FieldShellProps) {
  const helperId = `${controlId}-help`;
  const errorId = `${controlId}-err`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1">
        <Label htmlFor={controlId}>{label}</Label>
        {required ? (
          <span
            aria-hidden="true"
            data-required="true"
            className="text-destructive"
          >
            *
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {description ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
