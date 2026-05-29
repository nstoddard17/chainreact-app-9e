"use client";

import { useState } from "react";
import type { AiRequiredUserInput } from "@/lib/api/ai";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import type { RequiredInputAnswer } from "./RequiredInputControl";

/**
 * Dynamic-options branch (`optionsSource`) of the React Agent required-input
 * control (Slice 4.AI-22). Extracted to its own file in Slice 4.AI-35E so the
 * parent `RequiredInputControl` stays under the max-lines threshold.
 *
 * Kept as a dedicated subcomponent so the hook-call site is gated behind the
 * parent's `optionsSource` check — `useOptionsSource` fires a network request
 * whenever it mounts in `enabled` state, and the static-options / scalar /
 * text-fallback branches must never trigger that.
 */
export function RequiredInputOptionsSourceControl({
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
