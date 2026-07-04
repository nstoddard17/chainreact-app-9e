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
import { companiesGet } from "@/integrations/_shared/hubspot/api/companies";
import { dealsGet } from "@/integrations/_shared/hubspot/api/deals";
import { dealsCreate, dealsArchive } from "@/integrations/_shared/hubspot/api/deals";
import {
  contactsArchive,
  contactsCreate,
  contactsGet,
  findContactByEmail,
} from "@/integrations/_shared/hubspot/api/contacts";
import {
  listMembershipsGet,
  listsCreate,
  listsDelete,
  searchLists,
} from "@/integrations/_shared/hubspot/api/lists";
import {
  callsGet,
  meetingsGet,
  notesGet,
  tasksGet,
} from "@/integrations/_shared/hubspot/api/engagements";
import { ticketsGet } from "@/integrations/_shared/hubspot/api/tickets";
import { productsGet } from "@/integrations/_shared/hubspot/api/products";
import { lineItemsGet } from "@/integrations/_shared/hubspot/api/lineItems";
import { pipelinesList } from "@/integrations/_shared/hubspot/api/pipelines";
import { NotFoundError } from "@/integrations/_shared/hubspot/errors";
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

async function readHubSpotNoteState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const noteId = typeof input.config.noteId === "string" ? input.config.noteId : "";
  if (!noteId) return { ok: false, output: null, reason: "hubspot note_state: missing noteId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const note = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      notesGet({ accessToken, engagementId: noteId, properties: ["hs_note_body"] }),
  });
  return {
    ok: true,
    output: { found: true, body: note.properties.hs_note_body ?? null },
    reason: null,
  };
}

async function readHubSpotTaskState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const taskId = typeof input.config.taskId === "string" ? input.config.taskId : "";
  if (!taskId) return { ok: false, output: null, reason: "hubspot task_state: missing taskId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const task = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      tasksGet({ accessToken, engagementId: taskId, properties: ["hs_task_subject", "hs_task_status"] }),
  });
  return {
    ok: true,
    output: {
      found: true,
      subject: task.properties.hs_task_subject ?? null,
      status: task.properties.hs_task_status ?? null,
    },
    reason: null,
  };
}

async function readHubSpotCallState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const callId = typeof input.config.callId === "string" ? input.config.callId : "";
  if (!callId) return { ok: false, output: null, reason: "hubspot call_state: missing callId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const call = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      callsGet({ accessToken, engagementId: callId, properties: ["hs_call_title", "hs_call_status"] }),
  });
  return {
    ok: true,
    output: {
      found: true,
      title: call.properties.hs_call_title ?? null,
      status: call.properties.hs_call_status ?? null,
    },
    reason: null,
  };
}

async function readHubSpotMeetingState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const meetingId = typeof input.config.meetingId === "string" ? input.config.meetingId : "";
  if (!meetingId) return { ok: false, output: null, reason: "hubspot meeting_state: missing meetingId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const meeting = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      meetingsGet({
        accessToken,
        engagementId: meetingId,
        properties: ["hs_meeting_title", "hs_meeting_outcome"],
      }),
  });
  return {
    ok: true,
    output: {
      found: true,
      title: meeting.properties.hs_meeting_title ?? null,
      outcome: meeting.properties.hs_meeting_outcome ?? null,
    },
    reason: null,
  };
}

async function readHubSpotTicketState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const ticketId = typeof input.config.ticketId === "string" ? input.config.ticketId : "";
  if (!ticketId) return { ok: false, output: null, reason: "hubspot ticket_state: missing ticketId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const ticket = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      ticketsGet({ accessToken, ticketId, properties: ["subject", "hs_pipeline", "hs_pipeline_stage"] }),
  });
  return {
    ok: true,
    output: {
      found: true,
      subject: ticket.properties.subject ?? null,
      pipeline: ticket.properties.hs_pipeline ?? null,
      stage: ticket.properties.hs_pipeline_stage ?? null,
    },
    reason: null,
  };
}

async function readHubSpotProductState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const productId = typeof input.config.productId === "string" ? input.config.productId : "";
  if (!productId) return { ok: false, output: null, reason: "hubspot product_state: missing productId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  const product = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      productsGet({ accessToken, productId, properties: ["name", "description"] }),
  });
  return {
    ok: true,
    output: {
      found: true,
      name: product.properties.name ?? null,
      description: product.properties.description ?? null,
    },
    reason: null,
  };
}

async function readHubSpotLineItemState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const lineItemId = typeof input.config.lineItemId === "string" ? input.config.lineItemId : "";
  if (!lineItemId) return { ok: false, output: null, reason: "hubspot line_item_state: missing lineItemId" };
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  try {
    const lineItem = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "hubspot",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        lineItemsGet({ accessToken, lineItemId, properties: ["name", "quantity"] }),
    });
    return {
      ok: true,
      output: {
        exists: true,
        name: lineItem.properties.name ?? null,
        quantity: lineItem.properties.quantity ?? null,
      },
      reason: null,
    };
  } catch (err) {
    // ONLY the typed NotFoundError maps to exists:false (a deleted/archived line
    // item GETs 404). Any other error RE-THROWS so a permission/API failure can
    // never read as "deleted" — the composer's outer catch sanitizes it.
    if (err instanceof NotFoundError) {
      return { ok: true, output: { exists: false, name: null, quantity: null }, reason: null };
    }
    throw err;
  }
}

async function readHubSpotListMembershipState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const listId = typeof input.config.listId === "string" ? input.config.listId : "";
  const contactId = typeof input.config.contactId === "string" ? input.config.contactId : "";
  if (!listId || !contactId) {
    return { ok: false, output: null, reason: "hubspot list_membership_state: missing listId/contactId" };
  }
  const integration = await getActiveForExecution(ctx.accountId, "hubspot", null);
  if (!integration) return { ok: false, output: null, reason: "hubspot not connected" };
  // ONE bounded page (250 records) — the smoke list is tiny (staged empty, or a
  // smoke-named list), so the target contact is always on page 1. `member` is
  // decided ONLY from a SUCCESSFUL memberships read: an API/permission failure
  // (including a 404 on the list itself) throws -> the composer sanitizes it to
  // VERIFY_FAILED — absence is never inferred from an error.
  const page = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "hubspot",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) => listMembershipsGet({ accessToken, listId, limit: 250 }),
  });
  const records = page.results ?? [];
  return {
    ok: true,
    output: {
      member: records.some((r) => r.recordId === contactId),
      memberCount: records.length,
    },
    reason: null,
  };
}

/**
 * HubSpot smoke read-back seam. Owns eleven smoke-only read actions, each ONE
 * object's sanitized marker-bearing properties via the strongly-consistent
 * GET-by-id wrappers (never the eventually-consistent /search):
 *   - `contact_state` — { found, email, firstname, lastname }
 *   - `company_state` — { found, name, domain }
 *   - `deal_state`    — { found, dealname, dealstage, pipeline }
 *   - `note_state`    — { found, body }
 *   - `task_state`    — { found, subject, status }
 *   - `call_state`    — { found, title, status }
 *   - `meeting_state` — { found, title, outcome }
 *   - `ticket_state`  — { found, subject, pipeline, stage }
 *   - `product_state` — { found, name, description }
 *   - `line_item_state` — { exists, name, quantity }; the typed 404 maps to
 *     exists:false (deletion proof for remove_line_item), any other error
 *     rethrows so a failure can never read as "deleted".
 *   - `list_membership_state` — { member, memberCount } from ONE bounded
 *     memberships page; `member:false` requires a SUCCESSFUL read (an error,
 *     including a missing list, throws -> VERIFY_FAILED, never "absent").
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
  if (input.action === "note_state") return readHubSpotNoteState(ctx, input);
  if (input.action === "task_state") return readHubSpotTaskState(ctx, input);
  if (input.action === "call_state") return readHubSpotCallState(ctx, input);
  if (input.action === "meeting_state") return readHubSpotMeetingState(ctx, input);
  if (input.action === "ticket_state") return readHubSpotTicketState(ctx, input);
  if (input.action === "product_state") return readHubSpotProductState(ctx, input);
  if (input.action === "line_item_state") return readHubSpotLineItemState(ctx, input);
  if (input.action === "list_membership_state") return readHubSpotListMembershipState(ctx, input);
  return null;
}

export interface StagedHubSpotLineItemDeal {
  readonly dealId: string;
  /** Archive the staged parent deal (recycle bin, restorable). */
  readonly remove: () => Promise<void>;
}

/**
 * Stage ONE smoke parent deal for the line-item fixtures. `create_line_item`
 * requires a dealId, but a fixture-created deal would enter the run ledger with
 * no cleanup action and break the cleaned==created PASS gate — so the dev test
 * stages the deal OUTSIDE the harness (Gmail attachment-seed precedent), passes
 * its id via env overlay, and archives it in the finally via `remove`
 * (dealsArchive -> recycle bin; the only deal-disposal path, no registered
 * action exists). The dealname carries `markerPrefix` so even an archive
 * failure leaves a recognizable crsmoke artifact. No amount is set. Returns
 * null when HubSpot is not connected or the create fails -> the line-item
 * fixtures report BLOCKED_ENV.
 */
export interface StagedHubSpotListTarget {
  readonly listId: string;
  readonly listLabel: string;
  readonly contactId: string;
  readonly email: string;
  /** Tear down the staged objects (delete staged list, archive contact). */
  readonly remove: () => Promise<void>;
}

/**
 * Stage the list-membership smoke target: a MANUAL contacts list + ONE marker
 * contact. List resolution order: a pinned SMOKE_HUBSPOT_LIST_ID wins when it
 * names an existing non-archived MANUAL contacts list; else a
 * smoke/test/crsmoke-NAMED MANUAL contacts list is discovered via searchLists;
 * else a fresh `${markerPrefix}list` MANUAL list is CREATED (crm.lists.write is
 * in the manifest) — never an arbitrary real list, and never a DYNAMIC list
 * (HubSpot rejects manual membership writes on those with a 400).
 *
 * The contact is created fresh every run (marker email on the reserved
 * example.com domain). `remove` deletes the staged list (only when THIS run
 * created it; a discovered/pinned list is left as-is) and archives the contact
 * (recycle bin) — best-effort, never flips a verdict.
 *
 * Both staged ids ride the env overlay, NOT the fixture ledger — same
 * rationale as the staged line-item deal (no registered list/contact delete
 * action exists, so a ledgered parent would break the cleaned==created gate).
 */
export async function stageHubSpotListMembershipTarget(
  accountId: string,
  _userId: string,
  markerPrefix: string,
  pinnedListId: string | null,
): Promise<StagedHubSpotListTarget | null> {
  const integration = await getActiveForExecution(accountId, "hubspot", null);
  if (!integration) return null;
  const call = <T>(fn: (t: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({ accountId, provider: "hubspot", providerAccountId: integration.providerAccountId, apiCall: fn });
  try {
    // 1. Resolve a safe MANUAL contacts list: pinned -> smoke-named -> create.
    const found = await call((t) => searchLists({ accessToken: t, count: 200 }));
    const manualContactLists = (found.lists ?? []).filter(
      (l) =>
        l.archived !== true &&
        l.processingType === "MANUAL" &&
        (l.objectTypeId ?? "0-1") === "0-1",
    );
    const pinned = pinnedListId
      ? manualContactLists.find((l) => l.listId === pinnedListId)
      : undefined;
    const smokeNamed = manualContactLists.find((l) =>
      /crsmoke|smoke|test/i.test(l.name ?? ""),
    );
    let listId: string;
    let listLabel: string;
    let listStaged = false;
    const chosen = pinned ?? smokeNamed;
    if (chosen) {
      listId = chosen.listId;
      listLabel = chosen.name ?? chosen.listId;
    } else {
      const created = await call((t) =>
        listsCreate({
          accessToken: t,
          name: `${markerPrefix}list`,
          objectTypeId: "0-1",
          processingType: "MANUAL",
        }),
      );
      if (!created.list?.listId) return null;
      listId = created.list.listId;
      listLabel = created.list.name ?? `${markerPrefix}list`;
      listStaged = true;
    }

    // 2. Create the marker contact the membership fixtures add/remove.
    const email = `${markerPrefix}list-contact@example.com`;
    const contact = await call((t) =>
      contactsCreate({
        accessToken: t,
        properties: {
          email,
          firstname: `${markerPrefix}list-contact`,
          lastname: "smoke",
        },
      }),
    );

    // 3. Warm the search index (bounded): the membership handlers resolve the
    // email via findContactByEmail, and HubSpot's /search is EVENTUALLY
    // consistent — a seconds-old contact is routinely unindexed. Poll the SAME
    // lookup the handlers use (read-only) until it resolves, so the fixtures
    // never flake on index lag. Never found -> return null (BLOCKED_ENV,
    // honest) and tear down the staged contact.
    let indexed = false;
    for (let attempt = 0; attempt < 8 && !indexed; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));
      const hit = await call((t) => findContactByEmail({ accessToken: t, email }));
      indexed = hit !== null && hit.id === contact.id;
    }
    if (!indexed) {
      try {
        if (listStaged) await call((t) => listsDelete({ accessToken: t, listId }));
        await call((t) => contactsArchive({ accessToken: t, contactId: contact.id }));
      } catch {
        // best-effort teardown of the unusable staging; crsmoke-marked if left
      }
      return null;
    }

    return {
      listId,
      listLabel,
      contactId: contact.id,
      email,
      remove: async () => {
        try {
          if (listStaged) await call((t) => listsDelete({ accessToken: t, listId }));
          await call((t) => contactsArchive({ accessToken: t, contactId: contact.id }));
        } catch (err) {
          // Best-effort teardown: a 404 (already gone) or transient failure never
          // flips a verdict; anything left is crsmoke-marked and recognizable.
          console.warn(
            JSON.stringify({ event: "smoke.hubspot.staged_list_cleanup_failed", error: (err as Error).name }),
          );
        }
      },
    };
  } catch {
    return null;
  }
}

export async function stageHubSpotLineItemDeal(
  accountId: string,
  _userId: string,
  markerPrefix: string,
  pipelineId: string,
  stageId: string,
): Promise<StagedHubSpotLineItemDeal | null> {
  const integration = await getActiveForExecution(accountId, "hubspot", null);
  if (!integration) return null;
  const call = <T>(fn: (t: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({ accountId, provider: "hubspot", providerAccountId: integration.providerAccountId, apiCall: fn });
  try {
    const deal = await call((t) =>
      dealsCreate({
        accessToken: t,
        properties: {
          dealname: `${markerPrefix}lineitem-deal`,
          pipeline: pipelineId,
          dealstage: stageId,
        },
      }),
    );
    return {
      dealId: deal.id,
      remove: async () => {
        try {
          await call((t) => dealsArchive({ accessToken: t, dealId: deal.id }));
        } catch (err) {
          // Best-effort teardown: an already-archived deal (404) or transient
          // failure never flips a verdict; the marked deal is a harmless artifact.
          console.warn(
            JSON.stringify({ event: "smoke.hubspot.staged_deal_cleanup_failed", error: (err as Error).name }),
          );
        }
      },
    };
  } catch {
    return null;
  }
}

export interface HubSpotDealStageTarget {
  readonly pipelineId: string;
  readonly pipelineLabel: string;
  readonly stageId: string;
  readonly stageLabel: string;
}

/**
 * Shared pipeline+stage discovery core for deals AND tickets. A pinned pipeline
 * id wins when it names an existing non-archived pipeline with stages;
 * otherwise the first non-archived pipeline with at least one non-archived
 * stage is taken, and its first stage (HubSpot returns stages in displayOrder).
 * READ-ONLY. Returns null when HubSpot is not connected or no pipeline/stage
 * exists -> caller reports BLOCKED_ENV.
 */
async function discoverHubSpotPipelineStage(
  accountId: string,
  objectType: "deals" | "tickets",
  pinnedPipelineId: string | null,
): Promise<HubSpotDealStageTarget | null> {
  const integration = await getActiveForExecution(accountId, "hubspot", null);
  if (!integration) return null;
  try {
    const response = await refreshAndRetry({
      accountId,
      provider: "hubspot",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => pipelinesList({ accessToken, objectType }),
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

/**
 * Discover a usable DEAL pipeline + stage on the connected throwaway portal so
 * `create_deal` fixtures get REAL ids (HubSpot rejects invented stage ids).
 */
export async function discoverHubSpotDealStage(
  accountId: string,
  _userId: string,
  pinnedPipelineId: string | null,
): Promise<HubSpotDealStageTarget | null> {
  return discoverHubSpotPipelineStage(accountId, "deals", pinnedPipelineId);
}

/**
 * Discover a usable TICKET pipeline + stage on the connected throwaway portal
 * so `create_ticket` fixtures get REAL ids (same rule as deals: never invent a
 * stage id; a pinned SMOKE_HUBSPOT_TICKET_PIPELINE_ID wins).
 */
export async function discoverHubSpotTicketStage(
  accountId: string,
  _userId: string,
  pinnedPipelineId: string | null,
): Promise<HubSpotDealStageTarget | null> {
  return discoverHubSpotPipelineStage(accountId, "tickets", pinnedPipelineId);
}
