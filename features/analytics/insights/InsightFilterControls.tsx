"use client";

import { useState } from "react";
import {
  availableFilters,
  type InsightDataset,
  type InsightFilterDef,
  type InsightMeasure,
  type InsightSource,
} from "./insightCatalog";
import { InsightEntityPicker, type InsightEntityOption } from "./InsightEntityPicker";

/**
 * "Only include" — filter controls generated from catalog filter METADATA
 * (CD-3A). The widget rendered per filter follows its declared shape, never a
 * provider branch:
 *   - boolean            → on/off toggle (off = not sent).
 *   - category + values  → bounded checkbox list.
 *   - category, no values→ typed value chips (account-specific bounded sets
 *                          the catalog can't enumerate, e.g. currencies).
 *   - entity             → the generic entity picker (options source, or the
 *                          caller-supplied internal listing).
 */
export function InsightFilterControls({
  source,
  dataset,
  measure,
  filters,
  onChange,
  internalEntityOptions,
}: {
  source: InsightSource;
  dataset: InsightDataset;
  measure: InsightMeasure;
  filters: Record<string, string[] | boolean>;
  onChange: (id: string, value: string[] | boolean | null) => void;
  /** Safe listing for internal-source entity fields with no options resolver
   * (the CD-1-documented workflow-list path). Keyed by nothing provider-y —
   * it's just "the internal entity list the page already had". */
  internalEntityOptions: readonly InsightEntityOption[];
}) {
  const defs = availableFilters(dataset, measure);
  if (defs.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {defs.map((def) => (
        <FilterControl
          key={def.id}
          source={source}
          def={def}
          value={filters[def.id]}
          onChange={(v) => onChange(def.id, v)}
          internalEntityOptions={internalEntityOptions}
        />
      ))}
    </div>
  );
}

function FilterControl({
  source,
  def,
  value,
  onChange,
  internalEntityOptions,
}: {
  source: InsightSource;
  def: InsightFilterDef;
  value: string[] | boolean | undefined;
  onChange: (value: string[] | boolean | null) => void;
  internalEntityOptions: readonly InsightEntityOption[];
}) {
  if (def.valueType === "boolean") {
    const on = value === true;
    return (
      <label className="flex items-center gap-2 text-[12px] text-foreground/85">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? true : null)}
        />
        <span>{def.label}</span>
      </label>
    );
  }

  const selected = Array.isArray(value) ? value : [];

  if (def.valueType === "category_values") {
    if (def.values && def.values.length > 0) {
      const atCap = selected.length >= def.maxSelections;
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-0.5 text-[11px] font-medium text-muted-foreground">
            {def.label}
          </legend>
          {def.values.map((v) => {
            const on = selected.includes(v.id);
            return (
              <label key={v.id} className="flex items-center gap-2 text-[12px] text-foreground/85">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  checked={on}
                  disabled={!on && atCap}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, v.id]
                        : selected.filter((s) => s !== v.id).length > 0
                          ? selected.filter((s) => s !== v.id)
                          : null,
                    )
                  }
                />
                <span>{v.label}</span>
              </label>
            );
          })}
        </fieldset>
      );
    }
    return (
      <ValueChipEntry
        label={def.label}
        selected={selected}
        max={def.maxSelections}
        onChange={(ids) => onChange(ids.length > 0 ? ids : null)}
      />
    );
  }

  // entity_ids
  const useResolver = typeof def.optionsSource === "string" && def.optionsSource.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-medium text-muted-foreground">{def.label}</div>
      <InsightEntityPicker
        label={def.label}
        selected={selected}
        max={def.maxSelections}
        onChange={(ids) => onChange(ids.length > 0 ? ids : null)}
        {...(useResolver
          ? { optionsSource: def.optionsSource! }
          : source.credentialMode === "internal"
            ? { options: internalEntityOptions }
            : { options: [] })}
      />
    </div>
  );
}

/**
 * Typed value chips for bounded-but-unenumerable category filters (e.g. the
 * currencies actually seen on the connection). Values are normalized
 * lowercase for the query; shown uppercase.
 */
function ValueChipEntry({
  label,
  selected,
  max,
  onChange,
}: {
  label: string;
  selected: readonly string[];
  max: number;
  onChange: (ids: string[]) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim().toLowerCase();
    setText("");
    if (!v || selected.includes(v) || selected.length >= max) return;
    onChange([...selected, v]);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] uppercase text-foreground"
            >
              {v}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(selected.filter((s) => s !== v))}
                aria-label={`Remove ${v.toUpperCase()}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          className="w-full rounded-md border border-border bg-muted px-2 py-1 text-[12px] uppercase text-foreground outline-none placeholder:normal-case placeholder:text-muted-foreground"
          placeholder={`Add a ${label.toLowerCase()} value…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-label={`Add ${label} value`}
        />
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground/80 hover:border-foreground/25 disabled:opacity-50"
          onClick={add}
          disabled={!text.trim() || selected.length >= max}
        >
          Add
        </button>
      </div>
    </div>
  );
}
