"use client";

import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { useBuilderTeamContext } from "../context/builderTeamContext";
import { useNodeCredentialOwners } from "../hooks/useNodeCredentialOwners";
import { CredentialOwnershipBadge } from "./CredentialOwnershipBadge";
import { CredentialReassignControl } from "./CredentialReassignControl";

/**
 * Credential-owner section for the active config-modal node (CS-4b).
 *
 * Replaces the standalone badge: it loads safe per-node credential-owner metadata
 * and renders, for a TEAM workflow:
 *   - the ownership badge (assigned-member copy when an accepted override exists),
 *   - a "pending approval" line when a request is awaiting the target,
 *   - a minimal Reassign control for owner/admin/creator when the node has no live
 *     override and uses a personal provider.
 *
 * Renders only the (null) badge outside a team / for account providers. Never
 * shows a credential label / email / token — display names only.
 */
export function NodeCredentialOwnerSection({
  workflowId,
  nodeId,
  provider,
}: {
  workflowId: string | null | undefined;
  nodeId: string;
  provider: string;
}) {
  const team = useBuilderTeamContext();
  const enabled = Boolean(team?.isTeamWorkflow) && Boolean(workflowId);
  const { metadata, refetch } = useNodeCredentialOwners(workflowId ?? null, enabled);

  const record = metadata?.nodes.find((n) => n.nodeId === nodeId) ?? null;
  const canManage = metadata?.canManage ?? false;
  const accepted = record?.status === "accepted" ? record : null;
  const pending = record?.status === "pending" ? record : null;
  const isPersonal = Boolean(provider) && credentialSharingForProvider(provider) === "personal";

  return (
    <div className="flex flex-col gap-1.5">
      <CredentialOwnershipBadge
        provider={provider}
        assignedOwner={accepted ? { displayName: accepted.ownerDisplayName } : undefined}
      />

      {pending ? (
        <span
          data-testid="credential-reassign-pending"
          className="text-[11px] text-muted-foreground"
        >
          Reassignment pending {pending.ownerDisplayName ?? "the member"}&apos;s approval.
        </span>
      ) : null}

      {team?.isTeamWorkflow && canManage && isPersonal && !pending && !accepted && workflowId ? (
        <CredentialReassignControl
          workflowId={workflowId}
          nodeId={nodeId}
          onRequested={refetch}
        />
      ) : null}
    </div>
  );
}
