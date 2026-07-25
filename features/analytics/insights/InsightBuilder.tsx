"use client";

import type { ReactNode } from "react";
import { AnalyticsIcon } from "@/components/analytics/icons";
import {
  availableDimensionChoices,
  availableSeries,
  chartChoices,
  findDataset,
  findMeasure,
  findSource,
  type InsightCatalog,
  type InsightSource,
} from "./insightCatalog";
import type { InsightDraft, InsightReset } from "./reconcileInsightConfig";
import { InsightFilterControls } from "./InsightFilterControls";
import { InsightSeriesControls } from "./InsightSeriesControls";
import { InsightTimeControls } from "./InsightTimeControls";
import type { InsightEntityOption } from "./InsightEntityPicker";

/**
 * The catalog-driven Custom Insight builder (CD-3A):
 * App → Data → Show → Group by → Only include → Series → Time → Chart.
 *
 * EVERY list here is generated from the client catalog projection — sources,
 * datasets, measures, groupings, filters, series, time capability, and chart
 * choices. There are no provider-name branches; Stripe/Motive/QuickBooks
 * datasets would render through the exact same code the day their catalogs
 * are exposed. Dependency edits are reconciled by the pure
 * `reconcileInsightDraft`, whose reset notes render next to the affected
 * step.
 */
export function InsightBuilder({
  catalog,
  draft,
  resets,
  onPatch,
  onSelectSource,
  connectedProviders,
  internalEntityOptions,
}: {
  catalog: InsightCatalog;
  draft: InsightDraft;
  resets: readonly InsightReset[];
  onPatch: (patch: Partial<InsightDraft>) => void;
  onSelectSource: (id: string) => void;
  connectedProviders: Record<string, boolean>;
  internalEntityOptions: readonly InsightEntityOption[];
}) {
  const source = findSource(catalog, draft.source);
  const dataset = findDataset(source, draft.dataset);
  const measure = findMeasure(dataset, draft.measure);

  const notes = (field: InsightReset["field"]) =>
    resets.filter((r) => r.field === field).map((r) => r.message);

  return (
    <div className="flex flex-col gap-4">
      <Step icon="Cube" prompt="Where is the data from?">
        <div className="flex flex-col gap-1.5">
          {catalog.sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              selected={draft.source === s.id}
              connected={s.providerId === null || connectedProviders[s.providerId] === true}
              onSelect={() => onSelectSource(s.id)}
            />
          ))}
          {catalog.sources.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              No data sources are available yet.
            </p>
          )}
        </div>
      </Step>

      {source && (
        <Step icon="Database" prompt="What do you want to look at?" notes={notes("dataset")}>
          <div className="flex flex-col gap-1.5">
            {source.datasets.map((d) => (
              <ChoiceCard
                key={d.id}
                title={d.label}
                description={d.description}
                selected={draft.dataset === d.id}
                onSelect={() => onPatch({ dataset: d.id })}
              />
            ))}
          </div>
          {dataset?.scopeNote && (
            <p className="mt-1 text-[10.5px] text-muted-foreground">{dataset.scopeNote}</p>
          )}
        </Step>
      )}

      {dataset && (
        <Step icon="Bolt" prompt="What should the chart show?" notes={notes("measure")}>
          <div className="flex flex-wrap gap-1.5">
            {dataset.measures.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                on={draft.measure === m.id}
                onSelect={() => onPatch({ measure: m.id })}
              />
            ))}
          </div>
        </Step>
      )}

      {dataset && measure && (
        <>
          <Step icon="Filter" prompt="How should it be grouped?" notes={notes("dimension")}>
            <div className="flex flex-wrap gap-1.5">
              {availableDimensionChoices(dataset, measure).map((c) => (
                <Chip
                  key={c.id ?? "none"}
                  label={c.label}
                  on={draft.dimension === c.id}
                  onSelect={() => onPatch({ dimension: c.id })}
                />
              ))}
            </div>
          </Step>

          <Step icon="Search" prompt="Only include" optional notes={notes("filters")}>
            <InsightFilterControls
              source={source!}
              dataset={dataset}
              measure={measure}
              filters={draft.filters}
              onChange={(id, value) => {
                const next = { ...draft.filters };
                if (value === null) delete next[id];
                else next[id] = value;
                onPatch({ filters: next });
              }}
              internalEntityOptions={internalEntityOptions}
            />
          </Step>

          {draft.dimension === "time" && availableSeries(dataset, measure).length > 0 ? (
            <Step icon="Layers" prompt="What should get its own line?" notes={notes("series")}>
              <InsightSeriesControls
                source={source!}
                dataset={dataset}
                measure={measure}
                series={draft.series}
                onChange={(series) => onPatch({ series })}
                internalEntityOptions={internalEntityOptions}
              />
            </Step>
          ) : (
            // The series step may disappear with the capability that made it
            // invalid — its reset explanation must not vanish with it.
            notes("series").map((n, i) => (
              <p
                key={`series-note-${i}`}
                className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[10.5px] text-warning"
                role="status"
              >
                {n}
              </p>
            ))
          )}

          <Step
            icon="Clock"
            prompt="Time"
            notes={[...notes("timeGrain"), ...notes("dateField"), ...notes("compare")]}
          >
            <InsightTimeControls
              dataset={dataset}
              measure={measure}
              draft={draft}
              onPatch={onPatch}
            />
          </Step>

          <Step icon="History" prompt="Chart" notes={notes("chart")}>
            <div className="flex flex-wrap gap-1.5">
              {(["kpi", "line"] as const).map((c) => {
                const enabled = chartChoices(dataset, measure, draft.dimension).includes(c);
                return (
                  <Chip
                    key={c}
                    label={c === "kpi" ? "Number" : "Line chart"}
                    on={draft.chart === c}
                    disabled={!enabled}
                    onSelect={() => onPatch({ chart: c })}
                  />
                );
              })}
            </div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              {draft.dimension === "time"
                ? "A chart over time renders as a line."
                : "An ungrouped result renders as a single number. Group it over time for a line chart."}
            </p>
          </Step>
        </>
      )}
    </div>
  );
}

function Step({
  icon,
  prompt,
  optional,
  notes = [],
  children,
}: {
  icon: string;
  prompt: string;
  optional?: boolean;
  notes?: readonly string[];
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="text-primary">
          <AnalyticsIcon name={icon} size={11} />
        </span>
        <span>{prompt}</span>
        {optional && <span className="font-normal normal-case tracking-normal">(optional)</span>}
      </div>
      {notes.map((n, i) => (
        <p key={i} className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[10.5px] text-warning" role="status">
          {n}
        </p>
      ))}
      {children}
    </section>
  );
}

function SourceCard({
  source,
  selected,
  connected,
  onSelect,
}: {
  source: InsightSource;
  selected: boolean;
  connected: boolean;
  onSelect: () => void;
}) {
  const needsConnection = source.connectionRequired;
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={
        "flex flex-col gap-0.5 rounded-lg border p-2.5 text-left " +
        (selected ? "border-primary bg-primary/10" : "border-border bg-muted hover:border-foreground/25")
      }
      onClick={onSelect}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-[12.5px] font-semibold text-foreground">{source.label}</span>
        {source.exposure === "preview" && (
          <span className="rounded-full border border-warning/40 bg-warning/10 px-1.5 py-px text-[9.5px] font-medium text-warning">
            Preview
          </span>
        )}
        {needsConnection && (
          <span
            className={
              "rounded-full border px-1.5 py-px text-[9.5px] font-medium " +
              (connected
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground")
            }
          >
            {connected ? "Connected" : "Not connected"}
          </span>
        )}
      </span>
      {source.description && (
        <span className="text-[11px] text-muted-foreground">{source.description}</span>
      )}
      {source.credentialMode === "personal" && (
        <span className="text-[10.5px] text-muted-foreground">
          Each viewer sees data from their own connection.
        </span>
      )}
    </button>
  );
}

function ChoiceCard({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={
        "flex flex-col gap-0.5 rounded-lg border p-2.5 text-left " +
        (selected ? "border-primary bg-primary/10" : "border-border bg-muted hover:border-foreground/25")
      }
      onClick={onSelect}
    >
      <span className="text-[12.5px] font-semibold text-foreground">{title}</span>
      {description && <span className="text-[11px] text-muted-foreground">{description}</span>}
    </button>
  );
}

function Chip({
  label,
  on,
  disabled,
  onSelect,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled === true}
      className={
        "rounded-md border px-2.5 py-1.5 text-[12px] disabled:opacity-40 " +
        (on
          ? "border-primary bg-primary/15 font-medium text-primary"
          : "border-border bg-muted text-foreground/85 hover:border-foreground/25")
      }
      onClick={onSelect}
    >
      {label}
    </button>
  );
}
