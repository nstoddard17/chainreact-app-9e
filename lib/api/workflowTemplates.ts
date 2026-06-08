import type {
  AccountTemplateSummary,
  MarketplaceTemplateSummary,
  TemplateVisibility,
} from "@/contracts/workflowTemplate";

/**
 * Typed client for the workflow-templates API (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-5 /
 * CS-XT-7A). Per project-structure-and-module-boundaries.md §5: components/feature hooks call
 * this module, never `fetch()` directly. Failures surface as `TemplateApiError` so the UI can
 * branch on `code` (e.g. TEMPLATES_REQUIRE_UPGRADE / TEMPLATE_LIMIT_REACHED → upgrade copy).
 *
 * All routes are dark behind ENABLE_WORKFLOW_TEMPLATES (404 when off). The marketplace DTO is
 * already credential-free + omits account_id / created_by_user_id; this client adds no ids.
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
