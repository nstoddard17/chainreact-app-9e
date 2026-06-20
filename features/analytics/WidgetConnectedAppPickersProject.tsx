"use client";

import { useEffect, useState } from "react";
import { fetchOptionsSource, type OptionItem } from "@/lib/api/options";
import { SectionHeading } from "./widgetConfigParts";
import { OptionsSelectField } from "./WidgetConnectedAppPickerShared";

/**
 * Project / work-management provider picker fields (GitHub / Trello / Airtable /
 * Monday) for the connected-app config drawer. Split out of
 * WidgetConnectedAppPickers.tsx in the Monday-slice cleanup. Pure move — NO
 * behavior change (Monday board field is added by the Monday slice).
 */

/**
 * GitHub repository field — a searchable combobox over the viewer's own repos
 * (`github:repos` options source) WITH a free-text `owner/repo` fallback.
 *
 * The single input's value IS the stored `owner/repo`: typing both filters the
 * fetched repo list AND serves as manual entry, so a repo that isn't in the
 * (bounded) picker — an org repo beyond the cap, or one a viewer can reach but the
 * author can't — is still reachable by typing it. Selecting a suggestion fills the
 * full `owner/repo`. Client-side validation stays a UX hint; the server remains
 * authoritative. The picker lists the EDITOR's repos only; no repo payload is
 * stored, only the chosen/typed `owner/repo`.
 */
export function GithubRepoField({
  value,
  onChange,
  repoValid,
  connected,
}: {
  value: string;
  onChange: (v: string) => void;
  repoValid: boolean;
  connected: boolean;
}) {
  type LoadState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; items: readonly OptionItem[]; hasMore: boolean }
    | { status: "error" };
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!connected) {
      setLoad({ status: "idle" });
      return;
    }
    let cancelled = false;
    setLoad({ status: "loading" });
    fetchOptionsSource("github:repos")
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setLoad({ status: "ok", items: res.items, hasMore: res.hasMore });
        else setLoad({ status: "error" });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const allItems = load.status === "ok" ? load.items : [];
  const lower = value.trim().toLowerCase();
  const suggestions = (
    lower.length === 0
      ? allItems
      : allItems.filter((i) => i.label.toLowerCase().includes(lower) && i.label.toLowerCase() !== lower)
  ).slice(0, 8);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Layers" label="Repository" />
      <p className="text-xs text-muted-foreground">
        Pick from your repos or type <span className="font-mono">owner/repo</span>.
      </p>
      <div className="relative">
        <input
          className={
            "w-full rounded-lg border bg-muted px-3 py-2 font-mono text-[13px] text-foreground outline-none focus:border-primary " +
            (value.length > 0 && !repoValid ? "border-destructive" : "border-border")
          }
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="octocat/hello-world"
          aria-label="GitHub repository"
          autoComplete="off"
          spellCheck={false}
        />
        {open && connected && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
            {suggestions.map((item) => (
              <li key={item.value}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] text-foreground hover:bg-muted"
                  // onMouseDown (not onClick) so the value is set before the input's onBlur fires.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate font-mono">{item.label}</span>
                  {item.description && (
                    <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {connected && load.status === "loading" && (
        <span className="text-[11px] text-muted-foreground">Loading your repos…</span>
      )}
      {connected && load.status === "error" && (
        <span className="text-[11px] text-muted-foreground">
          Couldn't load your repos — type <span className="font-mono">owner/repo</span> instead.
        </span>
      )}
      {connected && load.status === "ok" && load.hasMore && (
        <span className="text-[11px] text-muted-foreground">
          Showing your most recent repos. Type the full <span className="font-mono">owner/repo</span> if yours isn't listed.
        </span>
      )}
      {value.length > 0 && !repoValid && (
        <span className="text-[11px] text-destructive">
          Enter a valid <span className="font-mono">owner/repo</span> (no spaces or extra text).
        </span>
      )}
    </section>
  );
}

/** Trello board picker (`trello:boards`) — the viewer's accessible boards (required). */
export function TrelloBoardField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="trello:boards"
      icon="Layers"
      sectionLabel="Board"
      hint="Pick a Trello board to report on."
      disconnectedHint="Connect Trello to choose a board."
      loadingNoun="boards"
      errorFallback="Couldn't load Trello boards."
      ariaLabel="Trello board"
      placeholder="Select a board…"
      {...props}
    />
  );
}

/** Airtable base picker (`airtable:bases`) — the viewer's accessible bases (required). */
export function AirtableBaseField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="airtable:bases"
      icon="Database"
      sectionLabel="Base"
      hint="Pick an Airtable base to report on."
      disconnectedHint="Connect Airtable to choose a base."
      loadingNoun="bases"
      errorFallback="Couldn't load Airtable bases."
      ariaLabel="Airtable base"
      placeholder="Select a base…"
      {...props}
    />
  );
}

/**
 * Airtable table picker (`airtable:tables`, deps: baseId) — CASCADES off the
 * selected base. Re-fetches when `baseId` changes; shows a "select a base first"
 * hint until one is picked. Only table id + name are loaded — never record content.
 */
export function AirtableTableField({
  value,
  onChange,
  connected,
  baseId,
}: {
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
  baseId: string;
}) {
  type LoadState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; items: readonly OptionItem[] }
    | { status: "error"; message: string };
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const hasBase = baseId.trim().length > 0;
  useEffect(() => {
    if (!connected || !hasBase) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchOptionsSource("airtable:tables", { deps: { baseId } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setState({ status: "ok", items: res.items });
        else setState({ status: "error", message: res.message });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load Airtable tables." });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, hasBase, baseId]);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Layers" label="Table" />
      <p className="text-xs text-muted-foreground">Pick a table in the selected base.</p>
      {!connected ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Connect Airtable to choose a table.
        </div>
      ) : !hasBase ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Select a base first.
        </div>
      ) : state.status === "loading" ? (
        <div className="animate-pulse rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Loading tables…
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
          aria-label="Airtable table"
        >
          <option value="">Select a table…</option>
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

/** Monday board picker (`monday:boards`) — the viewer's accessible boards (required). */
export function MondayBoardField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="monday:boards"
      icon="Layers"
      sectionLabel="Board"
      hint="Pick a Monday board to report on."
      disconnectedHint="Connect Monday to choose a board."
      loadingNoun="boards"
      errorFallback="Couldn't load Monday boards."
      ariaLabel="Monday board"
      placeholder="Select a board…"
      {...props}
    />
  );
}

/**
 * HubSpot deal-pipeline picker (`hubspot:deal_pipelines`) — the account portal's deal
 * pipelines (required for deals_by_stage). HubSpot is account-shared, so the resolver
 * lists the portal's pipelines; only pipeline id + label are loaded, never deal data.
 */
export function HubSpotPipelineField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="hubspot:deal_pipelines"
      icon="Layers"
      sectionLabel="Deal pipeline"
      hint="Pick a HubSpot deal pipeline to break down by stage."
      disconnectedHint="Connect HubSpot to choose a pipeline."
      loadingNoun="pipelines"
      errorFallback="Couldn't load HubSpot pipelines."
      ariaLabel="HubSpot deal pipeline"
      placeholder="Select a pipeline…"
      {...props}
    />
  );
}

/**
 * Mailchimp audience picker (`mailchimp:audiences`) — the account's audiences (lists),
 * required for audience-scoped metrics. Mailchimp is account-shared, so the resolver
 * lists the account's audiences; only audience id + name are loaded, never subscriber
 * data or campaign content.
 */
export function MailchimpAudienceField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="mailchimp:audiences"
      icon="Database"
      sectionLabel="Audience"
      hint="Pick a Mailchimp audience to report on."
      disconnectedHint="Connect Mailchimp to choose an audience."
      loadingNoun="audiences"
      errorFallback="Couldn't load Mailchimp audiences."
      ariaLabel="Mailchimp audience"
      placeholder="Select an audience…"
      {...props}
    />
  );
}

/**
 * Dropbox folder picker (`dropbox:folders`) — OPTIONAL: the resolver prepends a Root
 * option (value "") so leaving it on Root reports across all of Dropbox. Only folder
 * path + name are loaded (path-as-value), never file content or names.
 */
export function DropboxFolderField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="dropbox:folders"
      icon="Layers"
      sectionLabel="Folder"
      hint="Pick a Dropbox folder, or leave on Root for all files."
      disconnectedHint="Connect Dropbox to choose a folder."
      loadingNoun="folders"
      errorFallback="Couldn't load Dropbox folders."
      ariaLabel="Dropbox folder"
      placeholder="Root (all files)"
      {...props}
    />
  );
}

/**
 * OneDrive folder picker (`microsoft-onedrive:folders`) — OPTIONAL: leaving it blank
 * reports across the whole drive (root). Lists top-level folders (id-as-value). Only
 * folder id + name are loaded, never file content or download URLs.
 */
export function OneDriveFolderField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="microsoft-onedrive:folders"
      icon="Layers"
      sectionLabel="Folder"
      hint="Pick a OneDrive folder, or leave blank for all files."
      disconnectedHint="Connect OneDrive to choose a folder."
      loadingNoun="folders"
      errorFallback="Couldn't load OneDrive folders."
      ariaLabel="OneDrive folder"
      placeholder="All files"
      {...props}
    />
  );
}

/**
 * Google Drive folder picker (`google-drive:folders`) — OPTIONAL: leaving it blank
 * reports across the whole My Drive (root). Lists folders (id-as-value). Only folder
 * id + name are loaded, never file content or web links.
 */
export function GoogleDriveFolderField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="google-drive:folders"
      icon="Layers"
      sectionLabel="Folder"
      hint="Pick a Google Drive folder, or leave blank for all files."
      disconnectedHint="Connect Google Drive to choose a folder."
      loadingNoun="folders"
      errorFallback="Couldn't load Google Drive folders."
      ariaLabel="Google Drive folder"
      placeholder="All files"
      {...props}
    />
  );
}

/**
 * Facebook Page picker (`facebook:pages`) — REQUIRED for page-scoped metrics. Lists the
 * Pages the connected user manages (id-as-value). Only page id + name are loaded, never
 * post content, user data, or the per-Page access token.
 */
export function FacebookPageField(props: { value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <OptionsSelectField
      source="facebook:pages"
      icon="Comment"
      sectionLabel="Page"
      hint="Pick a Facebook Page to report on."
      disconnectedHint="Connect Facebook to choose a Page."
      loadingNoun="Pages"
      errorFallback="Couldn't load Facebook Pages."
      ariaLabel="Facebook Page"
      placeholder="Select a Page…"
      {...props}
    />
  );
}
