import type {
  AccountTemplateSummary,
  MarketplaceTemplateSummary,
  TemplateVisibility,
} from "@/contracts/workflowTemplate";
import type { WorkflowDetail } from "@/contracts/workflow";

/**
 * Typed client for the workflow-templates API (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-5 /
 * CS-XT-7A). Per project-structure-and-module-boundaries.md §5: components/feature hooks call
 * this module, never `fetch()` directly. Failures surface as `TemplateApiError` so the UI can
 * branch on `code` (e.g. TEMPLATES_REQUIRE_UPGRADE / TEMPLATE_LIMIT_REACHED → upgrade copy).
 *
 * The marketplace DTO is already credential-free + omits account_id / created_by_user_id; this
 * client adds no ids.
 */

export class TemplateApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "TemplateApiError";
    this.code = code;
    this.status = status;
  }
}

async function parseError(res: Response): Promise<TemplateApiError> {
  let code = `HTTP_${res.status}`;
  let message = "Something went wrong. Please try again.";
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    if (body.code) code = body.code;
    if (body.error) message = body.error;
  } catch {
    /* non-JSON body — keep defaults */
  }
  return new TemplateApiError(message, code, res.status);
}

// ── account-owned templates ──────────────────────────────────────────────────

export async function listAccountTemplates(
  accountId: string,
): Promise<AccountTemplateSummary[]> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/workflow-templates`);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { templates: AccountTemplateSummary[] };
  return body.templates;
}

export async function updateAccountTemplate(
  accountId: string,
  templateId: string,
  patch: { name?: string; description?: string | null; visibility?: TemplateVisibility },
): Promise<AccountTemplateSummary> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/workflow-templates/${encodeURIComponent(templateId)}`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) },
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { template: AccountTemplateSummary };
  return body.template;
}

export async function deleteAccountTemplate(accountId: string, templateId: string): Promise<void> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/workflow-templates/${encodeURIComponent(templateId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await parseError(res);
}

// ── marketplace ──────────────────────────────────────────────────────────────

export async function listMarketplaceTemplates(): Promise<MarketplaceTemplateSummary[]> {
  const res = await fetch("/api/workflow-templates/marketplace");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { templates: MarketplaceTemplateSummary[] };
  return body.templates;
}

// ── use / fork ───────────────────────────────────────────────────────────────

/** POST .../use — create a workflow from a template; returns the new workflow id to open. */
export async function useTemplate(
  templateId: string,
  body: { targetAccountId: string; workflowName?: string },
): Promise<{ workflowId: string; name: string }> {
  const res = await fetch(`/api/workflow-templates/${encodeURIComponent(templateId)}/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { workflowId: string; name: string };
}

/** POST .../fork — copy a template into the target account as a new owned template. */
export async function forkTemplate(
  templateId: string,
  body: { targetAccountId: string; name?: string; visibility?: TemplateVisibility },
): Promise<{ template: AccountTemplateSummary }> {
  const res = await fetch(`/api/workflow-templates/${encodeURIComponent(templateId)}/fork`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { template: AccountTemplateSummary };
}

// ── in-builder template actions (workflow-centric — no account id from the client) ─────

/**
 * POST /api/workflows/[currentWorkflowId]/create-from-template — create a NEW workflow
 * from a template in the SAME account as the currently-open workflow (resolved
 * server-side). Does NOT mutate the current workflow. Returns the new workflow id to open.
 */
export async function createWorkflowFromTemplateForCurrent(
  currentWorkflowId: string,
  templateId: string,
): Promise<{ workflowId: string; name: string }> {
  const res = await fetch(
    `/api/workflows/${encodeURIComponent(currentWorkflowId)}/create-from-template`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ templateId }) },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { workflowId: string; name: string };
}

/**
 * POST /api/workflows/[currentWorkflowId]/replace-from-template — overwrite the current
 * workflow's draft definition with the template's sanitized graph (explicit + confirmed by
 * the caller). Returns the updated WorkflowDetail so the builder can re-hydrate the canvas.
 *
 * `opts.origin: "react_agent"` (the "apply to current workflow" choice on a React-Agent
 * template suggestion) asks the server to capture a pre-replace checkpoint + record a History
 * row, so the change is undoable from the builder's History tab. The in-builder Templates
 * modal omits it (keeps its "can't be undone" behavior).
 */
export async function replaceCurrentWorkflowFromTemplate(
  currentWorkflowId: string,
  templateId: string,
  opts: { origin?: "react_agent" } = {},
): Promise<WorkflowDetail> {
  const res = await fetch(
    `/api/workflows/${encodeURIComponent(currentWorkflowId)}/replace-from-template`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId, ...(opts.origin ? { origin: opts.origin } : {}) }),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowDetail;
}
