"use client";

import { useState } from "react";

/**
 * Document Builder — empty-state creation layer (5.DUAL-BUILDER-1 / CS-6).
 *
 * "What should this workflow do?" with two EQUAL paths (Creation Layer mock):
 *   1. Draft it with React — a plain-language composer that seeds the ONE existing
 *      agent conversation (`onAskReact`); it NEVER mutates the graph on submit.
 *   2. Build manually — "Start with a trigger" opens the EXISTING TriggerPicker
 *      (`onStartWithTrigger`), which adds through `addTriggerFromMeta` into the
 *      SAME workflow (no second workflow is created).
 *
 * AI is the fastest start, never the only one. Both paths build into the current
 * workflow. Presentational only — all effects flow through the injected handlers.
 */
export function DocumentEmptyState({
  onAskReact,
  onStartWithTrigger,
}: {
  onAskReact?: ((prompt: string) => void) | undefined;
  onStartWithTrigger?: (() => void) | undefined;
}) {
  const [value, setValue] = useState("");
  const canDraft = onAskReact !== undefined && value.trim().length > 0;
  const submit = () => {
    if (canDraft) onAskReact!(value.trim());
  };

  return (
    <div
      data-testid="document-empty-state"
      className="mx-auto max-w-[620px] px-2 py-10"
      aria-label="Start this workflow"
    >
      <h2 className="m-0 text-[22px] font-semibold" style={{ color: "var(--builder-text)" }}>
        What should this workflow do?
      </h2>

      {/* Path 1 — Draft it with React */}
      <div className="mt-5">
        <label
          htmlFor="document-draft-composer"
          className="builder-mono mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--builder-muted)" }}
        >
          Draft it with React
        </label>
        <textarea
          id="document-draft-composer"
          data-testid="document-draft-composer"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="When a new lead arrives, qualify it and notify sales if it is a large account."
          className="w-full resize-y rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none"
          style={{
            background: "var(--builder-panel-2)",
            border: "1.5px solid var(--builder-border)",
            color: "var(--builder-text)",
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            data-testid="document-draft-submit"
            onClick={submit}
            disabled={!canDraft}
            className="inline-flex h-8 items-center rounded-md px-3.5 text-[12.5px] font-semibold disabled:opacity-50"
            style={{ background: "var(--builder-text)", color: "var(--builder-panel)" }}
          >
            Draft it with React
          </button>
          <span className="text-[11.5px]" style={{ color: "var(--builder-muted-2)" }}>
            React proposes a draft — nothing changes until you apply it.
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1" style={{ background: "var(--builder-border)" }} />
        <span className="text-[11px]" style={{ color: "var(--builder-muted-2)" }}>or</span>
        <span className="h-px flex-1" style={{ background: "var(--builder-border)" }} />
      </div>

      {/* Path 2 — Build manually */}
      <div>
        <span
          className="builder-mono mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--builder-muted)" }}
        >
          Build manually
        </span>
        <button
          type="button"
          data-testid="document-start-with-trigger"
          onClick={() => onStartWithTrigger?.()}
          disabled={onStartWithTrigger === undefined}
          className="inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium disabled:opacity-50"
          style={{ border: "1.5px solid var(--builder-border)", color: "var(--builder-text)" }}
        >
          ＋ Start with a trigger
        </button>
      </div>

      <p className="mt-6 text-[11.5px]" style={{ color: "var(--builder-muted-2)" }}>
        AI is the fastest start — never the only one.
      </p>
    </div>
  );
}
