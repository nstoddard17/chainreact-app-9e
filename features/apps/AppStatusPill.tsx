import { Badge } from "@/components/ui/badge";

/**
 * Connected / Not connected pill for the Apps dashboard
 * (Slice 4.APPS-PAGE-1).
 *
 * Status is conveyed by **icon + text + Badge variant** — never color alone
 * (a11y requirement from the page guide §9). Uses the app's HSL Badge
 * variants (`success` / `outline`). No "Needs attention" state today —
 * surfacing that needs a health field on the DTO, which is deferred.
 */
interface Props {
  isConnected: boolean;
  className?: string;
}

export function AppStatusPill({ isConnected, className }: Props) {
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
