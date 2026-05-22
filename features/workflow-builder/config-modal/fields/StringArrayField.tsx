"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldShell } from "./FieldShell";
import type { FieldRendererProps } from "./types";

/**
 * `string-array` field renderer. Free-text chip list.
 *
 * Slice 3.13 — generic renderer for `string[]` config fields. Used by
 * Gmail `from[]` / `labelIds[]` and any future provider field whose
 * value is a user-typed list of strings (Outlook recipient filters,
 * Microsoft Graph mailbox filters, …). DISTINCT from `select` /
 * `combobox` + `multiple`, which represents multi-pick from a known
 * options set — `string-array` is "user types each item."
 *
 * Value contract:
 *   - Always writes `string[]`. Never JSON-encoded, never CSV.
 *   - Non-array initial values coerce to `[]` (defense — same pattern
 *     as KeyValueField). Non-string entries are filtered out.
 *   - Initial mount with a non-empty value does NOT fire `onChange`
 *     (avoids spurious dirty flag — the parent's draft already holds
 *     the value).
 *
 * Add behavior:
 *   - Input + Add button. Enter inside the input also adds, keeps
 *     focus, and clears the input for fast bulk entry.
 *   - Trim new items on add.
 *   - Whitespace-only input: silently rejected — no onChange, input
 *     keeps the user's literal whitespace (they may add a non-empty
 *     char and press Enter again).
 *   - Exact-string duplicate of an existing item: silently rejected —
 *     no error toast / chip. The input clears so the user knows the
 *     attempt landed; matches Notion/Linear/Stripe chip-input UX.
 *
 * Remove behavior:
 *   - Each chip carries an inline ✕ button. One click removes.
 *
 * Cap:
 *   - `field.stringArrayMaxItems` is honored. At the cap, Add button
 *     disables + label reads "Add (max N)"; Enter inside the input is
 *     inert. The handler Zod schema enforces the authoritative cap;
 *     this is a UI hint.
 *
 * Required:
 *   - Surfaced via FieldShell's asterisk only. The renderer does NOT
 *     enforce "non-empty when required" — that belongs to the handler
 *     Zod schema. Same approach as KeyValueField.
 *
 * No variable picker — Slice 3.13 scope. A future slice can opt-in via
 * a meta flag if a provider needs `{{trigger.x}}` tokens per chip.
 *
 * No async option loading — Slice 3.13 scope. A future slice with
 * `optionsSource` loaders pairs with select/combobox + multiple, not
 * with this free-text renderer.
 */

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") out.push(entry);
  }
  return out;
}

export const StringArrayField: React.FC<FieldRendererProps> = ({
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
    if (trimmed.length === 0) return; // silent reject
    if (items.includes(trimmed)) {
      // silent dedupe — clear the input so the user knows the attempt
      // landed but produced no new chip.
      setPending("");
      return;
    }
    onChange([...items, trimmed]);
    setPending("");
    inputRef.current?.focus();
  }

  function removeAt(index: number): void {
    if (disabled) return;
    const next = items.filter((_, i) => i !== index);
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== "Enter") return;
    // Prevent Enter from submitting any enclosing form.
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
        {items.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No items.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" data-testid={`field-${field.name}-chips`}>
            {items.map((item, i) => (
              <Badge
                key={`${i}-${item}`}
                variant="outline"
                className="gap-1 pr-1"
              >
                <span>{item}</span>
                <button
                  type="button"
                  aria-label={`Remove ${field.label} item ${item}`}
                  onClick={() => removeAt(i)}
                  disabled={disabled}
                  className="rounded-sm p-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
};
