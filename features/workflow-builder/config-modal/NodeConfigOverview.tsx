"use client";

import * as React from "react";
import type { FieldMeta } from "@/contracts/actionMeta";
import {
  buildNodeConfigSummary,
  type ConfigSummaryKind,
} from "@/core/workflows/nodeConfigSummary";
import {
  readResourceLabel,
  useResourceLabelCache,
} from "../state/resourceLabelCache";

/**
 * At-a-glance configuration overview (CONFIG-UX-NODE-SUMMARY-1).
 *
 * Answers "what will this step do on every run?" without reading every field:
 * a plain-language headline plus the configured values grouped so the author
 * (and a reviewer) can instantly tell apart
 *
 *   - what is FIXED (same on every run),
 *   - what is mapped from the trigger / an earlier step (changes per run),
 *   - which CHOICES change the step's behavior.
 *
 * Resource values show the recognizable name the picker loaded (via the shared
 * label cache); when a name isn't known yet — a freshly opened workflow, or a
 * resource that no longer exists — the stored id is shown as-is and marked, so
 * the panel never invents a name it can't verify.
 *
 * Read-only. Renders nothing for an unconfigured node (the readiness banner
 * already owns that story).
 */

const GROUP_ORDER: readonly ConfigSummaryKind[] = [
  "resource",
  "dynamic",
  "condition",
  "fixed",
];

const GROUP_LABEL: Record<ConfigSummaryKind, string> = {
  resource: "Using",
  dynamic: "From earlier steps (changes each run)",
  condition: "Behavior",
  fixed: "Same on every run",
};

export function NodeConfigOverview({
  displayName,
  fields,
  values,
}: {
  displayName: string;
  fields: readonly FieldMeta[];
  values: Readonly<Record<string, unknown>>;
}) {
  const labels = useResourceLabelCache((s) => s.labels);
  const summary = React.useMemo(
    () =>
      buildNodeConfigSummary({
        displayName,
        fields,
        config: values,
        labelFor: (source, value) => readResourceLabel(labels, source, value),
      }),
    [displayName, fields, values, labels],
  );

  if (summary.empty) return null;

  // The panel header already names the step; repeating it here would be
  // noise. Show the headline only when it adds the recognizable resource
  // ("Send Channel Message · #support-alerts") — on the collapsed card,
  // where there is no header, the full headline is what gets rendered.
  const showHeadline = summary.headline !== displayName;

  return (
    <section
      aria-label="What this step will do"
      data-testid="node-config-overview"
      className="flex flex-col gap-2 rounded border border-input bg-muted/30 p-3"
    >
      {showHeadline ? (
        <p
          className="text-xs font-medium"
          data-testid="node-config-overview-headline"
        >
          {summary.headline}
        </p>
      ) : null}
      {GROUP_ORDER.map((kind) => {
        const rows = summary.segments.filter((s) => s.kind === kind);
        if (rows.length === 0) return null;
        return (
          <div key={kind} className="flex flex-col gap-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {GROUP_LABEL[kind]}
            </p>
            {rows.map((row) => (
              <p
                key={`${kind}-${row.label}`}
                className="text-[11px] text-muted-foreground"
                data-testid="node-config-overview-row"
                data-kind={kind}
              >
                <span className="text-foreground">{row.label}:</span>{" "}
                <span className={row.unresolved ? "font-mono" : undefined}>
                  {row.display}
                </span>
                {row.unresolved ? (
                  <span
                    className="ml-1 text-[10px]"
                    data-testid="node-config-overview-unresolved"
                    title="This is the saved id — its name will appear once the list loads."
                  >
                    (saved id)
                  </span>
                ) : null}
              </p>
            ))}
          </div>
        );
      })}
    </section>
  );
}
