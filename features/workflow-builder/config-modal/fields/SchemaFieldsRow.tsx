"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserSchemaFieldType } from "@/contracts/aiProcessing";
import {
  SCHEMA_FIELD_TYPES,
  normalizeSchemaFieldName,
  type SchemaFieldRow,
} from "./_schemaFieldsValidator";

/**
 * One editable row of the `schema-fields` editor (AI-PROVIDER-4 CS-4).
 *
 * Extracted from `SchemaFieldsField` so each file stays inside the repo's
 * 400-line lint ceiling and the row's local editing behavior (normalize on
 * blur, not on keystroke) is testable on its own.
 */

const TYPE_LABEL: Readonly<Record<UserSchemaFieldType, string>> = {
  string: "Text",
  number: "Number",
  boolean: "Yes / No",
  date: "Date",
  currency: "Currency",
};

export interface SchemaFieldsRowProps {
  readonly row: SchemaFieldRow;
  readonly index: number;
  readonly rowCount: number;
  readonly error?: string | undefined;
  readonly disabled?: boolean;
  readonly onChange: (index: number, next: SchemaFieldRow) => void;
  readonly onRemove: (index: number) => void;
  readonly onMove: (index: number, direction: -1 | 1) => void;
}

export function SchemaFieldsRow({
  row,
  index,
  rowCount,
  error,
  disabled,
  onChange,
  onRemove,
  onMove,
}: SchemaFieldsRowProps) {
  // Local name state so normalization happens on BLUR — normalizing every
  // keystroke fights the user mid-word ("employee " → "employee").
  const [nameDraft, setNameDraft] = React.useState(row.name);
  React.useEffect(() => {
    setNameDraft(row.name);
  }, [row.name]);

  const commitName = () => {
    const normalized = normalizeSchemaFieldName(nameDraft);
    setNameDraft(normalized);
    if (normalized !== row.name) onChange(index, { ...row, name: normalized });
  };

  const rowLabel = `Field ${index + 1}`;

  return (
    <li
      data-testid={`schema-field-row-${index}`}
      className="flex flex-col gap-1.5 px-2.5 py-2"
      style={{
        borderBottom:
          index === rowCount - 1 ? "0" : "1px solid var(--builder-border)",
      }}
    >
      <div className="flex items-start gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Input
            aria-label={`${rowLabel} name`}
            placeholder="employee_name"
            value={nameDraft}
            disabled={disabled}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            aria-invalid={error !== undefined ? true : undefined}
          />
          <Input
            aria-label={`${rowLabel} description`}
            placeholder="What this field means (optional)"
            value={row.description ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const description = e.target.value;
              onChange(index, {
                ...row,
                ...(description.trim() === "" ? {} : { description }),
                ...(description.trim() === "" ? { description: undefined } : {}),
              });
            }}
          />
        </div>
        <div className="flex w-[124px] shrink-0 flex-col gap-1.5">
          <Select
            value={row.type}
            disabled={disabled}
            onValueChange={(next) =>
              onChange(index, { ...row, type: next as UserSchemaFieldType })
            }
          >
            <SelectTrigger aria-label={`${rowLabel} type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEMA_FIELD_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-[11px]">
            <Switch
              aria-label={`${rowLabel} required`}
              checked={row.required === true}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(index, {
                  ...row,
                  ...(checked ? { required: true } : { required: undefined }),
                })
              }
            />
            <span style={{ color: "var(--builder-muted)" }}>Required</span>
          </label>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${rowLabel} up`}
            disabled={disabled || index === 0}
            onClick={() => onMove(index, -1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${rowLabel} down`}
            disabled={disabled || index === rowCount - 1}
            onClick={() => onMove(index, 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${rowLabel}`}
            disabled={disabled}
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="text-[11px]"
          style={{ color: "var(--builder-danger)" }}
        >
          {error}
        </p>
      ) : null}
    </li>
  );
}
