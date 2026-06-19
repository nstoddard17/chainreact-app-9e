"use client";

import { useEffect, useState } from "react";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { fetchOptionsSource, type OptionItem } from "@/lib/api/options";
import { SectionHeading } from "./widgetConfigParts";
import type { ConnectedAppFilterKind, ConnectedAppSourceUi } from "./connectedAppSources";

/**
 * Connected-app config controls for the widget drawer (Slice
 * ANALYTICS-SOURCES-SLACK-UI-1): the provider's metric picker + the filter inputs
 * the selected metric requires (Slack channel picker, keyword, GitHub owner/repo).
 * Provider-agnostic — driven entirely by the descriptor + the metric's `filters`.
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
        <section className="flex flex-col gap-2">
          <SectionHeading icon="Search" label="Keyword" />
          <p className="text-xs text-muted-foreground">
            Counts messages containing this word or phrase.
          </p>
          <input
            className={
              "w-full rounded-lg border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary " +
              (keyword.length > 0 && !keywordValid ? "border-destructive" : "border-border")
            }
            value={keyword}
            onChange={(e) => onKeyword(e.target.value)}
            placeholder="launch"
            aria-label="Keyword"
            maxLength={80}
          />
          {keyword.length > 0 && !keywordValid && (
            <span className="text-[11px] text-destructive">
              Enter a keyword between 2 and 80 characters.
            </span>
          )}
        </section>
      )}
    </>
  );
}

/**
 * Slack channel picker. Loads the connected workspace's channels through the
 * existing `slack:channels` options source (public + private channels the bot can
 * see). No free-text channel entry — only a selected channel id is written, which
 * keeps the analytics query pinned to a real, bot-visible channel (DMs excluded).
 */
function SlackChannelField({
  value,
  onChange,
  connected,
}: {
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
}) {
  type LoadState =
    | { status: "loading" }
    | { status: "ok"; items: readonly OptionItem[] }
    | { status: "error"; message: string };
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetchOptionsSource("slack:channels")
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setState({ status: "ok", items: res.items });
        } else {
          setState({ status: "error", message: res.message });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load Slack channels." });
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon="Comment" label="Channel" />
      <p className="text-xs text-muted-foreground">
        Pick a channel the ChainReact app has been added to.
      </p>
      {!connected ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Connect Slack to choose a channel.
        </div>
      ) : state.status === "loading" ? (
        <div className="animate-pulse rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Loading channels…
        </div>
      ) : state.status === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-muted-foreground">
          {state.message}
        </div>
      ) : (
        <select
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Slack channel"
        >
          <option value="">Select a channel…</option>
          {state.items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

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
function GithubRepoField({
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
