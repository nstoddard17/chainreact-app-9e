"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { FieldShell } from "./FieldShell";
import type { FieldMeta, ObjectListItemField } from "@/contracts/actionMeta";
import type { FieldRendererProps } from "./types";
import { ItemFieldPicker, hasItemFieldPicker } from "./_itemFieldPicker";

/**
 * `object-list` field renderer (CONFIG-UX-AUDIT-1) — repeating rows of a
 * small fixed-shape object declared by `FieldMeta.itemFields`. Replaces
 * the paste-JSON textareas that previously fronted array-of-object
 * configs (HubSpot webhook subscriptions, Stripe line items, Shopify
 * order line items, Mailchimp segment conditions).
 *
 * RESOLVERS-3 — a sub-field that declares `optionsSource` renders a REAL
 * account-aware picker per row (delegated to ComboboxField via
 * `_itemFieldPicker`) instead of a raw text box, so a provider id inside a
 * row (Stripe `lineItems[].priceId`, Shopify `line_items[].variant_id`) is
 * chosen, not hand-typed. The picker is ADDITIVE: manual entry and
 * `{{upstream}}` variable mapping still work, and the committed row shape is
 * unchanged (a `number` sub-field still commits a number).
 *
 * Value contract:
 *   - Writes a REAL `Array<Record<string, string | number | boolean>>` —
 *     never a JSON-encoded string. This matches what the runtime Zod
 *     schemas / activation hooks always expected (paste-JSON literals
 *     were stored as strings and REJECTED at runtime).
 *   - A sub-field hidden by `visibleWhen` is omitted from the row object.
 *   - Empty optional text/number sub-fields are omitted; `0` and `false`
 *     are kept (explicit choices are never dropped).
 *   - Removing the last row writes `undefined` so optional fields drop
 *     out of the saved config.
 *
 * The runtime schema stays authoritative for validation; the renderer's
 * `required` markers are UI affordances.
 */

type RowValue = Record<string, string | number | boolean>;

function asRows(value: unknown): RowValue[] {
  if (!Array.isArray(value)) return [];
  const rows: RowValue[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const row: RowValue = {};
      for (const [k, v] of Object.entries(entry)) {
        if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
        ) {
          row[k] = v;
        }
      }
      rows.push(row);
    }
  }
  return rows;
}

function isSubFieldVisible(
  sub: ObjectListItemField,
  row: RowValue,
): boolean {
  const w = sub.visibleWhen;
  if (!w) return true;
  const gate = row[w.field];
  if (typeof gate !== "string" || gate.length === 0) return false;
  if (w.valueEndsWith !== undefined && !gate.endsWith(w.valueEndsWith)) {
    return false;
  }
  if (w.valueIn !== undefined && !w.valueIn.includes(gate)) return false;
  return true;
}

/** Drop hidden sub-field keys + empty optional strings from a row. */
function normalizeRow(
  row: RowValue,
  itemFields: readonly ObjectListItemField[],
): RowValue {
  const out: RowValue = {};
  for (const sub of itemFields) {
    if (!isSubFieldVisible(sub, row)) continue;
    const v = row[sub.name];
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim().length === 0) continue;
    out[sub.name] = v;
  }
  return out;
}

export const ObjectListField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
  formValues,
  formFields,
}) => {
  const rows = asRows(value);
  const controlId = `field-${field.name}`;
  const itemFields = field.itemFields ?? [];
  const maxItems = field.listMaxItems;
  const atCap = maxItems !== undefined && rows.length >= maxItems;

  if (itemFields.length === 0) {
    // Meta drift (object-list without itemFields). The contract's
    // superRefine rejects this at meta-load; this is a friendly-copy
    // safety net only.
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="This field can't be edited here right now. Try reopening this step, or contact support if it keeps happening."
      >
        <div />
      </FieldShell>
    );
  }

  function commit(next: RowValue[]): void {
    if (next.length === 0) {
      onChange(undefined);
      return;
    }
    onChange(next.map((row) => normalizeRow(row, itemFields)));
  }

  function updateRow(index: number, name: string, v: string | number | boolean | undefined): void {
    const next = rows.map((row, i) => {
      if (i !== index) return row;
      const updated: RowValue = { ...row };
      if (v === undefined) delete updated[name];
      else updated[name] = v;
      return updated;
    });
    commit(next);
  }

  function addRow(): void {
    if (disabled || atCap) return;
    commit([...rows, {}]);
  }

  function removeRow(index: number): void {
    if (disabled) return;
    commit(rows.filter((_, i) => i !== index));
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div
        className="flex flex-col gap-3"
        role="group"
        aria-labelledby={controlId}
        data-testid={`object-list-${field.name}`}
      >
        {rows.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            Nothing added yet.
          </p>
        ) : null}
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border p-3"
            data-testid={`object-list-${field.name}-row-${i}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {i + 1}.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${field.label} entry ${i + 1}`}
                onClick={() => removeRow(i)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {itemFields.map((sub) =>
              isSubFieldVisible(sub, row) ? (
                <SubFieldInput
                  key={sub.name}
                  sub={sub}
                  rowIndex={i}
                  fieldName={field.name}
                  fieldLabel={field.label}
                  value={row[sub.name]}
                  disabled={disabled}
                  formValues={formValues}
                  formFields={formFields}
                  onChange={(v) => updateRow(i, sub.name, v)}
                />
              ) : null,
            )}
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={disabled || atCap}
            data-testid={`object-list-${field.name}-add`}
          >
            <Plus className="h-4 w-4" />
            Add{atCap ? ` (max ${maxItems})` : ""}
          </Button>
        </div>
      </div>
    </FieldShell>
  );
};

function SubFieldInput({
  sub,
  rowIndex,
  fieldName,
  fieldLabel,
  value,
  disabled,
  formValues,
  formFields,
  onChange,
}: {
  sub: ObjectListItemField;
  rowIndex: number;
  fieldName: string;
  fieldLabel: string;
  value: string | number | boolean | undefined;
  disabled: boolean | undefined;
  formValues: Readonly<Record<string, unknown>> | undefined;
  formFields: readonly FieldMeta[] | undefined;
  onChange: (v: string | number | boolean | undefined) => void;
}): React.ReactElement {
  const inputId = `object-list-${fieldLabel}-${rowIndex}-${sub.name}`;
  const ariaLabel = `${sub.label} (entry ${rowIndex + 1})`;

  // RESOLVERS-3 — picker path. Checked BEFORE the type branches: the
  // sub-field's `type` stays its VALUE type (the picker still commits a
  // number for a `number` sub-field), `optionsSource` only upgrades the
  // widget. The control name is row-qualified so each row gets its own DOM
  // id / testids instead of duplicates.
  if (hasItemFieldPicker(sub)) {
    return (
      <ItemFieldPicker
        sub={sub}
        controlName={`${fieldName}-${rowIndex}-${sub.name}`}
        value={value}
        disabled={disabled}
        formValues={formValues}
        formFields={formFields}
        onChange={onChange}
      />
    );
  }

  if (sub.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm" htmlFor={inputId}>
        <Switch
          id={inputId}
          aria-label={ariaLabel}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <span>
          {sub.label}
          {sub.required ? <span aria-hidden> *</span> : null}
        </span>
      </label>
    );
  }

  if (sub.type === "select") {
    return (
      <div className="flex flex-col gap-1">
        <SubFieldLabel inputId={inputId} sub={sub} />
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
        >
          <SelectTrigger id={inputId} aria-label={ariaLabel}>
            <SelectValue placeholder={sub.placeholder ?? "Choose…"} />
          </SelectTrigger>
          <SelectContent>
            {(sub.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sub.description ? (
          <p className="text-xs text-muted-foreground">{sub.description}</p>
        ) : null}
      </div>
    );
  }

  if (sub.type === "number") {
    return (
      <div className="flex flex-col gap-1">
        <SubFieldLabel inputId={inputId} sub={sub} />
        <Input
          id={inputId}
          type="number"
          aria-label={ariaLabel}
          placeholder={sub.placeholder}
          value={typeof value === "number" ? String(value) : ""}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.trim() === "") {
              onChange(undefined);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : undefined);
          }}
        />
        {sub.description ? (
          <p className="text-xs text-muted-foreground">{sub.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <SubFieldLabel inputId={inputId} sub={sub} />
      <Input
        id={inputId}
        aria-label={ariaLabel}
        placeholder={sub.placeholder}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {sub.description ? (
        <p className="text-xs text-muted-foreground">{sub.description}</p>
      ) : null}
    </div>
  );
}

function SubFieldLabel({
  inputId,
  sub,
}: {
  inputId: string;
  sub: ObjectListItemField;
}): React.ReactElement {
  return (
    <label className="text-xs font-medium" htmlFor={inputId}>
      {sub.label}
      {sub.required ? (
        <span className="text-destructive" aria-hidden>
          {" "}
          *
        </span>
      ) : null}
    </label>
  );
}
