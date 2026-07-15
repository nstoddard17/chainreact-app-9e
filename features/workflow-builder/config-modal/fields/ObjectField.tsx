"use client";

import * as React from "react";
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
import type { ObjectListItemField } from "@/contracts/actionMeta";
import type { FieldRendererProps } from "./types";

/**
 * `object` field renderer (CONFIG-UX-SETUP-ADVANCED-1) — a SINGLE small
 * fixed-key object edited as labeled sub-fields, declared by the same
 * `itemFields` shape object-list rows use. Replaces paste-JSON for flat
 * object configs (Mailchimp audience contact / campaign defaults, Shopify
 * order addresses, Stripe automaticTax) so a normal user fills in plain
 * inputs instead of hand-authoring a JSON literal.
 *
 * Value contract:
 *   - Commits a REAL `Record<string, string | number | boolean>` — the
 *     shape the runtime Zod schemas always expected. Never a JSON string.
 *   - Empty optional sub-fields are omitted; `0` / `false` are kept.
 *   - When every known sub-field is empty AND no unknown keys exist, the
 *     field commits `undefined` so optional objects drop out of config.
 *   - Backward compatibility: keys present in a SAVED value that the meta
 *     does not declare are preserved verbatim on every commit — the UI
 *     never drops data it doesn't understand.
 *
 * The runtime schema stays authoritative for validation; `required`
 * markers here are UI affordances.
 */

type ObjectValue = Record<string, string | number | boolean>;

function asObject(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ObjectValue = {};
  for (const [k, v] of Object.entries(value)) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      out[k] = v;
    }
  }
  return out;
}

export const ObjectField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const current = asObject(value);
  const controlId = `field-${field.name}`;
  const itemFields = field.itemFields ?? [];
  const knownNames = new Set(itemFields.map((s) => s.name));

  if (itemFields.length === 0) {
    // Meta drift safety net — the contract superRefine rejects this at
    // meta load; friendly copy only.
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

  function commit(next: ObjectValue): void {
    // Preserve unknown saved keys verbatim; drop known keys whose value
    // is an empty string.
    const out: ObjectValue = {};
    for (const [k, v] of Object.entries(next)) {
      if (knownNames.has(k) && typeof v === "string" && v.trim().length === 0) {
        continue;
      }
      out[k] = v;
    }
    onChange(Object.keys(out).length === 0 ? undefined : out);
  }

  function updateKey(name: string, v: string | number | boolean | undefined): void {
    const next: ObjectValue = { ...current };
    if (v === undefined) delete next[name];
    else next[name] = v;
    commit(next);
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
        className="flex flex-col gap-2 rounded-md border p-3"
        role="group"
        aria-labelledby={controlId}
        data-testid={`object-${field.name}`}
      >
        {itemFields.map((sub) => (
          <ObjectSubFieldInput
            key={sub.name}
            sub={sub}
            fieldName={field.name}
            value={current[sub.name]}
            disabled={disabled}
            onChange={(v) => updateKey(sub.name, v)}
          />
        ))}
      </div>
    </FieldShell>
  );
};

function ObjectSubFieldInput({
  sub,
  fieldName,
  value,
  disabled,
  onChange,
}: {
  sub: ObjectListItemField;
  fieldName: string;
  value: string | number | boolean | undefined;
  disabled: boolean | undefined;
  onChange: (v: string | number | boolean | undefined) => void;
}): React.ReactElement {
  const inputId = `object-${fieldName}-${sub.name}`;

  if (sub.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm" htmlFor={inputId}>
        <Switch
          id={inputId}
          aria-label={sub.label}
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
        <SubLabel inputId={inputId} sub={sub} />
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
        >
          <SelectTrigger id={inputId} aria-label={sub.label}>
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
        <SubLabel inputId={inputId} sub={sub} />
        <Input
          id={inputId}
          type="number"
          aria-label={sub.label}
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
      <SubLabel inputId={inputId} sub={sub} />
      <Input
        id={inputId}
        aria-label={sub.label}
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

function SubLabel({
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
