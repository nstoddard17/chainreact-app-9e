import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { listProviders, providerIconUrl } from "@/integrations/_registry";
import * as workflowsRepo from "@/repositories/workflows";
import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import { getActiveAccountId, getDefaultBuilderView } from "@/repositories/userProfiles";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { buildRequiredFieldsByType } from "@/features/workflow-builder/validation/buildRequiredFieldsByType";
import { resolveAdvancedBranchingEntitlement } from "@/services/billing/advancedBranchingEntitlement";
import { isDocumentBuilderEnabled } from "@/services/workflows/documentBuilderFlags";
import { buildPreviewSetupFields } from "@/core/workflows/previewSetupFields";
import { buildConfigDiffFieldMeta } from "@/core/workflows/configDiffFieldMeta";
import { buildNodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { recordCollaborationLearningEvent } from "@/services/collaborationOnboarding/learningEvents";
import type { BuilderTeamContextValue } from "@/features/workflow-builder/context/builderTeamContext";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ focus?: string | string[]; created?: string | string[] }>;
}

/** 5.ONBOARD-1 Batch 3 — validated `?focus=` deep-link targets. Anything else
 * is ignored (no error, no behavior). */
const FOCUS_TARGETS = ["setup", "test", "activate"] as const;
type FocusTarget = (typeof FOCUS_TARGETS)[number];
function parseFocus(raw: string | string[] | undefined): FocusTarget | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return FOCUS_TARGETS.includes(value as FocusTarget)
    ? (value as FocusTarget)
    : undefined;
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
export default async function WorkflowDetailPage({ params, searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const initialFocus = parseFocus(resolvedSearchParams?.focus);
  // BUILDER-VIEW-DEFAULT-1 — one-shot creation marker from the creation flows
  // (?created=1). Anything else is ignored; the client strips it after mount.
  const createdRaw = resolvedSearchParams?.created;
  const justCreated = (Array.isArray(createdRaw) ? createdRaw[0] : createdRaw) === "1";
  const record = await workflowsRepo.getById(id);
  // Soft-deleted workflows are 404 — same contract as GET /api/workflows/[id].
  if (!record || record.state === "deleted") notFound();

  // BUILDER-VIEW-DEFAULT-1 — the user's saved default builder view. Best-effort:
  // a read failure degrades to "no default" (the chooser may ask once more),
  // never a broken builder page.
  let defaultBuilderView: Awaited<ReturnType<typeof getDefaultBuilderView>> = null;
  try {
    defaultBuilderView = await getDefaultBuilderView(user.id);
  } catch {
    defaultBuilderView = null;
  }

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
    // 5.ONBOARD-4 — member learning evidence for "open a shared workflow".
    // `workflowsRepo.getById` above reads through the SESSION (RLS) client, so
    // reaching this line already proves the caller was authorized to open this
    // workflow; combined with the shared-account check it proves they opened a
    // workflow belonging to a shared account. Fail-open inside, and the whole
    // block is already wrapped in the best-effort try/catch below.
    if (isTeamWorkflow) {
      await recordCollaborationLearningEvent({
        userId: user.id,
        accountId: record.accountId,
        eventType: "collab_shared_workflow_opened",
        workflowId: record.id,
      });
    }
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

  // HERMES-AGENT-CONFIG-DIFF-REVIEW — display-safe per-field metadata (label / required / hasDefault /
  // secret) per node type, from the same registry. Drives the right-rail "Review changes" value-level
  // config diff: field changes show author-facing labels (not raw keys), the still-missing-required list
  // populates, and secret redaction uses declared sensitivity. Static, so computed once here.
  const fieldMetaByType = buildConfigDiffFieldMeta(listAllActionMetas(), listAllTriggerMetas());

  // CONFIG-UX-NODE-SUMMARY-1 — display-safe field metadata (label / type / optionsSource / options /
  // visibleWhen) per node type, from the same registry. Lets the canvas adapter compute each node's
  // at-a-glance summary ("Send Channel Message · #support-alerts") for the COLLAPSED card. Static, so
  // computed once here.
  const summaryFieldsByType = buildNodeSummaryFieldsByType(listAllActionMetas(), listAllTriggerMetas());

  // BRANCH-ENT-1 C6 — advanced-branching plan capability for the owning
  // account (fail-closed: missing row / non-member RLS miss / read error →
  // not entitled → locked library entries).
  const branchingEntitlement = await resolveAdvancedBranchingEntitlement(
    record.accountId,
  );

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
        fieldMetaByType={fieldMetaByType}
        summaryFieldsByType={summaryFieldsByType}
        // HERMES-AGENT-GUIDANCE-UI-BUILDER — the React Agent rail is LIVE BY DEFAULT in the builder
        // (no feature-flag gate). `accountId` is server-resolved, never client-supplied. The actual
        // Hermes gateway call stays gated on gateway config server-side (route `getHermesAgentGatewayConfig()`);
        // when the gateway is unavailable/unconfigured the rail still renders and shows a calm
        // "temporarily unavailable" error in chat instead of disappearing.
        accountId={record.accountId}
        guidanceEnabled={true}
        // BRANCH-ENT-1 C6 — plan capability for the WORKFLOW-OWNING account,
        // resolved server-side (RLS read; unknown/unreadable fails closed to
        // locked). Drives the locked If/Then + Router library entries; the
        // server-side save/run gates stay the enforcement authority.
        canUseAdvancedBranching={branchingEntitlement.entitled}
        // 5.DUAL-BUILDER-1 CS-1 — server-resolved, default-OFF rollout flag for
        // the read-only Document view toggle. No NEXT_PUBLIC_*; flag OFF keeps
        // the builder byte-identical to today.
        documentBuilderEnabled={isDocumentBuilderEnabled()}
        // BUILDER-VIEW-DEFAULT-1 — the user's saved default view (null = ask on
        // a just-created workflow) + the one-shot creation marker.
        defaultBuilderView={defaultBuilderView}
        justCreated={justCreated}
        {...(initialFocus ? { initialFocus } : {})}
        {...(teamContext ? { teamContext } : {})}
      />
    </main>
  );
}
