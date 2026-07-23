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
      className="mx-auto max-w-[560px] px-2 py-14"
      aria-label="Start this workflow"
    >
      <h2
        className="crv2-doc-prose m-0 text-[30px] font-medium leading-[1.15] tracking-[-0.02em]"
        style={{ color: "var(--builder-text)" }}
      >
        What should this workflow do?
      </h2>

      {/* Path 1 — Draft it with React */}
      <div className="mt-7">
        <label htmlFor="document-draft-composer" className="crv2-eyebrow mb-2 block">
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
          className="crv2-composer"
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            data-testid="document-draft-submit"
            onClick={submit}
            disabled={!canDraft}
            className="crv2-btn-primary"
          >
            ✦ Draft it with React
          </button>
          <span className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
            React proposes a draft — nothing changes until you apply it.
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="my-7 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1" style={{ background: "var(--builder-border)" }} />
        <span className="text-[11px]" style={{ color: "var(--builder-muted-2)" }}>or</span>
        <span className="h-px flex-1" style={{ background: "var(--builder-border)" }} />
      </div>

      {/* Path 2 — Build manually */}
      <div>
        <span className="crv2-eyebrow mb-2 block">Build manually</span>
        <button
          type="button"
          data-testid="document-start-with-trigger"
          onClick={() => onStartWithTrigger?.()}
          disabled={onStartWithTrigger === undefined}
          className="crv2-btn-secondary"
        >
          ＋ Start with a trigger
        </button>
      </div>

      <p className="mt-8 text-[12px]" style={{ color: "var(--builder-muted-2)" }}>
        AI is the fastest start — never the only one.
      </p>
    </div>
  );
}
