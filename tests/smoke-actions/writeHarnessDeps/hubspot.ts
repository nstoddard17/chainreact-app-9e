/**
 * Write smoke harness deps — HubSpot CRM smoke read-back seam + deal-stage discovery.
 *
 * HubSpot CRM write fixtures (create/update contact, company, deal) need an
 * INDEPENDENT read of ONE object's current properties keyed on its id. The
 * registered `get_contacts` / `get_companies` / `get_deals` actions go through
 * HubSpot's `/search` endpoints, which are EVENTUALLY consistent — a record
 * created seconds ago is routinely not yet indexed, so a search-based verify
 * would flake. The seam reads use the plain `GET /crm/v3/objects/<type>/{id}`
 * wrappers instead (strongly consistent), which no user-facing action exposes.
 *
 * Output is bounded + sanitized: ONLY the marker-bearing property fields a
 * verify asserts on ({ found, firstname/name/dealname, ... }) — never the full
 * property map, associations, or owner data.
 *
 * `discoverHubSpotDealStage` lists the portal's DEAL pipelines (unpaginated,
 * bounded) and picks a pinned pipeline (when `SMOKE_HUBSPOT_DEAL_PIPELINE_ID`
 * names one) or the first non-archived pipeline with at least one stage, then
 * that pipeline's first stage — so `create_deal` never invents a stage id.
 * Returns null when HubSpot is not connected or no usable pipeline/stage
 * exists -> the deal fixtures report BLOCKED_ENV (never a blind write).
 *
 * Every provider call runs inside `refreshAndRetry` (HubSpot is
 * OAuth-with-refresh), same as every HubSpot action handler and the other
 * smoke seams (seam-refresh-guard).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { contactsGet } from "@/integrations/_shared/hubspot/api/contacts";
import { companiesGet } from "@/integrations/_shared/hubspot/api/companies";
import { dealsGet } from "@/integrations/_shared/hubspot/api/deals";
import { pipelinesList } from "@/integrations/_shared/hubspot/api/pipelines";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

async function readHubSpotContactState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const contactId = typeof input.config.contactId === "string" ? input.config.contactId : "";
  if (!contactId) return { ok: false, output: null, reason: "hubspot contact_state: missing contactId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const contact = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      contactsGet({ accessToken, contactId, properties: ["email", "firstname", "lastname"] }),
  });
  return {
    ok: true,
    output: {
      found: true,
      email: contact.properties.email ?? null,
      firstname: contact.properties.firstname ?? null,
      lastname: contact.properties.lastname ?? null,
    },
    reason: null,
  };
}

async function readHubSpotCompanyState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const companyId = typeof input.config.companyId === "string" ? input.config.companyId : "";
  if (!companyId) return { ok: false, output: null, reason: "hubspot company_state: missing companyId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const company = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      companiesGet({ accessToken, companyId, properties: ["name", "domain"] }),
  });
  return {
    ok: true,
    output: {
      found: true,
      name: company.properties.name ?? null,
      domain: company.properties.domain ?? null,
    },
    reason: null,
  };
}

async function readHubSpotDealState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const dealId = typeof input.config.dealId === "string" ? input.config.dealId : "";
  if (!dealId) return { ok: false, output: null, reason: "hubspot deal_state: missing dealId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const deal = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      dealsGet({ accessToken, dealId, properties: ["dealname", "dealstage", "pipeline"] }),
  });
  return {
    ok: true,
    output: {
      found: true,
      dealname: deal.properties.dealname ?? null,
      dealstage: deal.properties.dealstage ?? null,
      pipeline: deal.properties.pipeline ?? null,
    },
    reason: null,
  };
}

/**
 * HubSpot smoke read-back seam. Owns three smoke-only read actions, each ONE
 * object's sanitized marker-bearing properties via the strongly-consistent
 * GET-by-id wrappers (never the eventually-consistent /search):
 *   - `contact_state` — { found, email, firstname, lastname }
 *   - `company_state` — { found, name, domain }
 *   - `deal_state`    — { found, dealname, dealstage, pipeline }
 * Returns null for any other (provider, action). Bounded + sanitized.
 */
export async function hubspotSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "hubspot") return null;
  if (input.action === "contact_state") return readHubSpotContactState(ctx, input);
  if (input.action === "company_state") return readHubSpotCompanyState(ctx, input);
  if (input.action === "deal_state") return readHubSpotDealState(ctx, input);
  return null;
}

export interface HubSpotDealStageTarget {
  readonly pipelineId: string;
  readonly pipelineLabel: string;
  readonly stageId: string;
  readonly stageLabel: string;
}

/**
 * Discover a usable DEAL pipeline + stage on the connected throwaway portal so
 * `create_deal` fixtures get REAL ids (HubSpot rejects invented stage ids). A
 * pinned pipeline id wins when it names an existing non-archived pipeline with
 * stages; otherwise the first non-archived pipeline with at least one
 * non-archived stage is taken, and its first stage (HubSpot returns stages in
 * displayOrder). READ-ONLY. Returns null when HubSpot is not connected or no
 * pipeline/stage exists -> caller reports BLOCKED_ENV.
 */
export async function discoverHubSpotDealStage(
  accountId: string,
  _userId: string,
  pinnedPipelineId: string | null,
): Promise<HubSpotDealStageTarget | null> {
  const integration = await getActiveForExecution(accountId, "hubspot", null);
  if (!integration) return null;
  try {
    const response = await refreshAndRetry({
      accountId,
      provider: "hubspot",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => pipelinesList({ accessToken, objectType: "deals" }),
    });
    const usable = (response.results ?? []).filter(
      (p) => p.archived !== true && (p.stages ?? []).some((s) => s.archived !== true),
    );
    const pipeline =
      (pinnedPipelineId ? usable.find((p) => p.id === pinnedPipelineId) : undefined) ?? usable[0];
    if (!pipeline) return null;
    const stage = (pipeline.stages ?? []).find((s) => s.archived !== true);
    if (!stage) return null;
    return {
      pipelineId: pipeline.id,
      pipelineLabel: pipeline.label ?? pipeline.id,
      stageId: stage.id,
      stageLabel: stage.label ?? stage.id,
    };
  } catch {
    return null;
  }
}
