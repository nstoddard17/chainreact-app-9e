"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import type { ConfigReadiness } from "./readiness/computeConfigReadiness";

/**
 * Node config readiness banner (SPREADSHEET-CONFIG-REDESIGN-1) — shown
 * near the top of EVERY node's Setup tab, for all providers/actions/
 * triggers. Summarizes whether the node's config is complete:
 *
 *   - incomplete → "2 things left to fill in" / "One thing left to
 *     fill in" + a checklist of what's done and what's missing.
 *   - invalid    → "Fix one field before saving" (structural / inline
 *     field errors win over missing items).
 *   - ready      → "Ready to run" (actions) / "Ready to activate"
 *     (triggers).
 *
 * Display only — the pure `computeConfigReadiness` helper owns the
 * decision; the footer keeps owning dirty/saved state. Copy is product
 * language (field labels / adapter copy), never schema keys.
 */

export interface NodeConfigReadinessBannerProps {
  readiness: ConfigReadiness;
}

const STATUS_STYLES: Record<ConfigReadiness["status"], string> = {
  ready:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  incomplete:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  invalid:
    "border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive/50",
};

export function NodeConfigReadinessBanner({
  readiness,
}: NodeConfigReadinessBannerProps) {
  const { status, headline, items, cta } = readiness;

  return (
    <div
      role="status"
      data-testid="config-readiness-banner"
      data-readiness-status={status}
      className={`flex flex-col gap-1.5 rounded-md border p-3 ${STATUS_STYLES[status]}`}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {status === "ready" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        ) : status === "invalid" ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Circle className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>{headline}</span>
      </p>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li
              key={item.label}
              data-checklist-done={item.done ? "true" : "false"}
              className="flex items-center gap-1.5 text-xs"
            >
              {item.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
              )}
              <span className={item.done ? "" : "opacity-90"}>{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {cta ? (
        <p>
          {/* CONNECTION-AWARE-READINESS-1 — the Apps page is the canonical
              connect/reconnect surface; the OAuth callback returns there. */}
          <a
            href={cta.href}
            data-testid="config-readiness-banner-cta"
            className="inline-flex items-center rounded-md border border-current/40 px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            {cta.label}
          </a>
        </p>
      ) : null}
    </div>
  );
}
