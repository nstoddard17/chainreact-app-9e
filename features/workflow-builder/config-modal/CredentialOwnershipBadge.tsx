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
 */
export function CredentialOwnershipBadge({ provider }: { provider: string }) {
  const team = useBuilderTeamContext();
  if (!team || !team.isTeamWorkflow || !provider) return null;

  const baseClass =
    "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

  if (credentialSharingForProvider(provider) === "account") {
    return (
      <span data-testid="credential-badge-shared" className={baseClass}>
        <Users className="h-3 w-3" aria-hidden />
        Shared team connection
      </span>
    );
  }

  // Personal provider — owner-controlled. Name the owner only (no label/email).
  const label = team.isViewerCreator
    ? "Runs under your connection"
    : team.creatorDisplayName
      ? `Runs under ${team.creatorDisplayName}'s connection`
      : "Runs under the workflow owner's connection";

  return (
    <span data-testid="credential-badge-owner" className={baseClass}>
      <Lock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
