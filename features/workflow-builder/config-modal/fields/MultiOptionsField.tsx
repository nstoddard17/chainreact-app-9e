"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FieldShell } from "./FieldShell";
import { FieldSetupHint } from "./FieldSetupHint";
import { classifyConfigFieldValue } from "@/core/workflows/configFieldClassification";
import { OptionsArrayBody } from "./StringArrayField";
import type { FieldRendererProps } from "./types";

/**
 * Multi-select body for `select` / `combobox` fields with `multiple: true`
 * (CONFIG-UX-AUDIT-1). Before this, both renderers surfaced an internal
 * "not supported by this renderer" error to workflow authors — a
 * developer message in a user-facing panel.
 *
 * Two paths, dispatched on metadata:
 *   - STATIC (`field.options`): searchable checkbox-style popover; picking
 *     toggles membership; chips below show the current selection.
 *   - ASYNC (`field.optionsSource`): delegates to StringArrayField's
 *     option-picker body — identical interaction (resolver-backed
 *     multi-pick with chips), same `deps` / `enabled` / owner-gating
 *     behavior.
 *
 * Value contract: writes `string[]`, matching every consumer's runtime
 * shape (Shopify `topics`, GA `metrics`/`dimensions`, Stripe
 * `enabledEvents`, Trello `idMembers`/`idLabels`, Airtable `fields`).
 * Removing the last item writes `undefined` so optional fields drop out
 * of the saved config.
 */

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export const MultiOptionsField: React.FC<FieldRendererProps> = (props) => {
  if (props.field.optionsSource) return <OptionsArrayBody {...props} />;
  return <StaticMultiPickBody {...props} />;
};

const StaticMultiPickBody: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const items = asStringArray(value);
  const controlId = `field-${field.name}`;
  const [open, setOpen] = React.useState(false);

  const options = field.options ?? [];
  const labelByValue = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const o of options) map[o.value] = o.label;
    return map;
  }, [options]);

  function toggle(optionValue: string): void {
    if (disabled) return;
    const next = items.includes(optionValue)
      ? items.filter((v) => v !== optionValue)
      : [...items, optionValue];
    onChange(next.length === 0 ? undefined : next);
  }

  function removeAt(index: number): void {
    if (disabled) return;
    const next = items.filter((_, i) => i !== index);
    onChange(next.length === 0 ? undefined : next);
  }

  if (options.length === 0) {
    // Meta drift (multi-select without options). Friendly copy only — the
    // config-meta guard test catches the drift in CI; authors should never
    // see renderer internals.
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="The choices for this field aren't available right now. Try reopening this step, or contact support if it keeps happening."
      >
        <Button variant="outline" disabled className="w-full justify-between">
          —
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </FieldShell>
    );
  }

  const triggerLabel =
    items.length === 0
      ? (field.placeholder ?? "Choose one or more…")
      : `${items.length} selected`;

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div className="flex flex-col gap-2" role="group" aria-labelledby={controlId}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={controlId}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={error ? true : undefined}
              disabled={disabled}
              data-testid={`multi-select-${field.name}`}
              className="w-full justify-between font-normal"
            >
              {triggerLabel}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0" align="start">
            <Command>
              <CommandInput placeholder={field.placeholder ?? "Search…"} />
              <CommandList>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {options.map((opt) => {
                    const selected = items.includes(opt.value);
                    return (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => toggle(opt.value)}
                        aria-selected={selected}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`}
                        />
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          {opt.description ? (
                            <span className="text-xs text-muted-foreground">
                              {opt.description}
                            </span>
                          ) : null}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {items.length > 0 ? (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={`field-${field.name}-chips`}
          >
            {items.map((item, i) => (
              <Badge key={item} variant="outline" className="gap-1 pr-1">
                <span>{labelByValue[item] ?? item}</span>
                <button
                  type="button"
                  aria-label={`Remove ${field.label} item ${labelByValue[item] ?? item}`}
                  onClick={() => removeAt(i)}
                  disabled={disabled}
                  className="rounded-sm p-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        {error ? null : (
          <FieldSetupHint
            state={classifyConfigFieldValue({
              value: items.length > 0 ? items : undefined,
              required: field.required,
            })}
            fieldLabel={field.label}
          />
        )}
      </div>
    </FieldShell>
  );
};
