"use client";

import { useState } from "react";
import {
  fetchEligibleTargets,
  requestCredentialReassignment,
  type EligibleTargetDTO,
} from "@/lib/api/credentialOwners";

/**
 * Minimal Reassign-request control (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-5B /
 * CS-4b). Rendered next to the credential badge for owner/admin/creator on a
 * personal-provider node with no live override.
 *
 * Flow: "Reassign…" → load eligible members (already connected; display name only)
 * → pick one → POST the CS-3 request route → pending state. Errors render inline
 * with friendly copy. No provider label / email / token is ever shown.
 */

function mapErrorCode(code: string): string {
  switch (code) {
    case "NOT_APPLICABLE":
      return "This step uses a shared team connection — it can't be reassigned.";
    case "TARGET_NOT_CONNECTED":
      return "That member hasn't connected this app yet.";
    case "DUPLICATE_REASSIGNMENT":
      return "This step already has a pending or active reassignment.";
    case "NO_OP":
      return "That member already runs this step.";
    case "FORBIDDEN":
      return "You don't have permission to do that.";
    case "TARGET_NOT_MEMBER":
      return "That member is not part of this account.";
    case "WORKFLOW_NOT_FOUND":
      return "Reassignment isn't available for this workflow.";
    default:
      return "Couldn't complete the request. Try again.";
  }
}

export function CredentialReassignControl({
  workflowId,
  nodeId,
  onRequested,
}: {
  workflowId: string;
  nodeId: string;
  onRequested: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<readonly EligibleTargetDTO[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);

  if (requested) {
    return (
      <span data-testid="credential-reassign-requested" className="text-[11px] text-muted-foreground">
        Reassignment requested — pending the member&apos;s approval.
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="credential-reassign-open"
        className="w-fit text-[11px] font-medium text-primary hover:underline"
        onClick={async () => {
          setOpen(true);
          setError(null);
          setTargets(null);
          const res = await fetchEligibleTargets(workflowId, nodeId);
          if (res.ok) setTargets(res.members);
          else {
            setTargets([]);
            setError(mapErrorCode(res.code));
          }
        }}
      >
        Reassign to another member…
      </button>
    );
  }

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const res = await requestCredentialReassignment(workflowId, nodeId, selected);
    setSubmitting(false);
    if (res.ok) {
      setRequested(true);
      setOpen(false);
      onRequested();
    } else {
      setError(mapErrorCode(res.code));
    }
  };

  return (
    <div data-testid="credential-reassign-panel" className="flex flex-col gap-1.5">
      {targets === null ? (
        <span className="text-[11px] text-muted-foreground">Loading members…</span>
      ) : targets.length === 0 ? (
        <span data-testid="credential-reassign-empty" className="text-[11px] text-muted-foreground">
          No eligible members have connected this app.
        </span>
      ) : (
        <select
          data-testid="credential-reassign-select"
          aria-label="Choose a member"
          className="rounded border border-input bg-background px-2 py-1 text-xs"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a member…</option>
          {targets.map((t) => (
            <option key={t.userId} value={t.userId}>
              {t.displayName ?? "Member"}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="credential-reassign-submit"
          className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
          disabled={!selected || submitting}
          onClick={submit}
        >
          Request reassignment
        </button>
        <button
          type="button"
          data-testid="credential-reassign-cancel"
          className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => {
            setOpen(false);
            setSelected("");
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>

      {error ? (
        <span role="alert" data-testid="credential-reassign-error" className="text-[11px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
