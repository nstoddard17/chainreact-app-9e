"use client";

import { useState } from "react";
import type { AiRequiredUserInput } from "@/lib/api/ai";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";

/**
 * Interactive required-input control for the React Agent (Slice 4.AI-22).
 *
 * Renders one input affordance per `requiredUserInput` entry returned by
 * the planner. Branches on the server-enriched FieldMeta hints:
 *
 *   - `options[]` (static enum)        → native `<select>` dropdown
 *   - `optionsSource` (dynamic resolver) → typeable combobox backed by
 *                                          `useOptionsSource` (same hook
 *                                          the config modal pickers use,
 *                                          via the AI-2 sanitized options
 *                                          API). Disabled with a hint when
 *                                          a `dependsOn` parent hasn't
 *                                          been staged yet.
 *   - neither (free-text)              → `<input type="text">` fallback
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
 *   - When NONE of the AI-22 enrichment fields are present (e.g. a
 *     pre-AI-22 planner result, or an entry without `nodeId`/`field`),
 *     falls through to the free-text input fallback. Pre-AI-22
 *     consumers still get a usable control.
 */

export interface RequiredInputAnswer {
  /** Stable id derived from `nodeId+field` or label. Used as the parent's map key. */
  readonly key: string;
  /** Human-readable answer (display label or typed string). */
  readonly display: string;
  /** Machine value when the user picked a dropdown / picker option — undefined for free text. */
  readonly value?: string;
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

  const hasStaticOptions = (input.options?.length ?? 0) > 0;
  const hasOptionsSource = !!input.optionsSource;

  // ── Branch 1: static options → native <select> ───────────────────────
  if (hasStaticOptions && !hasOptionsSource) {
    return (
      <div
        className="flex flex-col gap-1"
        data-testid="builder-ai-required-input-control"
        data-input-key={inputKey}
        data-variant="static-options"
      >
        <label className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
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
          className="rounded-md border bg-transparent px-2 py-1 text-[12.5px]"
          style={{
            borderColor: "var(--builder-border)",
            color: "var(--builder-text)",
          }}
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

  // ── Branch 2: dynamic optionsSource → typeable combobox ──────────────
  if (hasOptionsSource) {
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

  // ── Branch 3: free-text fallback ─────────────────────────────────────
  return (
    <div
      className="flex flex-col gap-1"
      data-testid="builder-ai-required-input-control"
      data-input-key={inputKey}
      data-variant="text"
    >
      <label className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
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
        className="rounded-md border bg-transparent px-2 py-1 text-[12.5px]"
        style={{
          borderColor: "var(--builder-border)",
          color: "var(--builder-text)",
        }}
      />
    </div>
  );
}

/**
 * Dynamic-options branch (`optionsSource`). Subcomponent so the hook-call
 * site is gated behind the `optionsSource` check above — `useOptionsSource`
 * fires a network request whenever it mounts in `enabled` state, and the
 * static-options / text-fallback branches must never trigger that.
 */
function RequiredInputOptionsSourceControl({
  input,
  answer,
  onChange,
  inputKey,
  fieldLabel,
  placeholderText,
  deps,
}: {
  readonly input: AiRequiredUserInput;
  readonly answer: RequiredInputAnswer | undefined;
  readonly onChange: (next: RequiredInputAnswer | undefined) => void;
  readonly inputKey: string;
  readonly fieldLabel: string;
  readonly placeholderText: string;
  readonly deps: Readonly<Record<string, string>> | undefined;
}) {
  const [query, setQuery] = useState<string>(answer?.display ?? "");
  // Disable the picker when a dependsOn parent isn't staged yet — the
  // resolver would otherwise return MISSING_DEPENDENCY. The user can still
  // type a free-text answer below.
  const depsReady =
    !input.dependsOn ||
    input.dependsOn.length === 0 ||
    (deps !== undefined && Object.keys(deps).length === input.dependsOn.length);
  const { state } = useOptionsSource({
    source: input.optionsSource ?? null,
    deps: deps ?? {},
    query,
    enabled: depsReady,
  });

  return (
    <div
      className="flex flex-col gap-1"
      data-testid="builder-ai-required-input-control"
      data-input-key={inputKey}
      data-variant="options-source"
    >
      <label className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
        {fieldLabel}
      </label>
      <input
        type="text"
        data-testid="builder-ai-required-input-combobox-query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholderText}
        className="rounded-md border bg-transparent px-2 py-1 text-[12.5px]"
        style={{
          borderColor: "var(--builder-border)",
          color: "var(--builder-text)",
        }}
        disabled={!depsReady}
      />
      {!depsReady && (
        <p
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
          data-testid="builder-ai-required-input-deps-missing"
        >
          Select {input.dependsOn?.join(", ")} first.
        </p>
      )}
      {depsReady && state.status === "loading" && (
        <p
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
          data-testid="builder-ai-required-input-loading"
        >
          Loading options…
        </p>
      )}
      {depsReady && state.status === "error" && (
        <p
          className="text-[10.5px]"
          style={{ color: "var(--builder-danger)" }}
          data-testid="builder-ai-required-input-error"
        >
          {state.message}
        </p>
      )}
      {depsReady && state.status === "disconnected" && (
        <p
          className="text-[10.5px]"
          style={{ color: "var(--builder-warn)" }}
          data-testid="builder-ai-required-input-disconnected"
        >
          Connect {state.provider} to load options.
        </p>
      )}
      {depsReady &&
        (state.status === "ready" || state.status === "loading") &&
        state.items.length > 0 && (
          <ul
            data-testid="builder-ai-required-input-option-list"
            className="flex flex-col gap-px"
          >
            {state.items.slice(0, 8).map((item) => {
              const isSelected = answer?.value === item.value;
              return (
                <li key={item.value}>
                  <button
                    type="button"
                    data-testid="builder-ai-required-input-option"
                    data-option-value={item.value}
                    onClick={() =>
                      onChange({
                        key: inputKey,
                        value: item.value,
                        display: item.label,
                        descriptor: input,
                      })
                    }
                    className="w-full rounded px-2 py-1 text-left text-[12px]"
                    style={{
                      background: isSelected ? "var(--builder-panel-2)" : "transparent",
                      color: "var(--builder-text)",
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      {depsReady && state.status === "empty" && (
        <p
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
          data-testid="builder-ai-required-input-empty"
        >
          No options found.
          {input.allowFreeText ? " You can type a custom value above." : ""}
        </p>
      )}
      {/* Allow the user to commit the typed value verbatim when allowFreeText
          is true — same affordance the config-modal combobox offers. */}
      {input.allowFreeText &&
        query.trim().length > 0 &&
        answer?.display !== query.trim() && (
          <button
            type="button"
            data-testid="builder-ai-required-input-commit-typed"
            onClick={() =>
              onChange({
                key: inputKey,
                display: query.trim(),
                descriptor: input,
              })
            }
            className="self-start text-[10.5px] underline"
            style={{ color: "var(--builder-muted)" }}
          >
            Use “{query.trim()}” as-is
          </button>
        )}
    </div>
  );
}
