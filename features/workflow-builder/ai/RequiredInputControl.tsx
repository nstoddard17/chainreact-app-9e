"use client";

import type { AiRequiredUserInput } from "@/lib/api/ai";
import { resolveRequiredInputControl } from "./resolveRequiredInputControl";
import { RequiredInputOptionsSourceControl } from "./RequiredInputOptionsSourceControl";

/**
 * Interactive required-input control for the React Agent (Slice 4.AI-22,
 * extended for full control parity in Slice 4.AI-35E).
 *
 * Renders one input affordance per `requiredUserInput` entry returned by
 * the planner. The control class is chosen by the shared, metadata-driven
 * {@link resolveRequiredInputControl} helper (the SAME logic the panel uses
 * to split controls from bullets) — never by provider id:
 *
 *   - `select`      (static enum, single)     → native `<select>` dropdown
 *   - `multiselect` (static enum, multiple)   → checkbox group
 *   - `combobox`    (dynamic `optionsSource`) → typeable picker backed by
 *                                               `useOptionsSource` (same hook
 *                                               the config-modal pickers use,
 *                                               via the AI-2 sanitized options
 *                                               API). Disabled with a hint when
 *                                               a `dependsOn` parent hasn't been
 *                                               staged yet.
 *   - `boolean`     (`boolean` field)         → checkbox/toggle
 *   - `number`      (`number` field)          → numeric input
 *   - `textarea`    (`textarea` field)        → multi-line editor
 *   - `text`        (text / cron / fallback)  → single-line `<input>`. Also the
 *                                               safe fallback for any KNOWN
 *                                               config field whose renderer has
 *                                               no dedicated chat control yet.
 *
 * Always allows a typed/manual answer when `allowFreeText === true` —
 * the user can override a dropdown by typing in the composer below, or
 * use the inline text input on free-text fields. The component itself
 * is purely controlled — the parent (BuilderAiPanel) owns the staged
 * answers map and decides when to submit them as a follow-up.
 *
 * No-leak:
 *   - Renders only `label` / `fieldLabel` / `nodeLabel` and the
 *     server-enriched option `{label, value}` pairs.
 *   - The optionsSource branch passes the user's typed query through
 *     `useOptionsSource` (same RLS-protected route as the config
 *     modal); resolver errors surface as the hook's standard error
 *     state.
 *   - Never reads `proposedPatch` config, never renders raw model text.
 *
 * Backward compat:
 *   - When NONE of the enrichment fields are present (e.g. a pre-AI-22
 *     planner result, or a bare `config_value` from a null-patch plan),
 *     the helper resolves to `text` and the free-text input renders. Such
 *     entries were previously dropped to a bullet by the panel's control
 *     gate — AI-35E routes them here so a known config field always gets
 *     an interactive control.
 */

export interface RequiredInputAnswer {
  /** Stable id derived from `nodeId+field` or label. Used as the parent's map key. */
  readonly key: string;
  /** Human-readable answer (display label or typed string). */
  readonly display: string;
  /** Machine value when the user picked a dropdown / picker option — undefined for free text. */
  readonly value?: string;
  /**
   * Multi-select: the set of chosen option values. Present ONLY for the
   * `multiselect` control. The follow-up reconstruction reads `display`
   * (joined labels); deterministic completion intentionally bounces
   * multi-value fields to the model planner, so `values` is not threaded
   * into the completion route.
   */
  readonly values?: readonly string[];
  /** The original required-input descriptor — surfaced so reconstruction can cite field/provider/label. */
  readonly descriptor: AiRequiredUserInput;
}

interface Props {
  readonly input: AiRequiredUserInput;
  readonly answer: RequiredInputAnswer | undefined;
  readonly onChange: (next: RequiredInputAnswer | undefined) => void;
  /** Stable key the parent uses to track this input in its staged-answers map. */
  readonly inputKey: string;
  /**
   * Parent-staged answer map keyed by `inputKey`, exposed read-only so
   * a dynamic picker with `dependsOn` can read parent values. Pure
   * read-through — the control does NOT mutate it.
   */
  readonly stagedAnswers: ReadonlyMap<string, RequiredInputAnswer>;
}

/** Build the key the parent uses to identify this required-input. */
export function requiredInputKey(input: AiRequiredUserInput): string {
  if (input.nodeId && input.field) return `${input.nodeId}::${input.field}`;
  return `label::${input.label}`;
}

export function RequiredInputControl({
  input,
  answer,
  onChange,
  inputKey,
  stagedAnswers,
}: Props) {
  const fieldLabel = input.fieldLabel ?? input.label;
  const placeholderText = input.placeholder ?? "Type a value";

  // Build deps map for the dynamic picker by reading sibling staged
  // answers. Each dep should be the field NAME in the same node (e.g.
  // `guildId` for `discord:channels`). The control only reads — it never
  // writes back into the staged-answers map.
  function resolveDepsFromStaged(): Readonly<Record<string, string>> | undefined {
    if (!input.dependsOn || input.dependsOn.length === 0) return undefined;
    const out: Record<string, string> = {};
    for (const depName of input.dependsOn) {
      // Look for a sibling entry with the same nodeId + depName as its field.
      let found: string | undefined;
      stagedAnswers.forEach((a) => {
        if (
          a.descriptor.nodeId === input.nodeId &&
          a.descriptor.field === depName
        ) {
          found = a.value ?? a.display;
        }
      });
      if (found) out[depName] = found;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  const labelStyle = { color: "var(--builder-text)" } as const;
  const inputClassName = "rounded-md border bg-transparent px-2 py-1 text-[12.5px]";
  const inputStyle = {
    borderColor: "var(--builder-border)",
    color: "var(--builder-text)",
  } as const;

  const control = resolveRequiredInputControl(input);

  // ── select: static enum, single-pick (incl. provider_choice) ─────────
  if (control === "select") {
    return (
      <div
        className="flex flex-col gap-1"
        data-testid="builder-ai-required-input-control"
        data-input-key={inputKey}
        data-variant="static-options"
      >
        <label className="text-[11.5px] font-medium" style={labelStyle}>
          {fieldLabel}
        </label>
        <select
          data-testid="builder-ai-required-input-select"
          value={answer?.value ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "") {
              onChange(undefined);
              return;
            }
            const opt = input.options!.find((o) => o.value === next);
            onChange({
              key: inputKey,
              value: next,
              display: opt?.label ?? next,
              descriptor: input,
            });
          }}
          className={inputClassName}
          style={inputStyle}
        >
          <option value="">— pick a value —</option>
          {input.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // ── multiselect: static enum, multiple ───────────────────────────────
  if (control === "multiselect") {
    const selected = new Set(answer?.values ?? []);
    const toggle = (value: string) => {
      const next = new Set(selected);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      const values = [...next];
      if (values.length === 0) {
        onChange(undefined);
        return;
      }
      const display = values
        .map((v) => input.options!.find((o) => o.value === v)?.label ?? v)
        .join(", ");
      onChange({ key: inputKey, values, display, descriptor: input });
    };
    return (
      <div
        className="flex flex-col gap-1"
        data-testid="builder-ai-required-input-control"
        data-input-key={inputKey}
        data-variant="multiselect"
      >
        <label className="text-[11.5px] font-medium" style={labelStyle}>
          {fieldLabel}
        </label>
        <div
          data-testid="builder-ai-required-input-multiselect"
          className="flex flex-col gap-px"
        >
          {input.options!.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-1.5 text-[12px]"
              style={labelStyle}
            >
              <input
                type="checkbox"
                data-testid="builder-ai-required-input-multiselect-option"
                data-option-value={o.value}
                checked={selected.has(o.value)}
                onChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  // ── combobox: dynamic optionsSource → typeable picker ────────────────
  if (control === "combobox") {
    return (
      <RequiredInputOptionsSourceControl
        input={input}
        answer={answer}
        onChange={onChange}
        inputKey={inputKey}
        fieldLabel={fieldLabel}
        placeholderText={placeholderText}
        deps={resolveDepsFromStaged()}
      />
    );
  }

  // ── boolean: checkbox/toggle ─────────────────────────────────────────
  if (control === "boolean") {
    const checked = answer?.value === "true";
    return (
      <div
        className="flex flex-col gap-1"
        data-testid="builder-ai-required-input-control"
        data-input-key={inputKey}
        data-variant="boolean"
      >
        <label className="flex items-center gap-1.5 text-[11.5px] font-medium" style={labelStyle}>
          <input
            type="checkbox"
            data-testid="builder-ai-required-input-boolean"
            checked={checked}
            onChange={(e) => {
              const next = e.target.checked;
              onChange({
                key: inputKey,
                value: next ? "true" : "false",
                display: next ? "true" : "false",
                descriptor: input,
              });
            }}
          />
          {fieldLabel}
        </label>
      </div>
    );
  }

  // ── number: numeric input ────────────────────────────────────────────
  if (control === "number") {
    return (
      <div
        className="flex flex-col gap-1"
        data-testid="builder-ai-required-input-control"
        data-input-key={inputKey}
        data-variant="number"
      >
        <label className="text-[11.5px] font-medium" style={labelStyle}>
          {fieldLabel}
        </label>
        <input
          type="number"
          data-testid="builder-ai-required-input-number"
          value={answer?.value ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next.trim() === "") {
              onChange(undefined);
              return;
            }
            onChange({ key: inputKey, value: next, display: next, descriptor: input });
          }}
          placeholder={placeholderText}
          className={inputClassName}
          style={inputStyle}
        />
      </div>
    );
  }

  // ── textarea: multi-line editor ──────────────────────────────────────
  if (control === "textarea") {
    return (
      <div
        className="flex flex-col gap-1"
        data-testid="builder-ai-required-input-control"
        data-input-key={inputKey}
        data-variant="textarea"
      >
        <label className="text-[11.5px] font-medium" style={labelStyle}>
          {fieldLabel}
        </label>
        <textarea
          data-testid="builder-ai-required-input-textarea"
          rows={3}
          value={answer?.display ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next.trim() === "") {
              onChange(undefined);
              return;
            }
            onChange({ key: inputKey, display: next, descriptor: input });
          }}
          placeholder={placeholderText}
          className={inputClassName}
          style={inputStyle}
        />
      </div>
    );
  }

  // ── text: single-line input + safe fallback for any known config field ─
  return (
    <div
      className="flex flex-col gap-1"
      data-testid="builder-ai-required-input-control"
      data-input-key={inputKey}
      data-variant="text"
    >
      <label className="text-[11.5px] font-medium" style={labelStyle}>
        {fieldLabel}
      </label>
      <input
        type="text"
        data-testid="builder-ai-required-input-text"
        value={answer?.display ?? ""}
        onChange={(e) => {
          const next = e.target.value;
          if (next.trim() === "") {
            onChange(undefined);
            return;
          }
          onChange({
            key: inputKey,
            display: next,
            descriptor: input,
          });
        }}
        placeholder={placeholderText}
        className={inputClassName}
        style={inputStyle}
      />
    </div>
  );
}
