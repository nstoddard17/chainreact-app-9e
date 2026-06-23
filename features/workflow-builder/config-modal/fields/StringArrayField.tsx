"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  CommandList,
  CommandItem,
} from "@/components/ui/command";
import { normalizeDependsOn } from "@/contracts/actionMeta";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import { useGraphSlice } from "../../state/graphSlice";
import { useConfigSlice } from "../../state/configSlice";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `string-array` field renderer. Chip list of strings.
 *
 * Two modes (chosen by metadata; the free-text path is UNCHANGED from Slice
 * 3.13 so existing metas behave exactly as before):
 *
 *   - FREE TEXT (default, no `optionsSource`): the user types each item.
 *     Gmail `from[]` / `labelIds[]`, Outlook recipient filters, etc.
 *   - OPTION PICKER (CONFIG-FIELD-UX-SWEEP-2 Scope B — `optionsSource` set):
 *     per-chip picking from a resolver. Stores the array of stable resolver
 *     VALUES (ids), shows friendly LABELS on the chips, and — when
 *     `allowManualEntry` is set — also lets a power user append a raw typed
 *     id. No schema/handler change: the stored value is still `string[]`.
 *
 * Value contract (both modes):
 *   - Always writes `string[]`. Never JSON-encoded, never CSV.
 *   - Non-array initial values coerce to `[]`; non-string entries dropped.
 *   - Initial mount with a non-empty value does NOT fire `onChange`.
 *
 * Cap (`stringArrayMaxItems`) + required (FieldShell asterisk only) are
 * honored in both modes; the handler Zod schema stays authoritative.
 */

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") out.push(entry);
  }
  return out;
}

export const StringArrayField: React.FC<FieldRendererProps> = (props) => {
  // Dispatch on metadata. The free-text body is the original Slice 3.13 path.
  if (props.field.optionsSource) return <OptionsArrayBody {...props} />;
  return <FreeTextArrayBody {...props} />;
};

// ─── Free-text mode (Slice 3.13 — unchanged) ─────────────────────────────────

const FreeTextArrayBody: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
}) => {
  const items = asStringArray(value);
  const controlId = `field-${field.name}`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = React.useState("");

  const maxItems = field.stringArrayMaxItems;
  const atCap = maxItems !== undefined && items.length >= maxItems;

  function tryAdd(): void {
    if (disabled || atCap) return;
    const trimmed = pending.trim();
    if (trimmed.length === 0) return;
    if (items.includes(trimmed)) {
      setPending("");
      return;
    }
    onChange([...items, trimmed]);
    setPending("");
    inputRef.current?.focus();
  }

  function removeAt(index: number): void {
    if (disabled) return;
    onChange(items.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== "Enter") return;
    e.preventDefault();
    tryAdd();
  }

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div className="flex flex-col gap-2" role="group" aria-labelledby={controlId}>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={controlId}
            name={field.name}
            value={pending}
            placeholder={field.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `${controlId}-err` : field.description ? `${controlId}-help` : undefined
            }
            disabled={disabled || atCap}
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={tryAdd}
            disabled={disabled || atCap}
            aria-label={`Add ${field.label} item`}
          >
            <Plus className="h-4 w-4" />
            Add{atCap ? ` (max ${maxItems})` : ""}
          </Button>
        </div>
        <ChipList field={field} items={items} disabled={disabled} onRemove={removeAt} />
      </div>
    </FieldShell>
  );
};

// ─── Option-picker mode (Scope B) ────────────────────────────────────────────

const OptionsArrayBody: React.FC<FieldRendererProps> = ({
  field,
  value,
  error,
  onChange,
  disabled,
  deps,
  enabled,
  parentLabel,
}) => {
  const items = asStringArray(value);
  const controlId = `field-${field.name}`;
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const workflowId = useGraphSlice((s) => s.workflowId) ?? undefined;
  const nodeId = useConfigSlice((s) => s.activeNodeId) ?? undefined;

  const dependsOnNames = normalizeDependsOn(field.dependsOn);
  const gatedByParent = enabled === false && dependsOnNames.length > 0;

  const { state } = useOptionsSource({
    source: field.optionsSource ?? null,
    query: search,
    enabled: !gatedByParent,
    ...(deps !== undefined && { deps }),
    ...(workflowId !== undefined && { workflowId }),
    ...(nodeId !== undefined && { nodeId }),
  });

  // Persist picked-item labels so chips keep their friendly name even after the
  // option scrolls out of the loaded page / the list reloads on a new search.
  const [labelSnapshots, setLabelSnapshots] = React.useState<Record<string, string>>({});
  const loaded = React.useMemo(
    () => (state.status === "ready" || state.status === "loading" ? state.items : []),
    [state],
  );
  const labelByValue = React.useMemo(() => {
    const map: Record<string, string> = { ...labelSnapshots };
    for (const o of loaded) map[o.value] = o.label;
    return map;
  }, [labelSnapshots, loaded]);

  const maxItems = field.stringArrayMaxItems;
  const atCap = maxItems !== undefined && items.length >= maxItems;

  function addValue(val: string, label?: string): void {
    if (disabled || atCap) return;
    const v = val.trim();
    if (v.length === 0 || items.includes(v)) {
      setSearch("");
      return;
    }
    if (label) setLabelSnapshots((m) => ({ ...m, [v]: label }));
    onChange([...items, v]);
    setSearch("");
  }
  function removeAt(index: number): void {
    if (disabled) return;
    onChange(items.filter((_, i) => i !== index));
  }

  const trimmed = search.trim();
  const showManualEntry =
    field.allowManualEntry === true &&
    trimmed.length > 0 &&
    !loaded.some((o) => o.value === trimmed) &&
    !items.includes(trimmed);

  const triggerLabel = atCap
    ? `Maximum ${maxItems} reached`
    : `Add ${field.label.toLowerCase()}…`;

  return (
    <FieldShell
      controlId={controlId}
      label={field.label}
      required={field.required}
      description={field.description}
      error={error}
    >
      <div className="flex flex-col gap-2" role="group" aria-labelledby={controlId}>
        {gatedByParent ? (
          <Button
            id={controlId}
            type="button"
            variant="outline"
            disabled
            data-testid="string-array-parent-missing"
            className="w-full justify-between font-normal text-muted-foreground"
          >
            <span>{`Select ${parentLabel ?? dependsOnNames.join(", ")} first`}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id={controlId}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                disabled={disabled || atCap}
                data-testid={`string-array-${field.name}-add`}
                className="w-full justify-between font-normal"
              >
                {triggerLabel}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={field.placeholder ?? "Search…"}
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  {showManualEntry ? (
                    <CommandGroup>
                      <CommandItem
                        value={`__manual_entry__:${trimmed}`}
                        data-testid="string-array-manual-entry"
                        onSelect={() => addValue(trimmed)}
                      >
                        <Check className="mr-2 h-4 w-4 opacity-0" />
                        <span>
                          Use this ID: <span className="font-medium">{trimmed}</span>
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  ) : null}
                  {state.status === "loading" || state.status === "idle" ? (
                    <div
                      role="status"
                      className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      <span>Loading options…</span>
                    </div>
                  ) : null}
                  {state.status === "ready" ? (
                    <CommandGroup>
                      {state.items.map((opt) => {
                        const selected = items.includes(opt.value);
                        return (
                          <CommandItem
                            key={opt.value}
                            value={opt.value}
                            onSelect={() => addValue(opt.value, opt.label)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`}
                            />
                            <span>{opt.label}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : null}
                  {state.status === "empty" && !showManualEntry ? (
                    <CommandEmpty>No matches.</CommandEmpty>
                  ) : null}
                  {state.status === "error" ? (
                    <p role="alert" className="px-2 py-3 text-xs text-destructive">
                      {state.message}
                    </p>
                  ) : null}
                  {state.status === "disconnected" || state.status === "needs-reconnect" ? (
                    <p
                      role="alert"
                      data-testid="string-array-disconnected"
                      className="px-2 py-3 text-xs text-muted-foreground"
                    >
                      Reconnect {state.provider} in Apps to load options.
                    </p>
                  ) : null}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        <ChipList
          field={field}
          items={items}
          disabled={disabled}
          onRemove={removeAt}
          labelByValue={labelByValue}
        />
      </div>
    </FieldShell>
  );
};

// ─── Shared chip list ────────────────────────────────────────────────────────

function ChipList({
  field,
  items,
  disabled,
  onRemove,
  labelByValue,
}: {
  field: FieldRendererProps["field"];
  items: readonly string[];
  disabled: boolean | undefined;
  onRemove: (index: number) => void;
  /** Option-picker mode supplies value→label so chips show friendly names. */
  labelByValue?: Readonly<Record<string, string>>;
}): React.ReactElement {
  if (items.length === 0) {
    return <p className="text-xs italic text-muted-foreground">No items.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={`field-${field.name}-chips`}>
      {items.map((item, i) => {
        const label = labelByValue?.[item] ?? item;
        return (
          <Badge key={`${i}-${item}`} variant="outline" className="gap-1 pr-1">
            <span>{label}</span>
            <button
              type="button"
              aria-label={`Remove ${field.label} item ${label}`}
              onClick={() => onRemove(i)}
              disabled={disabled}
              className="rounded-sm p-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
