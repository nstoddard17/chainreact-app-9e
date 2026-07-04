import { subscriberHash } from "./_subscriberHash";
import { mailchimpRequest } from "./_request";

/**
 * Mailchimp Marketing API v3 `members` resource wrappers — Slice 14
 * Commit 3.
 *
 * Endpoints covered:
 *   - GET    /lists/{audienceId}/members/{subscriberHash}                 (memberGet)
 *   - PUT    /lists/{audienceId}/members/{subscriberHash}                 (memberPut — upsert)
 *   - PATCH  /lists/{audienceId}/members/{subscriberHash}                 (memberPatch)
 *   - DELETE /lists/{audienceId}/members/{subscriberHash}                 (memberArchive)
 *   - POST   /lists/{audienceId}/members/{subscriberHash}/actions/
 *            delete-permanent                                              (memberDeletePermanent)
 *   - POST   /lists/{audienceId}/members/{subscriberHash}/tags             (memberSetTags)
 *   - POST   /lists/{audienceId}/members/{subscriberHash}/notes            (memberAddNote)
 *   - POST   /lists/{audienceId}/members/{subscriberHash}/events           (memberAddEvent)
 *
 * Subscriber-hash derivation is centralized in `_subscriberHash.ts` —
 * every wrapper takes a raw email and hashes it here so callers never
 * need to know the wire-format detail.
 *
 * Merge-fields convention: Mailchimp's documented merge tags use
 * UPPERCASE names (`FNAME`, `LNAME`, `PHONE`, `ADDRESS`). V1 follows
 * this convention at [`addSubscriber.ts:60-70`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts#L60).
 * V2 wrappers leave merge-field mapping to the action handler — the
 * wrapper accepts whatever `mergeFields` shape the caller builds.
 *
 * Tag wire-format:
 *   - **PUT/PATCH member body** — `tags: string[]` of bare tag names.
 *     Mailchimp interprets these as the COMPLETE set of tags for the
 *     subscriber (NOT an additive diff). V2 only uses bare-string
 *     form during upsert (`memberPut`); the dedicated tag-set
 *     endpoint (`POST /members/{hash}/tags`) is used for add/remove
 *     diffs.
 *   - **POST /tags body** — `tags: [{ name, status: 'active' | 'inactive' }]`.
 *     `'active'` adds the tag; `'inactive'` removes it. Atomic: a single
 *     POST can mix adds and removes. V2's `memberSetTags` wrapper
 *     exposes this raw shape; the per-action handlers build the
 *     `{ name, status }` array.
 */

export interface MailchimpMember {
  id: string;
  email_address: string;
  unique_email_id?: string;
  /**
   * Mailchimp's `contact_id` field — a stable, opaque identifier for
   * the contact (distinct from `id` which is the MD5 of the email).
   * Surfaced in `get_subscriber` / `get_subscribers` projections.
   */
  contact_id?: string;
  status: string;
  list_id: string;
  merge_fields?: Record<string, unknown>;
  tags?: ReadonlyArray<{ id: number; name: string }>;
  timestamp_signup?: string;
  timestamp_opt?: string;
  last_changed?: string;
  email_type?: string;
  vip?: boolean;
}

// ─── memberGet ──────────────────────────────────────────────────────────────

export interface MemberGetInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
}

export async function memberGet(input: MemberGetInput): Promise<MailchimpMember> {
  const hash = subscriberHash(input.email);
  return mailchimpRequest<MailchimpMember>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}`,
    resourceForNotFound: `subscriber ${input.email}`,
  });
}

// ─── memberPut (upsert) ─────────────────────────────────────────────────────

export interface MemberPutInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
  /** Mailchimp status enum — REQUIRED. Q11: no default. */
  status:
    | "subscribed"
    | "unsubscribed"
    | "cleaned"
    | "pending"
    | "transactional";
  mergeFields?: Record<string, unknown>;
  /**
   * Bare-string tag names. Mailchimp interprets the array as the
   * complete set of tags for the subscriber on PUT/PATCH (NOT an
   * additive diff). Pass `undefined` to leave existing tags alone.
   */
  tags?: readonly string[];
  /**
   * The `status_if_new` Mailchimp field. Used when PUT-upserting an
   * existing subscriber: if the record exists, Mailchimp keeps the
   * current status; only newly-created records get the explicit
   * `status` value. We mirror the explicit `status` into
   * `status_if_new` so the upsert behavior is predictable
   * regardless of pre-existing state.
   */
  statusIfNew?: MemberPutInput["status"];
}

export async function memberPut(
  input: MemberPutInput,
): Promise<MailchimpMember> {
  const hash = subscriberHash(input.email);
  const body: Record<string, unknown> = {
    email_address: input.email,
    status_if_new: input.statusIfNew ?? input.status,
    status: input.status,
  };
  if (input.mergeFields && Object.keys(input.mergeFields).length > 0) {
    body.merge_fields = input.mergeFields;
  }
  if (input.tags && input.tags.length > 0) {
    body.tags = [...input.tags];
  }
  return mailchimpRequest<MailchimpMember>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "PUT",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}`,
    body,
    resourceForNotFound: `subscriber ${input.email}`,
  });
}

// ─── memberPatch (update existing) ──────────────────────────────────────────

export interface MemberPatchInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
  /**
   * Optional new status. Omit to leave status unchanged. (PATCH is a
   * partial update — only the fields present in the body change.)
   */
  status?: MemberPutInput["status"];
  /**
   * Optional new email — Mailchimp's `email_address` field on PATCH
   * triggers the email-change workflow (and fires `upemail` webhooks
   * if any are subscribed). Omit to leave email unchanged.
   */
  newEmail?: string;
  mergeFields?: Record<string, unknown>;
}

export async function memberPatch(
  input: MemberPatchInput,
): Promise<MailchimpMember> {
  const hash = subscriberHash(input.email);
  const body: Record<string, unknown> = {};
  if (input.status !== undefined) body.status = input.status;
  if (input.newEmail !== undefined) body.email_address = input.newEmail;
  if (input.mergeFields && Object.keys(input.mergeFields).length > 0) {
    body.merge_fields = input.mergeFields;
  }
  return mailchimpRequest<MailchimpMember>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "PATCH",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}`,
    body,
    resourceForNotFound: `subscriber ${input.email}`,
  });
}

// ─── memberArchive (DELETE — soft) ──────────────────────────────────────────

export interface MemberArchiveInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
}

/**
 * Archives the subscriber. Reversible — the subscriber stays in
 * Mailchimp's archive and can be re-subscribed via `memberPut`.
 * Returns nothing on 204.
 *
 * V1 [`removeSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/removeSubscriber.ts)
 * routes to this when `delete_permanently: false` (V1's default).
 */
export async function memberArchive(
  input: MemberArchiveInput,
): Promise<void> {
  const hash = subscriberHash(input.email);
  await mailchimpRequest<Record<string, never>>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "DELETE",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}`,
    resourceForNotFound: `subscriber ${input.email}`,
  });
}

// ─── memberDeletePermanent (POST .../actions/delete-permanent — hard) ───────

export interface MemberDeletePermanentInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
}

/**
 * **PERMANENTLY** deletes the subscriber. **Not reversible.** All
 * historical engagement / opt-in / event data is lost. Mailchimp
 * also blocks re-subscribing the same email address afterward —
 * GDPR-style erasure.
 *
 * Q11 surface: the action-handler schema makes this an explicit
 * choice (no default) so workflow authors must consciously pick
 * archive vs permanent.
 *
 * Returns nothing on 204.
 */
export async function memberDeletePermanent(
  input: MemberDeletePermanentInput,
): Promise<void> {
  const hash = subscriberHash(input.email);
  await mailchimpRequest<Record<string, never>>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "POST",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}/actions/delete-permanent`,
    resourceForNotFound: `subscriber ${input.email}`,
  });
}

// ─── memberSetTags (POST .../tags) ──────────────────────────────────────────

export interface MemberSetTagsInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
  /**
   * Mix of adds and removes — `status: 'active'` adds, `'inactive'`
   * removes. Mailchimp also auto-creates the tag if it doesn't yet
   * exist (no separate "create tag" endpoint needed).
   */
  tags: ReadonlyArray<{ name: string; status: "active" | "inactive" }>;
  /**
   * `is_syncing`: Mailchimp's flag for bulk-import scenarios that
   * suppresses normal change-side-effects. Defaults to false (the
   * Mailchimp-default behavior). V2 exposes it for future
   * bulk-import slices but normal workflow actions leave it false.
   */
  isSyncing?: boolean;
}

export async function memberSetTags(
  input: MemberSetTagsInput,
): Promise<void> {
  const hash = subscriberHash(input.email);
  await mailchimpRequest<Record<string, never>>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "POST",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}/tags`,
    body: {
      tags: [...input.tags],
      is_syncing: input.isSyncing ?? false,
    },
    resourceForNotFound: `subscriber tags ${input.email}`,
  });
}

// ─── memberAddNote (POST .../notes) ─────────────────────────────────────────

export interface MailchimpMemberNote {
  id: number;
  note: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export interface MemberAddNoteInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
  /** Note body. Mailchimp's max length is 1000 chars per docs. */
  note: string;
}

export async function memberAddNote(
  input: MemberAddNoteInput,
): Promise<MailchimpMemberNote> {
  const hash = subscriberHash(input.email);
  return mailchimpRequest<MailchimpMemberNote>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "POST",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}/notes`,
    body: { note: input.note },
    resourceForNotFound: `subscriber note ${input.email}`,
  });
}

// ─── memberNotesList (GET .../notes) ────────────────────────────────────────

interface MailchimpMemberNotesResponse {
  notes?: MailchimpMemberNote[];
  total_items?: number;
}

export interface MemberNotesListResult {
  notes: readonly MailchimpMemberNote[];
  totalItems: number;
}

export interface MemberNotesListInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
  /** Page size — Mailchimp caps at 1000; clamp to a bounded 100. */
  count?: number;
}

/**
 * GET /lists/{audienceId}/members/{hash}/notes — the read side of
 * `memberAddNote`. Backs the action-smoke `member_notes_state` seam
 * (proves an added note landed on the persisted member).
 */
export async function memberNotesList(
  input: MemberNotesListInput,
): Promise<MemberNotesListResult> {
  const hash = subscriberHash(input.email);
  const count = Math.min(input.count ?? 100, 100);
  const response = await mailchimpRequest<MailchimpMemberNotesResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}/notes?count=${count}`,
    resourceForNotFound: `subscriber notes ${input.email}`,
  });
  return {
    notes: response.notes ?? [],
    totalItems: response.total_items ?? (response.notes ?? []).length,
  };
}

// ─── memberAddEvent (POST .../events) ───────────────────────────────────────

export interface MemberAddEventInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
  /** Event name — Mailchimp's docs require lowercase, no spaces (≤30 chars). */
  name: string;
  /** Optional event properties — flat key/value object. */
  properties?: Readonly<Record<string, string>>;
  /**
   * Optional ISO-8601 timestamp. Mailchimp accepts `occurred_at` as a
   * historical timestamp; omit to default to "now" on the server.
   */
  occurredAt?: string;
  /**
   * Mailchimp's `is_syncing` flag — suppresses event-driven automation
   * triggers when batch-importing historical data. Defaults to false.
   */
  isSyncing?: boolean;
}

/**
 * POST /lists/{audienceId}/members/{hash}/events. Mailchimp returns
 * 204 No Content on success — the wrapper resolves with `{}`.
 */
export async function memberAddEvent(
  input: MemberAddEventInput,
): Promise<void> {
  const hash = subscriberHash(input.email);
  const body: Record<string, unknown> = {
    name: input.name,
    is_syncing: input.isSyncing ?? false,
  };
  if (input.properties && Object.keys(input.properties).length > 0) {
    body.properties = input.properties;
  }
  if (input.occurredAt !== undefined) {
    body.occurred_at = input.occurredAt;
  }
  await mailchimpRequest<Record<string, never>>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "POST",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}/events`,
    body,
    resourceForNotFound: `subscriber event ${input.email}`,
  });
}

// ─── memberEventsList (GET .../events) ──────────────────────────────────────

export interface MailchimpMemberEvent {
  name: string;
  properties?: Record<string, string>;
  occurred_at?: string;
}

interface MailchimpMemberEventsResponse {
  events?: MailchimpMemberEvent[];
  total_items?: number;
}

export interface MemberEventsListResult {
  events: readonly MailchimpMemberEvent[];
  totalItems: number;
}

export interface MemberEventsListInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  email: string;
  /** Page size — clamp to a bounded 100. */
  count?: number;
}

/**
 * GET /lists/{audienceId}/members/{hash}/events — the read side of
 * `memberAddEvent` (Mailchimp exposes a dedicated contact-events read
 * endpoint). Backs the action-smoke `custom_event_state` seam (proves
 * a fired custom event landed on the persisted member timeline).
 */
export async function memberEventsList(
  input: MemberEventsListInput,
): Promise<MemberEventsListResult> {
  const hash = subscriberHash(input.email);
  const count = Math.min(input.count ?? 100, 100);
  const response = await mailchimpRequest<MailchimpMemberEventsResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members/${hash}/events?count=${count}`,
    resourceForNotFound: `subscriber events ${input.email}`,
  });
  return {
    events: response.events ?? [],
    totalItems: response.total_items ?? (response.events ?? []).length,
  };
}

// ─── membersList (GET /lists/{id}/members) ──────────────────────────────────

/**
 * Mailchimp `/lists/{id}/members` response envelope. The wire surface
 * exposes more fields than V2's bounded action projection consumes;
 * the interface lists what `get_subscribers` actually maps over so
 * the downstream output shape stays predictable.
 */
interface MailchimpMembersListResponse {
  members?: MailchimpMember[];
  total_items?: number;
  list_id?: string;
}

/**
 * Bounded result type returned by `membersList`. The wrapper preserves
 * `total_items` so the action handler can derive `nextOffset` /
 * "has more pages" hints without re-fetching.
 */
export interface MembersListResult {
  members: readonly MailchimpMember[];
  /** Mailchimp's count of *all* matching members, not just this page. */
  totalItems: number;
}

export interface MembersListInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  /**
   * Filter by member status. Mailchimp's enum is
   * `subscribed | unsubscribed | cleaned | pending | transactional |
   * archived`. Omit to return all statuses.
   */
  status?:
    | "subscribed"
    | "unsubscribed"
    | "cleaned"
    | "pending"
    | "transactional"
    | "archived";
  /** Page size — Mailchimp caps at 1000; V2 clamps at 100 per audit §12 R3. */
  count?: number;
  /** Pagination offset. */
  offset?: number;
  /**
   * Mailchimp's `since_last_changed` query param — ISO-8601 timestamp.
   * Returns only members updated after this time.
   */
  sinceLastChanged?: string;
  /** Mailchimp's `before_last_changed` query param — ISO-8601 timestamp. */
  beforeLastChanged?: string;
  /**
   * Sort field — Mailchimp documents `timestamp_opt`, `timestamp_signup`,
   * `last_changed`. The action schema clamps to this allowlist; the
   * wrapper passes through whatever string is supplied.
   */
  sortField?: string;
  sortDir?: "ASC" | "DESC";
}

/**
 * GET /lists/{audienceId}/members — single-page list-read.
 *
 * Single-page only by design: workflows compose their own pagination
 * cursoring via the `offset` query param and the `totalItems` /
 * `nextOffset` output fields on `get_subscribers`. No auto-pagination
 * (per audit §11 + §12 R3).
 */
export async function membersList(
  input: MembersListInput,
): Promise<MembersListResult> {
  const query = new URLSearchParams();
  if (input.status) query.set("status", input.status);
  query.set("count", String(Math.min(input.count ?? 50, 100)));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  if (input.sinceLastChanged) {
    query.set("since_last_changed", input.sinceLastChanged);
  }
  if (input.beforeLastChanged) {
    query.set("before_last_changed", input.beforeLastChanged);
  }
  if (input.sortField) query.set("sort_field", input.sortField);
  if (input.sortDir) query.set("sort_dir", input.sortDir);

  const response = await mailchimpRequest<MailchimpMembersListResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(input.audienceId)}/members`,
    query,
    resourceForNotFound: `audience members ${input.audienceId}`,
  });

  return {
    members: response.members ?? [],
    totalItems: response.total_items ?? 0,
  };
}
