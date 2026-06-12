"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@/features/integrations/ConnectButton";
import type { AppCatalogItem } from "@/contracts/apps";
import { AppStatusPill } from "./AppStatusPill";
import { DisconnectDialog } from "./DisconnectDialog";
import { formatConnectedOn } from "./relativeDate";

/**
 * Provider card for the Apps dashboard (Slice 4.APPS-PAGE-1).
 *
 * Visual cue from the design's `ProviderCard`: a horizontal row that
 * expands inline to reveal connected accounts. Differences from the design,
 * locked in the slice plan:
 *   - **Workflows-per-account pills are NOT rendered.** No real link from
 *     integrations → workflows yet; would be a fake count.
 *   - **Per-account Manage buttons are NOT rendered.** No manage endpoint exists.
 *   - **Disconnect IS rendered per-account in the EXPANDED section** (CD-1→CD-3,
 *     live; shown only when `acc.canDisconnect` — owner/admin, or the original
 *     connector of a personal-credential provider). It's a de-emphasized ghost
 *     button (destructive-on-hover, tooltip "Remove this connection") that opens a
 *     confirm dialog — never a top-level card action.
 *   - **Reconnect IS rendered on a connected card** (`reconnect` variant —
 *     filled-secondary + refresh glyph + "Refresh this connection" tooltip).
 *     It reuses the same OAuth start flow so an expired/broken token is
 *     recoverable without discovering the "Connect another" workaround; it's
 *     deliberately subordinate to the filled-primary Connect CTA and is NOT a
 *     disconnect control. Not driven by a health/needs_reconnect DTO field
 *     (none today) — it's always offered on connected providers.
 *   - **Connect another** stays a separate primary action in the expanded
 *     account section (tooltip "Add another account"), shown only for
 *     multi-account providers — it ADDS an account rather than refreshing or
 *     removing the existing one.
 *
 * The three connected-card actions read as three distinct intents — visually
 * (primary / filled-secondary+icon / destructive-ghost) and via tooltips:
 *   Reconnect = refresh this connection · Connect another = add another account ·
 *   Disconnect = remove this connection.
 *   - **The animated colored-letter tile is replaced with the real
 *     `/integrations/<id>.svg` asset.** Falls back to two-letter initials
 *     if the file is missing — same pattern WorkflowProviderChips uses.
 *
 * The Connect / Reconnect / Connect another buttons all funnel through the
 * existing `ConnectButton`, which starts a real OAuth flow via
 * `lib/api/integrations.startOAuth()`.
 */
interface Props {
  app: AppCatalogItem;
  /** The active account that owns these connections — needed for the disconnect API path. */
  accountId: string;
}

export function AppCard({ app, accountId }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  // The account row whose Disconnect dialog is open (null = closed).
  const [disconnectTarget, setDisconnectTarget] = useState<
    { id: string; label: string } | null
  >(null);
  // Transient success line after a disconnect (cleared on next interaction).
  const [disconnectedNotice, setDisconnectedNotice] = useState<string | null>(null);
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
          {/* Reconnect: visible on a CONNECTED card so a broken/expired token is
              recoverable without discovering the "Connect another" workaround.
              Reuses the same OAuth start flow; re-authorizing the same workspace
              refreshes the existing row via upsertActive. Distinct from the
              expanded "Connect another" (which ADDS an account).
              Uses the `reconnect` treatment (filled-secondary + refresh glyph)
              so it's noticeable against the card — but it stays subordinate to
              the filled-primary Connect CTA and never reads as destructive. */}
          {app.isConnected && app.canConnect && (
            <ConnectButton
              provider={app.providerId}
              label="Reconnect"
              variant="reconnect"
              title="Refresh this connection"
              testId="app-card-reconnect"
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
                title="Add another account"
              />
            )}
          </div>
          {disconnectedNotice && (
            <p
              role="status"
              data-testid="app-card-disconnect-notice"
              className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
            >
              {disconnectedNotice}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {app.accounts.map((acc) => {
              const label = acc.displayName ?? "Connected account";
              return (
                <li
                  key={acc.id}
                  data-testid="app-card-account"
                  data-account-id={acc.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-xs font-medium text-foreground">
                      {label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Connected on {formatConnectedOn(acc.connectedAt)}
                    </span>
                  </span>
                  {/* Disconnect: per-account, in the expanded section only — never a
                      top-level app-card action. Renders only when the server says the
                      caller may disconnect THIS connection (canDisconnect already folds
                      in the feature flag + role + connector rule). */}
                  {acc.canDisconnect && (
                    <button
                      type="button"
                      data-testid="app-card-disconnect"
                      data-account-id={acc.id}
                      title="Remove this connection"
                      onClick={() => {
                        setDisconnectedNotice(null);
                        setDisconnectTarget({ id: acc.id, label });
                      }}
                      className="shrink-0 rounded border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      Disconnect
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {disconnectTarget && (
        <DisconnectDialog
          accountId={accountId}
          integrationId={disconnectTarget.id}
          appName={app.name}
          accountLabel={disconnectTarget.label}
          onClose={() => setDisconnectTarget(null)}
          onDisconnected={() => {
            setDisconnectedNotice(`Disconnected ${app.name}.`);
            // Re-fetch the server component so the connection list reflects the
            // soft-disconnect (the row drops out of the active set).
            router.refresh();
          }}
        />
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
