"use client";

import { Lock, Users } from "lucide-react";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { useBuilderTeamContext } from "../context/builderTeamContext";

/**
 * Per-node credential-ownership badge (Slice 4.TEAM-WORKFLOWS-6 / TW-3b).
 *
 * On a TEAM workflow, classifies the node's provider via the single
 * credential-sharing source of truth (`core/integrations/credentialSharing`):
 *   - account/service provider → "Shared team connection".
 *   - personal provider → "Runs under <owner>'s connection" (or "your
 *     connection" when the viewer is the creator) — names the owner only,
 *     NEVER a credential label / email / provider-account id.
 *
 * Renders nothing for personal-account workflows, an absent provider, or
 * outside a Team context — so the affordance is purely additive.
 *
 * CS-4 (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-5): when an ACCEPTED per-node
 * credential owner exists, pass `assignedOwner` so the badge names the assigned
 * member instead of the creator. If the assigned member's display name is
 * unavailable, it falls back to generic safe copy ("the assigned member") — it
 * still NEVER renders a credential label / email / provider-account id. The data
 * source that populates `assignedOwner` per node is wired in a later slice; until
 * then no caller passes it and the badge behaves exactly as before.
 */
export function CredentialOwnershipBadge({
  provider,
  assignedOwner,
}: {
  provider: string;
  /** Present only when an accepted node-owner override applies to this node. */
  assignedOwner?: { displayName: string | null };
}) {
  const team = useBuilderTeamContext();
  if (!team || !team.isTeamWorkflow || !provider) return null;

  const baseClass =
    "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

  if (credentialSharingForProvider(provider) === "account") {
    // Account/service providers ignore any node owner — always shared.
    return (
      <span data-testid="credential-badge-shared" className={baseClass}>
        <Users className="h-3 w-3" aria-hidden />
        Shared team connection
      </span>
    );
  }

  // Personal provider — owner-controlled. Name the owner only (no label/email).
  let label: string;
  if (assignedOwner) {
    // An accepted reassignment: name the assigned member, or generic safe copy.
    label = assignedOwner.displayName
      ? `Runs under ${assignedOwner.displayName}'s connection`
      : "Runs under the assigned member's connection";
  } else {
    label = team.isViewerCreator
      ? "Runs under your connection"
      : team.creatorDisplayName
        ? `Runs under ${team.creatorDisplayName}'s connection`
        : "Runs under the workflow owner's connection";
  }

  return (
    <span data-testid="credential-badge-owner" className={baseClass}>
      <Lock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
