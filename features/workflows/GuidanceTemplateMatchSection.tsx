"use client";

import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";

/**
 * Presentational "Official template match" card(s) for the React Agent guidance surface
 * (REACT-AGENT-TEMPLATE-MATCH-2). Shown when the deterministic matcher recommends official templates
 * for a "build this workflow" request.
 *
 * Pure render — no fetch, no model, no mutation, and it NEVER creates/forks/uses a template itself.
 * It renders ONLY the safe {@link GuidanceOfficialTemplateMatch} fields (title, description, app
 * labels, step count, confidence, reasons, humanized preview chain) — the shape cannot carry a raw
 * definition, config value, `{{...}}` expression, or any resource/account/user id.
 *
 * REACT-AGENT-TEMPLATE-MATCH-3 — when an `onPreview` handler is provided, each match gets a
 * "Preview template" CTA. The action is OWNED by the panel/container (this stays presentational): it
 * opens a preview/confirmation dialog. Clicking "Preview" creates nothing. Without `onPreview` the
 * card is recommendation-only (unchanged prior behavior).
 */

const CONFIDENCE_LABEL: Readonly<Record<GuidanceOfficialTemplateMatch["confidence"], string>> = {
  high: "Strong match",
  medium: "Possible match",
  low: "Loose match",
};

export function GuidanceTemplateMatchSection({
  matches,
  onPreview,
}: {
  readonly matches: readonly GuidanceOfficialTemplateMatch[];
  /** When provided, renders a "Preview template" CTA per match. Opening a preview creates nothing. */
  readonly onPreview?: (match: GuidanceOfficialTemplateMatch) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div
      data-testid="guidance-template-match"
      className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-sky-900 dark:text-sky-200">
        Official template match
      </h3>
      <p className="mt-0.5 text-xs text-sky-700 dark:text-sky-300">
        You can preview it before creating anything — nothing has been created or changed.
      </p>
      <ul className="mt-2 space-y-2">
        {matches.map((m) => (
          <li
            key={m.templateId}
            data-testid="guidance-template-match-item"
            data-template-id={m.templateId}
            data-confidence={m.confidence}
            className="rounded border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{m.name}</span>
              <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                {CONFIDENCE_LABEL[m.confidence]}
              </span>
            </div>
            {m.description ? (
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{m.description}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {m.providerLabels.length > 0 ? (
                <span data-testid="guidance-template-match-apps">{m.providerLabels.join(" · ")}</span>
              ) : null}
              <span aria-hidden>•</span>
              <span>{`${m.stepCount} step${m.stepCount === 1 ? "" : "s"}`}</span>
            </div>
            {m.steps.length > 0 ? (
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {m.steps.map((s) => s.label).join(" → ")}
              </p>
            ) : null}
            {m.reasons.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5">
                {m.reasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    • {r}
                  </li>
                ))}
              </ul>
            ) : null}
            {onPreview ? (
              <button
                type="button"
                data-testid="guidance-template-preview-cta"
                data-template-id={m.templateId}
                onClick={() => onPreview(m)}
                className="mt-2 inline-flex items-center rounded-md bg-sky-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-sky-700"
              >
                Preview template
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
