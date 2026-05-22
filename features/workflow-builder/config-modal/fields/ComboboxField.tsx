"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
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
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import type { OptionItem } from "@/lib/api/options";

/**
 * `combobox` field renderer. Searchable single-select.
 *
 * Static path (Slice 3.1): `field.options` declared on the meta.
 * Async path (Slice 3.31): `field.optionsSource` set — items loaded
 * via `useOptionsSource` against `lib/api/options.ts`. The two are
 * mutually exclusive per `FieldMetaSchema`'s `superRefine`.
 *
 * Multi-select (FieldMeta.multiple) is recognized but not yet
 * implemented — the renderer surfaces a clear "not supported" message
 * so meta authors aren't silently downgraded.
 *
 * Async UX per docs/slices/phase-3/options-source-plan.md §7.1:
 *   - loading: spinner row
 *   - ready: items
 *   - empty: "No matches."
 *   - error: inline message + retry button (via hook.refetch)
 *   - disconnected: "Connect <provider> first" message
 *   - idle (caller signaled enabled=false): "Select <parent> first"
 *     style helper text (rendered when `dependsOn` is set; the
 *     parent's label drives the wording)
 *
 * `dependsOn` cascade plumbing is intentionally minimal for v1: the
 * field accepts `deps` + `enabled` via the meta's `dependsOn` field
 * read against a `parentValues` map supplied by SchemaForm in a later
 * slice. Today (Slice 3.31), neither `dependsOn` cascade nor parent-
 * change clearing is wired through SchemaForm — that lands in Slice
 * 3.33 per the plan. The async renderer still works standalone for
 * dependency-free sources like `native:examples`.
 */

interface AsyncComboboxBodyProps {
  controlId: string;
  field: FieldRendererProps["field"];
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
  disabled: boolean | undefined;
}

const AsyncComboboxBody: React.FC<AsyncComboboxBodyProps> = ({
  controlId,
  field,
  value,
  onChange,
  error,
  disabled,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");

  const { state, refetch } = useOptionsSource({
    source: field.optionsSource ?? null,
    query: searchInput,
  });

  // Selected-option lookup. When the user picks an option, we cache its
  // label so the trigger keeps showing it even if the next search filter
  // would hide it from the visible list. Pre-existing values (e.g.
  // re-opening a saved workflow) won't have this cached, so the trigger
  // falls back to the raw `value` until the items load.
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<
    OptionItem | null
  >(null);

  const knownSelected = React.useMemo<OptionItem | null>(() => {
    if (selectedSnapshot && selectedSnapshot.value === value) {
      return selectedSnapshot;
    }
    if (state.status === "ready" || state.status === "loading") {
      const match = state.items.find((o) => o.value === value);
      return match ?? null;
    }
    return null;
  }, [selectedSnapshot, state, value]);

  const triggerLabel = value
    ? (knownSelected?.label ?? value)
    : (field.placeholder ?? "Choose...");

  const renderList = (): React.ReactNode => {
    switch (state.status) {
      case "idle":
      case "loading":
        return (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>Loading options…</span>
          </div>
        );
      case "ready":
        return (
          <>
            <CommandGroup>
              {state.items.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={(val) => {
                    onChange(val);
                    setSelectedSnapshot(opt);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      opt.value === value ? "opacity-100" : "opacity-0",
                    )}
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
              ))}
            </CommandGroup>
            {state.hasMore ? (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                Showing first results. Refine search to narrow.
              </p>
            ) : null}
          </>
        );
      case "empty":
        return <CommandEmpty>No matches.</CommandEmpty>;
      case "error":
        return (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 px-2 py-3 text-xs text-destructive"
          >
            <span>{state.message}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-1.5 h-3 w-3" aria-hidden />
              Try again
            </Button>
          </div>
        );
      case "disconnected":
        return (
          <div
            role="alert"
            className="flex flex-col items-start gap-1 px-2 py-3 text-xs text-muted-foreground"
          >
            <span>Connect {state.provider} first to load options.</span>
          </div>
        );
      default: {
        const _never: never = state;
        return _never;
      }
    }
  };

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
            {triggerLabel}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={field.placeholder ?? "Search..."}
              value={searchInput}
              onValueChange={setSearchInput}
            />
            <CommandList>{renderList()}</CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
};

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

  // Async path — meta declared `optionsSource`. The static-options
  // branch and the async branch never coexist (the contract's
  // `superRefine` rejects metas declaring both).
  if (field.optionsSource) {
    return (
      <AsyncComboboxBody
        controlId={controlId}
        field={field}
        value={stringValue}
        onChange={(next) => onChange(next)}
        error={error}
        disabled={disabled}
      />
    );
  }

  if (!field.options || field.options.length === 0) {
    return (
      <FieldShell
        controlId={controlId}
        label={field.label}
        required={field.required}
        description={field.description}
        error="No options available. Combobox fields require static `options` or a dynamic `optionsSource`."
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
