"use client";

import { SectionHeading } from "./widgetConfigParts";
import { OptionsSelectField } from "./WidgetConnectedAppPickerShared";

/**
 * Communication-provider picker fields (Slack / Gmail / Outlook mail) for the
 * connected-app config drawer. Split out of WidgetConnectedAppPickers.tsx in the
 * Monday-slice cleanup. Pure move — NO behavior change.
 */

/** Keyword text input (Slack keyword_mentions). */
export function KeywordField({
  value,
  onChange,
  valid,
}: {
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Search" label="Keyword" />
      <p className="text-xs text-muted-foreground">Counts messages containing this word or phrase.</p>
      <input
        className={
          "w-full rounded-lg border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary " +
          (value.length > 0 && !valid ? "border-destructive" : "border-border")
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="launch"
        aria-label="Keyword"
        maxLength={80}
      />
      {value.length > 0 && !valid && (
        <span className="text-[11px] text-destructive">Enter a keyword between 2 and 80 characters.</span>
      )}
    </section>
  );
}

/** Slack channel picker (`slack:channels`) — public + private channels the bot sees. */
export function SlackChannelField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="slack:channels"
      icon="Comment"
      sectionLabel="Channel"
      hint="Pick a channel the ChainReact app has been added to."
      disconnectedHint="Connect Slack to choose a channel."
      loadingNoun="channels"
      errorFallback="Couldn't load Slack channels."
      ariaLabel="Slack channel"
      placeholder="Select a channel…"
      {...props}
    />
  );
}

/** Gmail label picker (`gmail:labels`) — system + user labels for the viewer's Gmail. */
export function GmailLabelField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="gmail:labels"
      icon="Layers"
      sectionLabel="Label"
      hint="Counts emails carrying this Gmail label."
      disconnectedHint="Connect Gmail to choose a label."
      loadingNoun="labels"
      errorFallback="Couldn't load Gmail labels."
      ariaLabel="Gmail label"
      placeholder="Select a label…"
      {...props}
    />
  );
}

/** Outlook folder picker (`microsoft-outlook:folders`) — the viewer's top-level mail folders. */
export function OutlookFolderField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="microsoft-outlook:folders"
      icon="Layers"
      sectionLabel="Folder"
      hint="Counts emails received into this Outlook folder."
      disconnectedHint="Connect Outlook to choose a folder."
      loadingNoun="folders"
      errorFallback="Couldn't load Outlook folders."
      ariaLabel="Outlook folder"
      placeholder="Select a folder…"
      {...props}
    />
  );
}
