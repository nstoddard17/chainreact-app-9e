"use client";

import * as React from "react";
import { File as FileIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `file` field renderer — placeholder for FileRef-aware fields.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.7: the real
 * file-picker / FileRef variable-picker UX lands alongside the variable
 * picker. For Slice 3.1, the renderer surfaces:
 *   - The field label + required + description (so authors see it
 *     exists during early-slice usage).
 *   - A text input as a typed-fallback (authors can paste a FileRef id
 *     literal if they need to wire one before the picker ships).
 *   - A "File picker arrives in Slice 3.7" helper that supplements (not
 *     replaces) the field's description.
 *
 * This keeps file-typed fields in the form surface (saves don't fail
 * just because the picker isn't ready) without pretending we have full
 * support.
 */

export const FileField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;
  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={
        field.description
          ? `${field.description} (File picker lands in Slice 3.7.)`
          : "File picker / variable FileRef selection lands in Slice 3.7."
      }
      error={error}
    >
      <div className="flex items-center gap-2">
        <FileIcon className="h-4 w-4 text-muted-foreground" />
        <Input
          id={controlId}
          name={field.name}
          value={stringValue}
          placeholder={field.placeholder ?? "Paste a FileRef id…"}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
          }
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </FieldShell>
  );
};
