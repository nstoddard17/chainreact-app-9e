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
import {
  exposedConnectedAppSources,
  findMetricOption,
  getExposedConnectedAppSource,
  metricsForType,
  type ConnectedAppFilterKind,
} from "./connectedAppSources";
import { SectionHeading, SourceToggle } from "./widgetConfigParts";
import { filterDataKey } from "./widgetFilterKeys";
import { ConnectedAppConfig } from "./WidgetConnectedAppConfig";

/**
 * Per-widget configuration drawer (Slice ANALYTICS-1; connected-app sources
 * generalized in ANALYTICS-SOURCES-SLACK-UI-1).
 *
 * Two kinds of data source:
 *   - ChainReact (internal): workflow/run metrics, optionally scoped to one
 *     workflow — the original behavior.
 *   - Connected app: a provider EXPOSED in features/analytics/connectedAppSources
 *     (currently Slack; GitHub is held back). The provider's descriptor drives the
 *     metric list + which filter inputs render (Slack channel picker, keyword,
 *     GitHub owner/repo). Writes `config.dataSource = { kind:"connected_app",
 *     provider, metricKey, filters }`. Server validation is authoritative; the
 *     client checks here are UX only and never name an arbitrary provider method.
 *
 * Only `exposed` providers ever appear here, so nothing ships a user-facing widget
 * for a provider that isn't smoke-testable — and there are no dead controls.
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

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

/** Google Calendar's safe default — the viewer's primary calendar (no list scope needed). */
const DEFAULT_CALENDAR_ID = "primary";

/** Filter kinds that are optional (blank = a safe default), so they're always save-ready. */
const OPTIONAL_FILTERS: ReadonlySet<ConnectedAppFilterKind> = new Set([
  "outlookcal_calendar", "dropbox_folder", "onedrive_folder", "gdrive_folder",
]);

export function WidgetConfigPanel({
  widget,
  workflows,
  connectedProviders,
  onClose,
  onSave,
}: {
  widget: AnalyticsWidget;
  workflows: readonly AnalyticsWorkflowStat[];
  connectedProviders: Record<string, boolean>;
  onClose: () => void;
  onSave: (config: AnalyticsWidgetConfig) => void;
}) {
  const isNote = widget.type === "note";

  // Connected-app providers exposed AND offering a metric for this widget type.
  const appSources = isNote
    ? []
    : exposedConnectedAppSources().filter((s) => metricsForType(s, widget.type).length > 0);

  const metricOptions = METRICS_BY_TYPE[widget.type];
  const existingDs = widget.config.dataSource;
  const existingProvider =
    existingDs?.kind === "connected_app" ? getExposedConnectedAppSource(existingDs.provider) : null;

  // sourceKind is "internal" or an exposed provider key.
  const [sourceKind, setSourceKind] = useState<string>(existingProvider?.provider ?? "internal");

  const [source, setSource] = useState<string>(widget.config.source ?? "any");
  const [metric, setMetric] = useState<AnalyticsMetric | undefined>(
    widget.config.metric ?? metricOptions[0]?.id,
  );
  const [note, setNote] = useState<string>(widget.config.note ?? "");

  const activeApp = sourceKind === "internal" ? null : getExposedConnectedAppSource(sourceKind);
  const appMetrics = activeApp ? metricsForType(activeApp, widget.type) : [];

  const [appMetricKey, setAppMetricKey] = useState<string>(
    existingDs?.kind === "connected_app" ? existingDs.metricKey : (appMetrics[0]?.id ?? ""),
  );

  const existingFilters =
    existingDs?.kind === "connected_app" ? (existingDs.filters ?? {}) : {};
  // Seed one connected-app filter from existing config (string only; else fallback).
  const initFilter = (k: string, fallback = ""): string => {
    const v = (existingFilters as Record<string, unknown>)[k];
    return typeof v === "string" ? v : fallback;
  };
  const [repo, setRepo] = useState(initFilter("repo"));
  const [channel, setChannel] = useState(initFilter("channel"));
  const [keyword, setKeyword] = useState(initFilter("keyword"));
  const [calendar, setCalendar] = useState(initFilter("calendar", DEFAULT_CALENDAR_ID));
  const [label, setLabel] = useState(initFilter("label"));
  const [folder, setFolder] = useState(initFilter("folder"));
  // Outlook Calendar picker is OPTIONAL — empty means "primary calendar".
  const [outlookCalendar, setOutlookCalendar] = useState(initFilter("outlook_calendar"));
  const [board, setBoard] = useState(initFilter("board"));
  const [airtableBase, setAirtableBase] = useState(initFilter("airtable_base"));
  const [airtableTable, setAirtableTable] = useState(initFilter("airtable_table"));
  // Changing the base clears the (now-stale) table selection so a widget can't be
  // saved with a table id that belongs to a different base.
  const onAirtableBaseChange = (v: string) => {
    setAirtableBase(v);
    setAirtableTable("");
  };
  const [mondayBoard, setMondayBoard] = useState(initFilter("monday_board"));
  const [hubspotPipeline, setHubspotPipeline] = useState(initFilter("hubspot_pipeline"));
  const [mailchimpAudience, setMailchimpAudience] = useState(initFilter("mailchimp_audience"));
  const [dropboxFolder, setDropboxFolder] = useState(initFilter("dropbox_folder"));
  const [onedriveFolder, setOnedriveFolder] = useState(initFilter("onedrive_folder"));
  const [gdriveFolder, setGdriveFolder] = useState(initFilter("gdrive_folder"));
  const [discordGuild, setDiscordGuild] = useState(initFilter("discord_guild"));
  const [discordChannel, setDiscordChannel] = useState(initFilter("discord_channel"));
  // Changing the server clears the (now-stale) channel selection.
  const onDiscordGuildChange = (v: string) => {
    setDiscordGuild(v);
    setDiscordChannel("");
  };
  const [teamsTeam, setTeamsTeam] = useState(initFilter("teams_team"));
  const [teamsChannel, setTeamsChannel] = useState(initFilter("teams_channel"));
  // Changing the team/server clears the now-stale child channel selection.
  const onTeamsTeamChange = (v: string) => { setTeamsTeam(v); setTeamsChannel(""); };
  const [facebookPage, setFacebookPage] = useState(initFilter("facebook_page"));
  const [excelWorkbook, setExcelWorkbook] = useState(initFilter("excel_workbook"));

  const sourceScoped = metric != null && SOURCE_SCOPED.has(metric);

  // The metric the user has selected for the active connected-app provider.
  const selectedAppMetric =
    activeApp != null ? findMetricOption(activeApp, widget.type, appMetricKey) : null;
  const requiredFilters = selectedAppMetric?.filters ?? [];

  const repoValid = REPO_RE.test(repo.trim());
  const keywordValid = keyword.trim().length >= 2 && keyword.trim().length <= 80;

  // Resolved (trimmed) value per filter kind; `keyword` is the implicit fallback.
  const filterValues: Partial<Record<ConnectedAppFilterKind, string>> = {
    repo: repo.trim(), slack_channel: channel.trim(), gcal_calendar: calendar.trim(),
    gmail_label: label.trim(), outlook_folder: folder.trim(), outlookcal_calendar: outlookCalendar.trim(),
    trello_board: board.trim(), airtable_base: airtableBase.trim(), airtable_table: airtableTable.trim(),
    monday_board: mondayBoard.trim(), hubspot_pipeline: hubspotPipeline.trim(), mailchimp_audience: mailchimpAudience.trim(),
    dropbox_folder: dropboxFolder.trim(), onedrive_folder: onedriveFolder.trim(), gdrive_folder: gdriveFolder.trim(),
    discord_guild: discordGuild.trim(), discord_channel: discordChannel.trim(), teams_team: teamsTeam.trim(),
    teams_channel: teamsChannel.trim(), facebook_page: facebookPage.trim(), excel_workbook: excelWorkbook.trim(),
  };

  function filterValid(kind: ConnectedAppFilterKind): boolean {
    if (kind === "repo") return repoValid;
    if (kind === "keyword") return keywordValid;
    // Optional filters (blank = a safe default), so always save-ready.
    if (OPTIONAL_FILTERS.has(kind)) return true;
    return (filterValues[kind] ?? "").length > 0; // required id/value
  }
  const appSaveReady =
    activeApp != null && appMetricKey.length > 0 && requiredFilters.every(filterValid);
  const saveDisabled = activeApp != null && !appSaveReady;

  const save = () => {
    if (activeApp && selectedAppMetric) {
      const filters: Record<string, string> = {};
      for (const kind of requiredFilters) {
        filters[filterDataKey(kind)] = filterValues[kind] ?? keyword.trim();
      }
      onSave({
        source: "any",
        dataSource: {
          kind: "connected_app",
          provider: activeApp.provider,
          metricKey: appMetricKey,
          filters,
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
              {appSources.length > 0 && (
                <section className="flex flex-col gap-2">
                  <SectionHeading icon="Layers" label="Data source" />
                  <div className="grid grid-cols-2 gap-2">
                    <SourceToggle
                      label="ChainReact"
                      active={sourceKind === "internal"}
                      onClick={() => setSourceKind("internal")}
                      icon="Bolt"
                    />
                    {appSources.map((s) => (
                      <SourceToggle
                        key={s.provider}
                        label={s.displayName}
                        active={sourceKind === s.provider}
                        onClick={() => {
                          setSourceKind(s.provider);
                          setAppMetricKey(metricsForType(s, widget.type)[0]?.id ?? "");
                        }}
                        icon={s.icon}
                      />
                    ))}
                  </div>
                </section>
              )}

              {activeApp ? (
                <ConnectedAppConfig
                  source={activeApp}
                  metrics={appMetrics}
                  metricKey={appMetricKey}
                  onMetric={setAppMetricKey}
                  requiredFilters={requiredFilters}
                  connected={connectedProviders[activeApp.provider] === true}
                  repo={repo}
                  onRepo={setRepo}
                  repoValid={repoValid}
                  channel={channel}
                  onChannel={setChannel}
                  keyword={keyword}
                  onKeyword={setKeyword}
                  keywordValid={keywordValid}
                  calendar={calendar}
                  onCalendar={setCalendar}
                  label={label}
                  onLabel={setLabel}
                  folder={folder}
                  onFolder={setFolder}
                  outlookCalendar={outlookCalendar}
                  onOutlookCalendar={setOutlookCalendar}
                  board={board}
                  onBoard={setBoard}
                  airtableBase={airtableBase}
                  onAirtableBase={onAirtableBaseChange}
                  airtableTable={airtableTable}
                  onAirtableTable={setAirtableTable}
                  mondayBoard={mondayBoard}
                  onMondayBoard={setMondayBoard}
                  hubspotPipeline={hubspotPipeline}
                  onHubspotPipeline={setHubspotPipeline}
                  mailchimpAudience={mailchimpAudience}
                  onMailchimpAudience={setMailchimpAudience}
                  dropboxFolder={dropboxFolder}
                  onDropboxFolder={setDropboxFolder}
                  onedriveFolder={onedriveFolder}
                  onOnedriveFolder={setOnedriveFolder}
                  gdriveFolder={gdriveFolder}
                  onGdriveFolder={setGdriveFolder}
                  discordGuild={discordGuild}
                  onDiscordGuild={onDiscordGuildChange}
                  discordChannel={discordChannel}
                  onDiscordChannel={setDiscordChannel}
                  teamsTeam={teamsTeam}
                  onTeamsTeam={onTeamsTeamChange}
                  teamsChannel={teamsChannel}
                  onTeamsChannel={setTeamsChannel}
                  facebookPage={facebookPage}
                  onFacebookPage={setFacebookPage}
                  excelWorkbook={excelWorkbook}
                  onExcelWorkbook={setExcelWorkbook}
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
