"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FieldRendererProps } from "./types";

/**
 * `boolean` field renderer. Switch primitive.
 *
 * Boolean fields don't use FieldShell's vertical stack — V1 lays them
 * out horizontally (label on the left, switch on the right) because a
 * single toggle doesn't justify a full row of vertical chrome. Required
 * marker still surfaces; helper / error stack below.
 */

export const BooleanField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const boolValue = value === true;
  const controlId = `field-${field.name}`;
  const helperId = `${controlId}-help`;
  const errorId = `${controlId}-err`;
  return (
    <div className={cn("flex flex-col gap-1.5")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Label htmlFor={controlId}>{field.label}</Label>
          {field.required ? (
            <span
              aria-hidden="true"
              data-required="true"
              className="text-destructive"
            >
              *
            </span>
          ) : null}
        </div>
        <Switch
          id={controlId}
          checked={boolValue}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? errorId : field.description ? helperId : undefined
          }
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : field.description ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {field.description}
        </p>
      ) : null}
    </div>
  );
};
