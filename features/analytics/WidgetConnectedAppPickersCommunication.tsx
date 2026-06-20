"use client";

import { useEffect, useState } from "react";
import { fetchOptionsSource, type OptionItem } from "@/lib/api/options";
import { SectionHeading } from "./widgetConfigParts";
import { OptionsSelectField } from "./WidgetConnectedAppPickerShared";

/**
 * Communication-provider picker fields (Slack / Gmail / Outlook mail / Discord) for
 * the connected-app config drawer. Split out of WidgetConnectedAppPickers.tsx in the
 * Monday-slice cleanup; Discord server/channel pickers added in the Discord-analytics
 * slice. Pure move — NO behavior change.
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

/**
 * Discord server (guild) picker (`discord:guilds`) — REQUIRED. Lists the servers the
 * ChainReact bot has been added to (id-as-value). Only guild id + name are loaded,
 * never message content, members, or user data.
 */
export function DiscordGuildField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="discord:guilds"
      icon="Comment"
      sectionLabel="Server"
      hint="Pick a Discord server to report on."
      disconnectedHint="Connect Discord to choose a server."
      loadingNoun="servers"
      errorFallback="Couldn't load Discord servers."
      ariaLabel="Discord server"
      placeholder="Select a server…"
      {...props}
    />
  );
}

/**
 * Discord channel picker (`discord:channels`) — REQUIRED, depends on the selected
 * server (guildId). Lists text-shaped channels in that server (id-as-value). Only
 * channel id + name are loaded, never message content, members, or user data.
 */
export function DiscordChannelField({
  value,
  onChange,
  connected,
  guildId,
}: {
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
  guildId: string;
}) {
  type LoadState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; items: readonly OptionItem[] }
    | { status: "error"; message: string };
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const hasGuild = guildId.trim().length > 0;
  useEffect(() => {
    if (!connected || !hasGuild) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchOptionsSource("discord:channels", { deps: { guildId } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setState({ status: "ok", items: res.items });
        else setState({ status: "error", message: res.message });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load Discord channels." });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, hasGuild, guildId]);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Comment" label="Channel" />
      <p className="text-xs text-muted-foreground">Pick a channel in the selected server.</p>
      {!connected ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Connect Discord to choose a channel.
        </div>
      ) : !hasGuild ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Select a server first.
        </div>
      ) : state.status === "loading" ? (
        <div className="animate-pulse rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Loading channels…
        </div>
      ) : state.status === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-muted-foreground">
          {state.message}
        </div>
      ) : state.status === "ok" ? (
        <select
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Discord channel"
        >
          <option value="">Select a channel…</option>
          {state.items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}

/**
 * Microsoft Teams team picker (`microsoft-teams:teams`) — REQUIRED. Lists the teams the
 * connected user is a member of (id-as-value). Only team id + name are loaded, never
 * message content, members, or user data.
 */
export function TeamsTeamField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="microsoft-teams:teams"
      icon="Comment"
      sectionLabel="Team"
      hint="Pick a Microsoft Teams team to report on."
      disconnectedHint="Connect Microsoft Teams to choose a team."
      loadingNoun="teams"
      errorFallback="Couldn't load Microsoft Teams teams."
      ariaLabel="Microsoft Teams team"
      placeholder="Select a team…"
      {...props}
    />
  );
}

/**
 * Microsoft Teams channel picker (`microsoft-teams:channels`) — REQUIRED, depends on
 * the selected team (teamId). Lists channels in that team (id-as-value). Only channel
 * id + name are loaded, never message content, members, or user data.
 */
export function TeamsChannelField({
  value,
  onChange,
  connected,
  teamId,
}: {
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
  teamId: string;
}) {
  type LoadState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; items: readonly OptionItem[] }
    | { status: "error"; message: string };
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const hasTeam = teamId.trim().length > 0;
  useEffect(() => {
    if (!connected || !hasTeam) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchOptionsSource("microsoft-teams:channels", { deps: { teamId } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setState({ status: "ok", items: res.items });
        else setState({ status: "error", message: res.message });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load Microsoft Teams channels." });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, hasTeam, teamId]);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Comment" label="Channel" />
      <p className="text-xs text-muted-foreground">Pick a channel in the selected team.</p>
      {!connected ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Connect Microsoft Teams to choose a channel.
        </div>
      ) : !hasTeam ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Select a team first.
        </div>
      ) : state.status === "loading" ? (
        <div className="animate-pulse rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Loading channels…
        </div>
      ) : state.status === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-muted-foreground">
          {state.message}
        </div>
      ) : state.status === "ok" ? (
        <select
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Microsoft Teams channel"
        >
          <option value="">Select a channel…</option>
          {state.items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}
