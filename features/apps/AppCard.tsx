"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@/features/integrations/ConnectButton";
import type { AppCatalogItem } from "@/contracts/apps";
import { AppStatusPill } from "./AppStatusPill";
import { DisconnectDialog } from "./DisconnectDialog";
import { ShareConnectionDialog } from "./ShareConnectionDialog";
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
 *   - **Reconnect IS per-account, in the EXPANDED section** (Slice
 *     4.APPS-RECONNECT — `reconnect` variant, "Reconnect this account" tooltip).
 *     It is NOT a provider-level/collapsed-card action: a provider can hold
 *     several accounts, and reconnect must target ONE specific row. It sends only
 *     the opaque integration id; the server steers the provider sign-in to that
 *     row and refuses to refresh a different account (callback identity-match).
 *     Renders only when `acc.canReconnect` (same per-account credential rule as
 *     Disconnect). Distinct from "Connect another" (which ADDS an account).
 *   - **Connect another** stays a separate primary action in the expanded
 *     account-section header (tooltip "Add another account"), shown only for
 *     multi-account providers — it ADDS an account rather than refreshing or
 *     removing an existing one.
 *
 * The connected-card intents read as distinct — provider-level Connect another
 * (additive) in the header; per-account Reconnect (filled-secondary+icon,
 * "Reconnect this account") + Disconnect (destructive-ghost, "Remove this
 * connection") on each row.
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
  // The account row whose share/unshare dialog is open (null = closed).
  const [shareTarget, setShareTarget] = useState<
    { id: string; label: string; mode: "share" | "unshare" } | null
  >(null);
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
          {/* Reconnect is NOT a provider-level action (Slice 4.APPS-RECONNECT).
              A provider can hold several connected accounts, and reconnect must
              target ONE specific row — so it lives per-account in the expanded
              Accounts list, next to that row's Disconnect. The collapsed card
              only ever exposes provider-level/additive actions (Connect /
              Connect another). */}
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
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {label}
                      </span>
                      {/* Sharing status pill — renders only for personal connections
                          with the feature ON (sharingStatus !== "not_applicable").
                          Account/shared-service providers + flag-off rows are
                          not_applicable and show nothing. No identity in the copy. */}
                      {acc.sharingStatus !== "not_applicable" && (
                        <span
                          data-testid="app-card-sharing-pill"
                          data-shared={acc.sharedWithAccount ? "true" : "false"}
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            acc.sharedWithAccount
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "border-border bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          {acc.sharedWithAccount ? "Shared with team" : "Private to you"}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Connected on {formatConnectedOn(acc.connectedAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {/* Share / Stop sharing — per-account, personal connections only.
                        canShare = the connector on a private row; canUnshare =
                        connector or owner/admin on a shared row. Both fold in the
                        feature flag server-side; the route re-authorizes. */}
                    {acc.canShare && (
                      <button
                        type="button"
                        data-testid="app-card-share"
                        data-account-id={acc.id}
                        title="Let your team run workflows with this connection"
                        onClick={() => {
                          setDisconnectedNotice(null);
                          setShareTarget({ id: acc.id, label, mode: "share" });
                        }}
                        className="shrink-0 rounded border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        Share with team
                      </button>
                    )}
                    {acc.canUnshare && (
                      <button
                        type="button"
                        data-testid="app-card-unshare"
                        data-account-id={acc.id}
                        title="Stop letting your team use this connection"
                        onClick={() => {
                          setDisconnectedNotice(null);
                          setShareTarget({ id: acc.id, label, mode: "unshare" });
                        }}
                        className="shrink-0 rounded border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        Stop sharing
                      </button>
                    )}
                    {/* Reconnect: per-account (Slice 4.APPS-RECONNECT). Targets
                        THIS specific row — the server steers the provider sign-in
                        to it and refuses to refresh a different account. Renders
                        only when the caller may manage this credential AND the
                        provider supports OAuth. Distinct from the header
                        "Connect another" (which ADDS an account). */}
                    {acc.canReconnect && app.canConnect && (
                      <ConnectButton
                        provider={app.providerId}
                        label="Reconnect"
                        variant="reconnect"
                        title="Reconnect this account"
                        testId="app-card-reconnect"
                        reconnect={{ integrationId: acc.id, accountId }}
                      />
                    )}
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
                  </span>
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

      {shareTarget && (
        <ShareConnectionDialog
          accountId={accountId}
          integrationId={shareTarget.id}
          appName={app.name}
          accountLabel={shareTarget.label}
          mode={shareTarget.mode}
          onClose={() => setShareTarget(null)}
          onDone={() => {
            setDisconnectedNotice(
              shareTarget.mode === "share"
                ? `Shared ${app.name} with your team.`
                : `Stopped sharing ${app.name}.`,
            );
            // Re-fetch the server component so the sharing status pill + controls
            // reflect the new scope (no optimistic state — the disconnect pattern
            // refetches; sharing follows the same model).
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
