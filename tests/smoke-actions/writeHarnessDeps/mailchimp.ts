/**
 * Write smoke harness deps — Mailchimp smoke read-back seam + audience discovery.
 *
 * The subscriber-lifecycle write fixtures verify through the REGISTERED
 * `get_subscriber` action (GET by subscriber hash — strongly consistent), so
 * the seam owns only what no registered read can prove:
 *   - `member_state` — existence probe for remove_subscriber's deletion proof.
 *     ONLY the typed NotFoundError maps to exists:false; any other error
 *     rethrows so a permission/API failure can never read as "deleted".
 *
 * `discoverMailchimpSmokeAudience` resolves the write target OUTSIDE the
 * harness: the audience (pinned env wins -> smoke/test-named -> first audience
 * on the throwaway account, mirroring the Monday board fallback) AND the
 * connected account's OWNER EMAIL (via `resolveMailchimpAccount`). The owner
 * email matters because Mailchimp's member validation REJECTS obviously fake
 * domains (e.g. anything@example.com -> "looks fake or invalid"), so the dev
 * test builds each smoke subscriber address by PLUS-ADDRESSING the owner
 * mailbox (`local+crsmoke-<runToken>-<role>@domain`) — a real, operator-owned
 * destination that still carries the run marker. Adding a member via the API
 * sends NO mail, so nothing is ever delivered anywhere.
 *
 * Every provider call runs inside `refreshAndRetry` (Mailchimp is
 * OAuth-with-refresh), same as the action handlers and the other smoke seams
 * (seam-refresh-guard).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  memberEventsList,
  memberGet,
  memberNotesList,
} from "@/integrations/_shared/mailchimp/api/members";
import { listsList } from "@/integrations/_shared/mailchimp/api/lists";
import { segmentGet } from "@/integrations/_shared/mailchimp/api/segments";
import { resolveMailchimpAccount } from "@/integrations/_shared/mailchimp/api/me";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

async function readMailchimpMemberState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const audienceId = typeof input.config.audienceId === "string" ? input.config.audienceId : "";
  const email = typeof input.config.email === "string" ? input.config.email : "";
  if (!audienceId || !email) {
    return { ok: false, output: null, reason: "mailchimp member_state: missing audienceId/email" };
  }
  const integration = await getActiveForExecution(ctx.accountId, "mailchimp", null);
  if (!integration) return { ok: false, output: null, reason: "mailchimp not connected" };
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    return { ok: false, output: null, reason: "mailchimp integration has no datacenter" };
  }
  try {
    const member = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "mailchimp",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => memberGet({ accessToken, dc, audienceId, email }),
    });
    return { ok: true, output: { exists: true, status: member.status ?? null }, reason: null };
  } catch (err) {
    // ONLY the typed NotFoundError maps to exists:false (a permanently deleted
    // member GETs 404). Any other error RE-THROWS so a permission/API failure
    // can never read as "deleted" — the composer's outer catch sanitizes it.
    if (err instanceof NotFoundError) {
      return { ok: true, output: { exists: false, status: null }, reason: null };
    }
    throw err;
  }
}

interface MailchimpSeamTarget {
  readonly integration: NonNullable<Awaited<ReturnType<typeof getActiveForExecution>>>;
  readonly dc: string;
}

/** Shared integration+dc resolution for the readers below. */
async function resolveSeamTarget(
  ctx: SmokeReaderContext,
): Promise<MailchimpSeamTarget | { error: string }> {
  const integration = await getActiveForExecution(ctx.accountId, "mailchimp", null);
  if (!integration) return { error: "mailchimp not connected" };
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    return { error: "mailchimp integration has no datacenter" };
  }
  return { integration, dc };
}

async function readMailchimpMemberNotesState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const audienceId = typeof input.config.audienceId === "string" ? input.config.audienceId : "";
  const email = typeof input.config.email === "string" ? input.config.email : "";
  if (!audienceId || !email) {
    return { ok: false, output: null, reason: "mailchimp member_notes_state: missing audienceId/email" };
  }
  const target = await resolveSeamTarget(ctx);
  if ("error" in target) return { ok: false, output: null, reason: target.error };
  const { notes } = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "mailchimp",
    providerAccountId: target.integration.providerAccountId,
    apiCall: (accessToken) =>
      memberNotesList({ accessToken, dc: target.dc, audienceId, email }),
  });
  // ONLY the note bodies of OUR smoke member — the marker assertion runs on them.
  return { ok: true, output: { found: true, notes: notes.map((n) => n.note) }, reason: null };
}

async function readMailchimpCustomEventState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const audienceId = typeof input.config.audienceId === "string" ? input.config.audienceId : "";
  const email = typeof input.config.email === "string" ? input.config.email : "";
  if (!audienceId || !email) {
    return { ok: false, output: null, reason: "mailchimp custom_event_state: missing audienceId/email" };
  }
  const target = await resolveSeamTarget(ctx);
  if ("error" in target) return { ok: false, output: null, reason: target.error };
  const { events } = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "mailchimp",
    providerAccountId: target.integration.providerAccountId,
    apiCall: (accessToken) =>
      memberEventsList({ accessToken, dc: target.dc, audienceId, email }),
  });
  // ONLY the event names on OUR smoke member's timeline.
  return { ok: true, output: { found: true, eventNames: events.map((e) => e.name) }, reason: null };
}

async function readMailchimpAudienceState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const audienceId = typeof input.config.audienceId === "string" ? input.config.audienceId : "";
  if (!audienceId) {
    return { ok: false, output: null, reason: "mailchimp audience_state: missing audienceId" };
  }
  const target = await resolveSeamTarget(ctx);
  if ("error" in target) return { ok: false, output: null, reason: target.error };
  // Presence is decided from a SUCCESSFUL account-wide lists read (bounded one
  // page of 100 — throwaway accounts have a handful of audiences at most).
  const { lists } = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "mailchimp",
    providerAccountId: target.integration.providerAccountId,
    apiCall: (accessToken) => listsList({ accessToken, dc: target.dc, count: 100 }),
  });
  const hit = lists.find((l) => l.id === audienceId);
  return {
    ok: true,
    output: { exists: hit !== undefined, name: hit?.name ?? null },
    reason: null,
  };
}

async function readMailchimpSegmentState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const audienceId = typeof input.config.audienceId === "string" ? input.config.audienceId : "";
  const segmentId = typeof input.config.segmentId === "string" ? input.config.segmentId : "";
  if (!audienceId || !segmentId) {
    return { ok: false, output: null, reason: "mailchimp segment_state: missing audienceId/segmentId" };
  }
  const target = await resolveSeamTarget(ctx);
  if ("error" in target) return { ok: false, output: null, reason: target.error };
  const segment = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "mailchimp",
    providerAccountId: target.integration.providerAccountId,
    apiCall: (accessToken) =>
      segmentGet({ accessToken, dc: target.dc, audienceId, segmentId }),
  });
  return {
    ok: true,
    output: { found: true, name: segment.name ?? null },
    reason: null,
  };
}

/**
 * Mailchimp smoke read-back seam. Owns five smoke-only read actions:
 *   - `member_state` — { exists, status } via GET-by-hash; typed 404 ->
 *     exists:false (deletion proof), other errors rethrow.
 *   - `member_notes_state` — { found, notes[] } (note bodies) via the notes
 *     read endpoint — proves add_note landed.
 *   - `custom_event_state` — { found, eventNames[] } via the contact-events
 *     read endpoint — proves create_custom_event landed on the timeline.
 *   - `audience_state` — { exists, name } from a SUCCESSFUL bounded lists
 *     read (absence is never inferred from an error).
 *   - `segment_state` — { found, name } via segment GET-by-id.
 * Returns null for any other (provider, action). Bounded + sanitized.
 */
export async function mailchimpSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "mailchimp") return null;
  if (input.action === "member_state") return readMailchimpMemberState(ctx, input);
  if (input.action === "member_notes_state") return readMailchimpMemberNotesState(ctx, input);
  if (input.action === "custom_event_state") return readMailchimpCustomEventState(ctx, input);
  if (input.action === "audience_state") return readMailchimpAudienceState(ctx, input);
  if (input.action === "segment_state") return readMailchimpSegmentState(ctx, input);
  return null;
}

export interface MailchimpSmokeAudience {
  readonly audienceId: string;
  readonly audienceLabel: string;
  /** Owner-mailbox local part for plus-addressed smoke subscriber emails. */
  readonly ownerLocal: string;
  /** Owner-mailbox domain for plus-addressed smoke subscriber emails. */
  readonly ownerDomain: string;
}

/**
 * Discover the Mailchimp write target: an audience (pinned env wins ->
 * smoke/test-named -> first audience on the throwaway account) + the
 * connected account's owner email split into local/domain for plus-addressed
 * smoke subscriber emails. READ-ONLY. Returns null when Mailchimp is not
 * connected, has no audience, or the owner email cannot be resolved ->
 * the write fixtures report BLOCKED_ENV.
 */
export async function discoverMailchimpSmokeAudience(
  accountId: string,
  _userId: string,
  pinnedAudienceId: string | null,
): Promise<MailchimpSmokeAudience | null> {
  const integration = await getActiveForExecution(accountId, "mailchimp", null);
  if (!integration) return null;
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) return null;
  try {
    const { lists } = await refreshAndRetry({
      accountId,
      provider: "mailchimp",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => listsList({ accessToken, dc, count: 100 }),
    });
    const pinned = pinnedAudienceId ? lists.find((l) => l.id === pinnedAudienceId) : undefined;
    const smokeNamed = lists.find((l) => /crsmoke|smoke|test/i.test(l.name ?? ""));
    const chosen = pinned ?? smokeNamed ?? lists[0];
    if (!chosen?.id) return null;

    const account = await refreshAndRetry({
      accountId,
      provider: "mailchimp",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => resolveMailchimpAccount(accessToken),
    });
    const email = account.email ?? "";
    const at = email.indexOf("@");
    if (at <= 0 || at === email.length - 1) return null;

    return {
      audienceId: chosen.id,
      audienceLabel: chosen.name ?? chosen.id,
      ownerLocal: email.slice(0, at),
      ownerDomain: email.slice(at + 1),
    };
  } catch {
    return null;
  }
}
