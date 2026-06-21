import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { listProviders, providerIconUrl } from "@/integrations/_registry";
import * as workflowsRepo from "@/repositories/workflows";
import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import { getActiveAccountId } from "@/repositories/userProfiles";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { buildRequiredFieldsByType } from "@/features/workflow-builder/validation/buildRequiredFieldsByType";
import { buildPreviewSetupFields } from "@/core/workflows/previewSetupFields";
import { isHermesAgentEnabled } from "@/services/ai-guidance/gateway/gatewayConfig";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import type { BuilderTeamContextValue } from "@/features/workflow-builder/context/builderTeamContext";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Workflow detail / builder route.
 *
 * Slice 4.BUILDER-V1-SHELL-PARITY-1 — full-bleed workspace. The route's
 * job is now just authentication + data fetch + provider metadata
 * lookup; the entire visual surface (header, identity, save, lifecycle
 * controls, canvas, AI rail, inspector, run results, validation) is
 * owned by `<WorkflowBuilder>`. The previous detail-page chrome (the
 * "← All workflows" link, the `<header>` with h1 + status badge, the
 * `<WorkflowEditForm>` rename block, the `<RunHistory>` recent-runs
 * list, the `max-w-3xl mx-auto` centering wrapper) is gone — see §0
 * Correction history in docs/slices/phase-4/builder-ui-v1-port-plan.md.
 *
 * The route container is `h-screen flex-col overflow-hidden` so the
 * builder fills the browser height. `WorkflowBuilder` and its shell
 * chain `h-full` / `flex-1 min-h-0` so the canvas grows to fill
 * whatever space the rail + drawer + header don't claim.
 *
 * Workflow rename is currently deferred — `WorkflowEditForm` is no
 * longer mounted on this route. Re-introducing it as an in-header
 * edit-in-place affordance is a follow-up slice (see plan doc).
 */
export default async function WorkflowDetailPage({ params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { id } = await params;
  const record = await workflowsRepo.getById(id);
  // Soft-deleted workflows are 404 — same contract as GET /api/workflows/[id].
  if (!record || record.state === "deleted") notFound();

  const workflow = {
    id: record.id,
    name: record.name,
    state: record.state,
    disabledReason: record.disabledReason,
    disabledContext: record.disabledContext,
    activeRevisionId: record.activeRevisionId,
    draftDefinition: record.draftDefinition,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  // 4.TEAM-WORKFLOWS-6 (TW-3b) — display-only Team context for the builder
  // (credential-ownership badges + active-account mismatch banner). Resolved
  // server-side; never exposes raw account/creator ids or credential labels.
  // Best-effort: any failure degrades to no Team affordances (builder still
  // renders). The member-identity lookup runs only when needed (team workflow
  // viewed by a non-creator → to name the owner).
  let teamContext: BuilderTeamContextValue | undefined;
  try {
    // Read-only active-account resolution (display only): the stored pointer, or
    // the personal account when unset. Deliberately uses the read-only pointer
    // getter, NOT the side-effectful route-gate resolver (which self-heals) — a
    // page render needs only the id+name to compare, never a write.
    const activeAccountId = await getActiveAccountId(user.id);
    const [workflowAccount, activeAccount] = await Promise.all([
      accountsRepo.getById(record.accountId),
      activeAccountId
        ? accountsRepo.getById(activeAccountId)
        : accountsRepo.getPersonalAccountForUser(user.id),
    ]);
    const isTeamWorkflow = (workflowAccount?.type ?? "personal") !== "personal";
    const isViewerCreator = record.createdByUserId === user.id;
    let creatorDisplayName: string | null = null;
    if (isTeamWorkflow && !isViewerCreator) {
      const identities = await membershipsRepo.listMemberIdentities(record.accountId);
      creatorDisplayName =
        identities.find((i) => i.userId === record.createdByUserId)?.displayName ?? null;
    }
    teamContext = {
      isTeamWorkflow,
      isViewerCreator,
      creatorDisplayName,
      workflowAccountName: workflowAccount?.name ?? null,
      activeAccountName: activeAccount?.name ?? null,
      accountMismatch: activeAccount ? activeAccount.id !== record.accountId : false,
    };
  } catch {
    teamContext = undefined;
  }

  // BUILDER-READINESS — required-field metadata per node type, from the
  // discovery registry. Static (a node type's required fields never change), so
  // computed once here; the client validates the live config against it.
  const requiredFieldsByType = buildRequiredFieldsByType(
    listAllActionMetas(),
    listAllTriggerMetas(),
  );

  // HERMES-AGENT-GUIDED-PREVIEW-SETUP — supported, metadata-derived setup fields per node type. Used to
  // sanitize/seed the new nodes' config at Apply time (canvas preview nodes are visual-only after
  // HERMES-AGENT-HOLOGRAPHIC-PREVIEW-NODE-UX; setup controls re-home to the rail). Static; same registry.
  const setupFieldsByType = buildPreviewSetupFields(listAllActionMetas(), listAllTriggerMetas());

  const providers = listProviders();
  const triggerProviders = providers
    .filter((p) => p.isEnabled && p.capabilities.webhookTrigger)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      iconUrl: providerIconUrl(p.id),
    }));
  const actionProviders = providers
    .filter((p) => p.isEnabled && p.capabilities.actions)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      iconUrl: providerIconUrl(p.id),
    }));

  return (
    <main
      data-testid="workflow-builder-route"
      data-builder-surface
      className="flex h-screen flex-col overflow-hidden"
    >
      <WorkflowBuilder
        workflow={workflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={requiredFieldsByType}
        setupFieldsByType={setupFieldsByType}
        // HERMES-AGENT-GUIDANCE-UI-BUILDER — advisory "Build with me" entry, scoped to this
        // workflow's owning account. Server-gated (default OFF); accountId is never client-supplied.
        accountId={record.accountId}
        guidanceEnabled={isHermesAgentEnabled()}
        {...(teamContext ? { teamContext } : {})}
      />
    </main>
  );
}
