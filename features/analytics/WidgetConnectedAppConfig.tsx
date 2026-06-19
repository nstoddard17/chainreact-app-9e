"use client";

import { AnalyticsIcon } from "@/components/analytics/icons";
import { SectionHeading } from "./widgetConfigParts";
import type { ConnectedAppFilterKind, ConnectedAppSourceUi } from "./connectedAppSources";
import {
  AirtableBaseField,
  AirtableTableField,
  GcalCalendarField,
  GithubRepoField,
  GmailLabelField,
  HubSpotPipelineField,
  KeywordField,
  MondayBoardField,
  OutlookCalendarField,
  OutlookFolderField,
  SlackChannelField,
  TrelloBoardField,
} from "./WidgetConnectedAppPickers";

/**
 * Connected-app config controls for the widget drawer (Slice
 * ANALYTICS-SOURCES-SLACK-UI-1): the provider's metric picker + the filter inputs
 * the selected metric requires. Provider-agnostic — driven entirely by the
 * descriptor + the metric's `filters`. The individual filter field components live
 * in ./WidgetConnectedAppPickers (extracted in the Notion-slice cleanup).
 */

export function ConnectedAppConfig({
  source,
  metrics,
  metricKey,
  onMetric,
  requiredFilters,
  connected,
  repo,
  onRepo,
  repoValid,
  channel,
  onChannel,
  keyword,
  onKeyword,
  keywordValid,
  calendar,
  onCalendar,
  label,
  onLabel,
  folder,
  onFolder,
  outlookCalendar,
  onOutlookCalendar,
  board,
  onBoard,
  airtableBase,
  onAirtableBase,
  airtableTable,
  onAirtableTable,
  mondayBoard,
  onMondayBoard,
  hubspotPipeline,
  onHubspotPipeline,
}: {
  source: ConnectedAppSourceUi;
  metrics: readonly { id: string; label: string }[];
  metricKey: string;
  onMetric: (m: string) => void;
  requiredFilters: readonly ConnectedAppFilterKind[];
  connected: boolean;
  repo: string;
  onRepo: (v: string) => void;
  repoValid: boolean;
  channel: string;
  onChannel: (v: string) => void;
  keyword: string;
  onKeyword: (v: string) => void;
  keywordValid: boolean;
  calendar: string;
  onCalendar: (v: string) => void;
  label: string;
  onLabel: (v: string) => void;
  folder: string;
  onFolder: (v: string) => void;
  outlookCalendar: string;
  onOutlookCalendar: (v: string) => void;
  board: string;
  onBoard: (v: string) => void;
  airtableBase: string;
  onAirtableBase: (v: string) => void;
  airtableTable: string;
  onAirtableTable: (v: string) => void;
  mondayBoard: string;
  onMondayBoard: (v: string) => void;
  hubspotPipeline: string;
  onHubspotPipeline: (v: string) => void;
}) {
  return (
    <>
      {!connected && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="mt-0.5 flex-shrink-0 text-warning">
            <AnalyticsIcon name="AlertTriangle" size={11} />
          </span>
          <span>
            {source.connectHelp} Connect it in Apps.
            {source.visibility === "account"
              ? " Everyone on this account sees the same workspace data."
              : " This widget uses your own connection, so each viewer sees their own data."}
          </span>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeading icon="Eye" label={`${source.displayName} metric`} />
        <div className="grid grid-cols-1 gap-1.5">
          {metrics.map((m) => {
            const on = metricKey === m.id;
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

      {requiredFilters.includes("repo") && (
        <GithubRepoField value={repo} onChange={onRepo} repoValid={repoValid} connected={connected} />
      )}

      {requiredFilters.includes("slack_channel") && (
        <SlackChannelField value={channel} onChange={onChannel} connected={connected} />
      )}

      {requiredFilters.includes("keyword") && (
        <KeywordField value={keyword} onChange={onKeyword} valid={keywordValid} />
      )}

      {requiredFilters.includes("gcal_calendar") && (
        <GcalCalendarField value={calendar} onChange={onCalendar} connected={connected} />
      )}

      {requiredFilters.includes("gmail_label") && (
        <GmailLabelField value={label} onChange={onLabel} connected={connected} />
      )}

      {requiredFilters.includes("outlook_folder") && (
        <OutlookFolderField value={folder} onChange={onFolder} connected={connected} />
      )}

      {requiredFilters.includes("outlookcal_calendar") && (
        <OutlookCalendarField value={outlookCalendar} onChange={onOutlookCalendar} connected={connected} />
      )}

      {requiredFilters.includes("trello_board") && (
        <TrelloBoardField value={board} onChange={onBoard} connected={connected} />
      )}

      {requiredFilters.includes("airtable_base") && (
        <AirtableBaseField value={airtableBase} onChange={onAirtableBase} connected={connected} />
      )}

      {requiredFilters.includes("airtable_table") && (
        <AirtableTableField
          value={airtableTable}
          onChange={onAirtableTable}
          connected={connected}
          baseId={airtableBase}
        />
      )}

      {requiredFilters.includes("monday_board") && (
        <MondayBoardField value={mondayBoard} onChange={onMondayBoard} connected={connected} />
      )}

      {requiredFilters.includes("hubspot_pipeline") && (
        <HubSpotPipelineField value={hubspotPipeline} onChange={onHubspotPipeline} connected={connected} />
      )}
    </>
  );
}
