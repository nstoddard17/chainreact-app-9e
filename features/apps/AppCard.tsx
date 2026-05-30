"use client";

import { useState } from "react";
import { ConnectButton } from "@/features/integrations/ConnectButton";
import type { AppCatalogItem } from "@/contracts/apps";
import { AppStatusPill } from "./AppStatusPill";
import { formatConnectedOn } from "./relativeDate";

/**
 * Provider card for the Apps dashboard (Slice 4.APPS-PAGE-1).
 *
 * Visual cue from the design's `ProviderCard`: a horizontal row that
 * expands inline to reveal connected accounts. Differences from the design,
 * locked in the slice plan:
 *   - **Workflows-per-account pills are NOT rendered.** No real link from
 *     integrations → workflows yet; would be a fake count.
 *   - **Per-account Manage / Disconnect buttons are NOT rendered.** No
 *     manage/disconnect API endpoint exists yet (markDisconnected is a
 *     repo function, not a wired route). Adding the disconnect endpoint
 *     is a follow-up slice.
 *   - **Reconnect button is NOT rendered.** No health-driven
 *     needs_reconnect state on the DTO today.
 *   - **The animated colored-letter tile is replaced with the real
 *     `/integrations/<id>.svg` asset.** Falls back to two-letter initials
 *     if the file is missing — same pattern WorkflowProviderChips uses.
 *
 * The Connect button funnels through the existing `ConnectButton`, which
 * starts a real OAuth flow via `lib/api/integrations.startOAuth()`.
 */
interface Props {
  app: AppCatalogItem;
}

export function AppCard({ app }: Props) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = app.isConnected;
  const accountCount = app.accounts.length;

  return (
    <li
      data-testid="app-card"
      data-provider-id={app.providerId}
      data-state={app.isConnected ? "connected" : "available"}
      className="rounded-md border border-border bg-card transition hover:border-foreground/20"
    >
      <div className="flex items-center gap-4 p-4">
        <ProviderIcon
          providerId={app.providerId}
          name={app.name}
          iconUrl={app.iconUrl}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              data-testid="app-card-name"
              className="truncate text-sm font-semibold text-foreground"
            >
              {app.name}
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {app.category}
            </span>
          </div>
          <p
            data-testid="app-card-sub"
            className="truncate text-xs text-muted-foreground"
          >
            {app.isConnected
              ? `${accountCount} account${accountCount === 1 ? "" : "s"} connected`
              : app.description || "Not yet connected"}
          </p>
        </div>
        <div className="hidden shrink-0 sm:block">
          <AppStatusPill isConnected={app.isConnected} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!app.isConnected && app.canConnect && (
            <ConnectButton
              provider={app.providerId}
              label={`Connect ${app.name}`}
            />
          )}
          {canExpand && (
            <button
              type="button"
              data-testid="app-card-expand"
              aria-expanded={expanded}
              aria-controls={`app-card-body-${app.providerId}`}
              aria-label={
                expanded
                  ? `Hide ${app.name} accounts`
                  : `Show ${app.name} accounts`
              }
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <ChevronIcon expanded={expanded} />
            </button>
          )}
        </div>
      </div>

      {expanded && canExpand && (
        <div
          id={`app-card-body-${app.providerId}`}
          data-testid="app-card-body"
          className="border-t border-border bg-muted/20 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accounts ({accountCount})
            </h3>
            {app.supportsMultipleAccounts && app.canConnect && (
              <ConnectButton
                provider={app.providerId}
                label="Connect another"
              />
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {app.accounts.map((acc) => (
              <li
                key={acc.id}
                data-testid="app-card-account"
                data-account-id={acc.id}
                className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="text-xs font-medium text-foreground">
                  {acc.displayName ?? "Connected account"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Connected on {formatConnectedOn(acc.connectedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function ProviderIcon({
  providerId,
  name,
  iconUrl,
}: {
  providerId: string;
  name: string;
  iconUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card"
      data-testid="app-card-icon"
      data-provider-id={providerId}
    >
      {iconUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6"
          aria-hidden
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="text-[10px] font-semibold uppercase text-muted-foreground"
          aria-hidden
        >
          {initials || "?"}
        </span>
      )}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{
        transform: expanded ? "rotate(180deg)" : undefined,
        transition: "transform .15s ease",
      }}
    >
      <polyline points="4 6 8 11 12 6" />
    </svg>
  );
}
