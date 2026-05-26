import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { listProviders, providerIconUrl } from "@/integrations/_registry";
import * as workflowsRepo from "@/repositories/workflows";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";

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
      className="flex h-screen flex-col overflow-hidden"
    >
      <WorkflowBuilder
        workflow={workflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />
    </main>
  );
}
