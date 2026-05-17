"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `combobox` field renderer. Searchable single-select.
 *
 * Slice 3.1 scope: static options only (declared via FieldMeta.options).
 * Dynamic `optionsSource` lookups land in Slice 3.4 per-provider config
 * wrappers — they'll wrap this same Combobox primitive and supply
 * options via a hook (e.g. `useChannelList(integrationId)`).
 *
 * Multi-select (FieldMeta.multiple) is recognized but not yet
 * implemented — the renderer surfaces a clear "not supported" message
 * so meta authors aren't silently downgraded.
 */

export const ComboboxField: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const stringValue = typeof value === "string" ? value : "";
  const controlId = `field-${field.name}`;
  const [open, setOpen] = React.useState(false);

  if (field.multiple) {
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="Multi-select combobox not yet implemented (Slice 3.7)."
      >
        <Button variant="outline" disabled className="w-full justify-between">
          —
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </FieldShell>
    );
  }

  if (!field.options || field.options.length === 0) {
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="No options available. Combobox fields with `optionsSource` require a provider config wrapper (Slice 3.4)."
      >
        <Button variant="outline" disabled className="w-full justify-between">
          —
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </FieldShell>
    );
  }

  const options = field.options;
  const selected = options.find((o) => o.value === stringValue);

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
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
            className="w-full justify-between font-normal"
          >
            {selected ? selected.label : (field.placeholder ?? "Choose...")}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command>
            <CommandInput placeholder={field.placeholder ?? "Search..."} />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={(val) => {
                      onChange(val);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        opt.value === stringValue ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
};
