import { Badge } from "@/components/ui/badge";

/**
 * Connected / Reconnect needed / Not connected pill for the Apps dashboard
 * (Slice 4.APPS-PAGE-1; reconnect-needed state added V2-READY-28).
 *
 * Status is conveyed by **icon + text + Badge variant** — never color alone
 * (a11y requirement from the page guide §9). Uses the app's HSL Badge
 * variants (`success` / `warning` / `outline`). The reconnect-needed state
 * (`needsReconnect`) is driven by the persisted `needs_reconnect_at` signal so
 * green "Connected" no longer implies fully healthy when a connection has failed
 * auth. Safe copy only — no provider error / identity.
 */
interface Props {
  isConnected: boolean;
  /** True when ANY active connection for this provider needs reconnecting (V2-READY-28). */
  needsReconnect?: boolean;
  className?: string;
}

export function AppStatusPill({ isConnected, needsReconnect, className }: Props) {
  if (isConnected && needsReconnect) {
    return (
      <Badge
        variant="warning"
        className={className}
        data-testid="app-status-pill"
        data-state="needs-reconnect"
        aria-label="Status: reconnect needed"
      >
        <AlertIcon />
        <span>Reconnect needed</span>
      </Badge>
    );
  }
  if (isConnected) {
    return (
      <Badge
        variant="success"
        className={className}
        data-testid="app-status-pill"
        data-state="connected"
        aria-label="Status: connected"
      >
        <CheckIcon />
        <span>Connected</span>
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={className}
      data-testid="app-status-pill"
      data-state="not-connected"
      aria-label="Status: not connected"
    >
      <DotIcon />
      <span>Not connected</span>
    </Badge>
  );
}

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mr-1 shrink-0"
    >
      <polyline points="3 8 7 12 13 4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mr-1 shrink-0"
    >
      <line x1="8" y1="4" x2="8" y2="9" />
      <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className="mr-1 shrink-0"
    >
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}
