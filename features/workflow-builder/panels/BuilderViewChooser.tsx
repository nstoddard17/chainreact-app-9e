"use client";

import { useState, type KeyboardEvent } from "react";

import type { BuilderViewMode } from "../document/documentViewPref";

/**
 * First-open view chooser for a newly created workflow
 * (BUILDER-VIEW-DEFAULT-1).
 *
 * Shown by `WorkflowBuilder` ONLY when: the Document Builder flag is on, the
 * workflow was just created (`?created=1` from the creation flows), and the
 * user has NO saved default builder view. Picking a view switches the
 * workspace immediately; ticking "Always use this view" (opt-in, unchecked by
 * default) also saves it as the account-level default so the chooser never
 * asks again — changeable later in Account settings or the builder's
 * Settings tab. Dismissing (× / Esc) keeps the current view and saves
 * nothing, so the chooser reappears on the next new workflow.
 *
 * Presentational: the parent owns the switch + the (optional) default save.
 */
export function BuilderViewChooser({
  onChoose,
  onDismiss,
}: {
  onChoose: (view: BuilderViewMode, rememberAsDefault: boolean) => void;
  onDismiss: () => void;
}) {
  const [remember, setRemember] = useState(false);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onDismiss();
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "color-mix(in oklab, var(--builder-bg) 72%, transparent)" }}
      data-testid="builder-view-chooser-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your builder view"
        data-testid="builder-view-chooser"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg p-5"
        style={{
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-border)",
          boxShadow: "var(--builder-shadow-sm)",
        }}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--builder-text)" }}>
            How do you want to build?
          </h2>
          <button
            type="button"
            aria-label="Close and decide later"
            data-testid="builder-view-chooser-dismiss"
            onClick={onDismiss}
            className="rounded px-1.5 text-[14px] leading-none"
            style={{ color: "var(--builder-muted)" }}
          >
            ×
          </button>
        </div>
        <p className="mb-4 text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
          Both views edit the same workflow — you can switch anytime from the header.
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="builder-view-chooser-visual"
            onClick={() => onChoose("visual", remember)}
            className="rounded-md p-3 text-left transition-colors"
            style={{
              background: "var(--builder-panel-2)",
              border: "1px solid var(--builder-border)",
            }}
          >
            <span className="block text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
              Visual builder
            </span>
            <span className="block text-[12px]" style={{ color: "var(--builder-muted)" }}>
              Build on a canvas of connected steps — drag, connect, and configure each one.
            </span>
          </button>
          <button
            type="button"
            data-testid="builder-view-chooser-document"
            onClick={() => onChoose("document", remember)}
            className="rounded-md p-3 text-left transition-colors"
            style={{
              background: "var(--builder-panel-2)",
              border: "1px solid var(--builder-border)",
            }}
          >
            <span className="block text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
              Document builder
            </span>
            <span className="block text-[12px]" style={{ color: "var(--builder-muted)" }}>
              Build by reading and editing your workflow as a plain-language document.
            </span>
          </button>
        </div>

        <label
          className="mt-4 flex cursor-pointer items-center gap-2 text-[12.5px]"
          style={{ color: "var(--builder-text)" }}
        >
          <input
            type="checkbox"
            data-testid="builder-view-chooser-remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Always use this view — you can change it anytime in Settings.
        </label>
      </div>
    </div>
  );
}
