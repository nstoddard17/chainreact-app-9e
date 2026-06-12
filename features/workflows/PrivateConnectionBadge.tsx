/**
 * "Private connection" badge (Slice 4.WF-RUNPERM).
 *
 * Shown on a workflow the CURRENT viewer may not run/edit because it uses the
 * creator's private / member-connected credential (Gmail, Outlook, Calendar, …).
 * Running it would execute under the creator's external identity, so only the
 * creator can run/edit — others must duplicate it and pick their own connection.
 *
 * No-leak: the badge carries NO provider id, email, account label, scope, or
 * token — only the abstract "private connection" + the duplicate hint.
 */
interface Props {
  className?: string;
}

export function PrivateConnectionBadge({ className }: Props) {
  return (
    <span
      data-testid="workflow-private-connection-badge"
      title="This workflow runs with the creator's private connection. Duplicate it to use your own connection."
      className={
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground " +
        (className ?? "")
      }
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      Private connection
    </span>
  );
}
