"use client";

import { useState } from "react";
import type {
  AnalyticsMetric,
  AnalyticsWidget,
  AnalyticsWidgetConfig,
  AnalyticsWidgetType,
  AnalyticsWorkflowStat,
} from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";

/**
 * Per-widget configuration drawer (Slice ANALYTICS-1; connected-app sources added
 * in ANALYTICS-SOURCES-GITHUB-UI-1).
 *
 * Two data sources:
 *   - ChainReact (internal): workflow/run metrics, optionally scoped to one
 *     workflow — the original behavior.
 *   - GitHub (connected app): a validated `owner/repo` + an approved metric. Writes
 *     `config.dataSource = { kind:"connected_app", provider:"github", metricKey,
 *     filters:{ repo } }`. Server validation is authoritative; the repo regex here
 *     is UX only. Arbitrary GitHub search qualifiers are NOT accepted.
 *
 * GitHub is a PERSONAL credential — the widget always uses the VIEWER'S own GitHub
 * connection. If the current user hasn't connected GitHub, a connect note shows
 * (the widget still renders a connect CTA at runtime).
 *
 * Deferred (absent): refresh-schedule cadence, per-widget run filters, multi-repo.
 */

const METRICS_BY_TYPE: Record<AnalyticsWidgetType, { id: AnalyticsMetric; label: string }[]> = {
  stat: [
    { id: "runs", label: "Number of runs" },
    { id: "success_rate", label: "Success rate" },
    { id: "active_workflows", label: "Active automations" },
    { id: "avg_duration", label: "Average run time" },
  ],
  line: [{ id: "runs_over_time", label: "Runs over time" }],
  donut: [{ id: "outcomes", label: "Outcome breakdown (success / fail)" }],
  bar: [
    { id: "top_workflows", label: "Top automations by runs" },
    { id: "by_app", label: "Connected apps" },
  ],
  table: [{ id: "top_workflows", label: "Automations table" }],
  heatmap: [{ id: "by_time", label: "When things ran (day & week)" }],
  activity: [{ id: "events", label: "Recent runs feed" }],
  note: [],
};

const SOURCE_SCOPED: ReadonlySet<AnalyticsMetric> = new Set<AnalyticsMetric>([
  "runs",
  "success_rate",
  "avg_duration",
]);

/**
 * GitHub metrics offered per widget type (scalar → stat; series → line/bar).
 * Other widget types don't support a GitHub metric, so GitHub isn't offered.
 */
const GITHUB_METRICS_BY_TYPE: Partial<Record<AnalyticsWidgetType, { id: string; label: string }[]>> = {
  stat: [
    { id: "open_issues", label: "Open issues" },
    { id: "open_prs", label: "Open pull requests" },
  ],
  line: [
    { id: "issues_opened", label: "Issues opened over time" },
    { id: "prs_opened", label: "Pull requests opened over time" },
    { id: "prs_merged", label: "Pull requests merged over time" },
  ],
  bar: [
    { id: "issues_opened", label: "Issues opened over time" },
    { id: "prs_opened", label: "Pull requests opened over time" },
    { id: "prs_merged", label: "Pull requests merged over time" },
  ],
};

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

export function WidgetConfigPanel({
  widget,
  workflows,
  githubConnected,
  onClose,
  onSave,
}: {
  widget: AnalyticsWidget;
  workflows: readonly AnalyticsWorkflowStat[];
  githubConnected: boolean;
  onClose: () => void;
  onSave: (config: AnalyticsWidgetConfig) => void;
}) {
  const isNote = widget.type === "note";
  const metricOptions = METRICS_BY_TYPE[widget.type];
  const githubMetrics = GITHUB_METRICS_BY_TYPE[widget.type];
  const supportsGithub = !isNote && githubMetrics !== undefined;

  const existingDs = widget.config.dataSource;
  const [sourceKind, setSourceKind] = useState<"internal" | "github">(
    existingDs?.kind === "connected_app" ? "github" : "internal",
  );

  const [source, setSource] = useState<string>(widget.config.source ?? "any");
  const [metric, setMetric] = useState<AnalyticsMetric | undefined>(
    widget.config.metric ?? metricOptions[0]?.id,
  );
  const [note, setNote] = useState<string>(widget.config.note ?? "");

  const [ghMetric, setGhMetric] = useState<string>(
    existingDs?.kind === "connected_app" ? existingDs.metricKey : (githubMetrics?.[0]?.id ?? ""),
  );
  const [repo, setRepo] = useState<string>(
    existingDs?.kind === "connected_app" && typeof existingDs.filters?.repo === "string"
      ? existingDs.filters.repo
      : "",
  );

  const sourceScoped = metric != null && SOURCE_SCOPED.has(metric);
  const repoValid = REPO_RE.test(repo.trim());
  const saveDisabled = sourceKind === "github" && (!ghMetric || !repoValid);

  const save = () => {
    if (sourceKind === "github" && supportsGithub) {
      onSave({
        source: "any",
        dataSource: {
          kind: "connected_app",
          provider: "github",
          metricKey: ghMetric,
          filters: { repo: repo.trim() },
        },
      });
      return;
    }
    onSave({
      source: sourceScoped ? source : "any",
      ...(isNote ? {} : metric ? { metric } : {}),
      ...(isNote ? { note } : {}),
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-[71] flex w-[420px] max-w-[calc(100%-24px)] flex-col border-l border-border bg-card shadow-2xl"
        role="dialog"
        aria-modal
        aria-label="Configure widget"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <AnalyticsIcon name={widget.icon ?? "Bolt"} size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-primary">Configure widget</div>
              <div className="truncate text-[15px] font-semibold text-foreground">{widget.title}</div>
            </div>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <AnalyticsIcon name="X" size={13} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          {isNote ? (
            <NoteConfig note={note} onChange={setNote} />
          ) : (
            <>
              {supportsGithub && (
                <section className="flex flex-col gap-2">
                  <SectionHeading icon="Layers" label="Data source" />
                  <div className="grid grid-cols-2 gap-2">
                    <SourceToggle label="ChainReact" active={sourceKind === "internal"} onClick={() => setSourceKind("internal")} icon="Bolt" />
                    <SourceToggle label="GitHub" active={sourceKind === "github"} onClick={() => setSourceKind("github")} icon="Webhook" />
                  </div>
                </section>
              )}

              {sourceKind === "github" && supportsGithub ? (
                <GithubConfig
                  metrics={githubMetrics ?? []}
                  ghMetric={ghMetric}
                  onMetric={setGhMetric}
                  repo={repo}
                  onRepo={setRepo}
                  repoValid={repoValid}
                  githubConnected={githubConnected}
                />
              ) : (
                <InternalConfig
                  metricOptions={metricOptions}
                  metric={metric}
                  onMetric={setMetric}
                  sourceScoped={sourceScoped}
                  source={source}
                  onSource={setSource}
                  workflows={workflows}
                />
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-muted px-4 py-3.5">
          <button
            type="button"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex flex-[1.6] items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground hover:brightness-105 disabled:opacity-50"
            onClick={save}
            disabled={saveDisabled}
          >
            <AnalyticsIcon name="Check" size={11} /> Save widget
          </button>
        </div>
      </aside>
    </>
  );
}

function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
      <span className="text-primary">
        <AnalyticsIcon name={icon} size={11} />
      </span>
      <span>{label}</span>
    </div>
  );
}

function SourceToggle({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] " +
        (active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-muted text-foreground hover:border-foreground/25")
      }
    >
      <AnalyticsIcon name={icon} size={12} /> {label}
    </button>
  );
}

function NoteConfig({ note, onChange }: { note: string; onChange: (v: string) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Comment" label="Note text" />
      <textarea
        className="min-h-[140px] rounded-lg border border-border bg-muted p-3 text-[13px] text-foreground outline-none focus:border-primary"
        value={note}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a note for you or your team…"
      />
    </section>
  );
}

function InternalConfig({
  metricOptions,
  metric,
  onMetric,
  sourceScoped,
  source,
  onSource,
  workflows,
}: {
  metricOptions: { id: AnalyticsMetric; label: string }[];
  metric: AnalyticsMetric | undefined;
  onMetric: (m: AnalyticsMetric) => void;
  sourceScoped: boolean;
  source: string;
  onSource: (s: string) => void;
  workflows: readonly AnalyticsWorkflowStat[];
}) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <SectionHeading icon="Eye" label="What do you want to see?" />
        <p className="text-xs text-muted-foreground">Pick the metric for this widget.</p>
        <div className="grid grid-cols-1 gap-1.5">
          {metricOptions.map((m) => {
            const on = metric === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] " +
                  (on
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-muted text-foreground hover:border-foreground/25")
                }
                onClick={() => onMetric(m.id)}
              >
                {on && (
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <AnalyticsIcon name="Check" size={10} />
                  </span>
                )}
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading icon="Bolt" label="Which automation?" />
        <p className="text-xs text-muted-foreground">
          {sourceScoped
            ? "Focus on one automation, or roll up everything."
            : "This metric always rolls up every automation."}
        </p>
        <select
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary disabled:opacity-50"
          value={source}
          disabled={!sourceScoped}
          onChange={(e) => onSource(e.target.value)}
        >
          <option value="any">Any automation</option>
          {workflows.map((w) => (
            <option key={w.workflowId} value={w.workflowId}>
              {w.name}
            </option>
          ))}
        </select>
      </section>
    </>
  );
}

function GithubConfig({
  metrics,
  ghMetric,
  onMetric,
  repo,
  onRepo,
  repoValid,
  githubConnected,
}: {
  metrics: { id: string; label: string }[];
  ghMetric: string;
  onMetric: (m: string) => void;
  repo: string;
  onRepo: (v: string) => void;
  repoValid: boolean;
  githubConnected: boolean;
}) {
  return (
    <>
      {!githubConnected && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="mt-0.5 flex-shrink-0 text-warning">
            <AnalyticsIcon name="AlertTriangle" size={11} />
          </span>
          <span>
            You haven't connected GitHub. Connect it in Apps — this widget uses your own GitHub
            connection, so each viewer sees their own data.
          </span>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeading icon="Eye" label="GitHub metric" />
        <div className="grid grid-cols-1 gap-1.5">
          {metrics.map((m) => {
            const on = ghMetric === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] " +
                  (on
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-muted text-foreground hover:border-foreground/25")
                }
                onClick={() => onMetric(m.id)}
              >
                {on && (
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <AnalyticsIcon name="Check" size={10} />
                  </span>
                )}
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading icon="Layers" label="Repository" />
        <p className="text-xs text-muted-foreground">
          One repository as <span className="font-mono">owner/repo</span>.
        </p>
        <input
          className={
            "w-full rounded-lg border bg-muted px-3 py-2 font-mono text-[13px] text-foreground outline-none focus:border-primary " +
            (repo.length > 0 && !repoValid ? "border-destructive" : "border-border")
          }
          value={repo}
          onChange={(e) => onRepo(e.target.value)}
          placeholder="octocat/hello-world"
          aria-label="GitHub repository"
          spellCheck={false}
        />
        {repo.length > 0 && !repoValid && (
          <span className="text-[11px] text-destructive">
            Enter a valid <span className="font-mono">owner/repo</span> (no spaces or extra text).
          </span>
        )}
      </section>
    </>
  );
}
