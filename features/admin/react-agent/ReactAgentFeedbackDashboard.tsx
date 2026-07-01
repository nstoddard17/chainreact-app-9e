"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ReactAgentMetrics } from "@/contracts/internalReactAgent";
import {
  fetchReactAgentMetrics,
  type ReactAgentMetricsQuery,
} from "@/lib/api/internalReactAgent";

/**
 * React Agent feedback dashboard (INTERNAL-FEEDBACK-2).
 *
 * Access-controlled, read-only. Renders REAL aggregate counts from
 * `/api/internal/react-agent/metrics` (internal-admin-gated). Every value is a
 * non-negative integer; empty data renders honest zeros, never placeholders. The
 * DTO carries counts only — no prompt/summary/failure_reason/diff/ids — so there
 * is nothing sensitive for this component to render. Attempt-level drilldown and
 * raw prompts are intentionally out of scope for this slice.
 */

interface RangePreset {
  readonly id: string;
  readonly label: string;
  readonly days: number | null;
}

const DEFAULT_RANGE: RangePreset = { id: "7d", label: "Last 7 days", days: 7 };

const RANGES: readonly RangePreset[] = [
  DEFAULT_RANGE,
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "all", label: "All time", days: null },
];

function queryForRange(preset: RangePreset): ReactAgentMetricsQuery {
  if (preset.days === null) return {};
  const from = new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString() };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`react-agent-section-${id}`}
      className="rounded-lg border border-border bg-card p-5"
    >
      <h2
        id={`react-agent-section-${id}`}
        className="text-sm font-semibold text-foreground"
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Sections({ metrics }: { metrics: ReactAgentMetrics }) {
  const { totals, previewFunnel: p, testOutcomes: t, setupIssues: s, governance } = metrics;
  const g = governance.byOutcome;
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <Section id="overview" title="Overview">
        <Stat label="Total agent changes" value={totals.agentChanges} />
        <Stat label="Governance events" value={totals.governanceEvents} />
      </Section>
      <Section id="preview-funnel" title="Preview funnel">
        <Stat label="Previews created" value={p.created} />
        <Stat label="Applied" value={p.applied} />
        <Stat label="Kept as preview" value={p.keptAsPreview} />
        <Stat label="Discarded" value={p.discarded} />
        <Stat label="Apply failed" value={p.applyFailed} />
        <Stat label="Undone" value={p.undone} />
      </Section>
      <Section id="setup-issues" title="Setup issues">
        <Stat label="Changes with setup issues" value={s.changesWithIssues} />
        <Stat label="Total setup issues" value={s.totalIssues} />
        <Stat label="Workflows needing setup" value={s.workflowsNeedingSetup} />
      </Section>
      <Section id="test-outcomes" title="Test outcomes">
        <Stat label="Tested" value={t.tested} />
        <Stat label="Test failed" value={t.testFailed} />
      </Section>
      <Section id="governance-outcomes" title="Governance outcomes">
        <Stat label="Success" value={g.success} />
        <Stat label="Denied" value={g.denied} />
        <Stat label="Failed" value={g.failed} />
      </Section>
    </div>
  );
}

export function ReactAgentFeedbackDashboard() {
  const [rangeId, setRangeId] = useState<string>("7d");
  const [metrics, setMetrics] = useState<ReactAgentMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const reqRef = useRef<number>(0);

  const load = useCallback(async (id: string) => {
    const preset = RANGES.find((r) => r.id === id) ?? DEFAULT_RANGE;
    const token = ++reqRef.current;
    setLoading(true);
    setError(false);
    try {
      const data = await fetchReactAgentMetrics(queryForRange(preset));
      if (token === reqRef.current) setMetrics(data);
    } catch {
      if (token === reqRef.current) {
        setError(true);
        setMetrics(null);
      }
    } finally {
      if (token === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(rangeId);
  }, [rangeId, load]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">React Agent Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal quality metrics for the workflow-building agent. Aggregate
            counts only.
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              aria-pressed={r.id === rangeId}
              className={
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                (r.id === rangeId
                  ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                  : "border-border bg-card text-muted-foreground hover:text-foreground")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <p className="mt-6 text-sm text-muted-foreground" role="status">
          Loading metrics…
        </p>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load React Agent metrics.
          </p>
          <button
            type="button"
            onClick={() => load(rangeId)}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && metrics && <Sections metrics={metrics} />}
    </main>
  );
}
