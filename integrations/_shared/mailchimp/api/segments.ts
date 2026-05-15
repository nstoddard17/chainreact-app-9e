import { mailchimpRequest } from "./_request";

/**
 * Mailchimp Marketing API v3 `segments` resource wrappers — Slice 14
 * Commit 3.
 *
 * Endpoints covered:
 *   - POST /lists/{audienceId}/segments     (segmentCreate)
 *
 * V1 [`createSegment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createSegment.ts)
 * supports the same surface. Mailchimp's segment endpoints support
 * three segment types per current docs:
 *
 *   - **static** — manually-curated list of members; emails added via
 *     `static_segment` body array OR via `members` add/remove later.
 *   - **saved** — rule-based (auto-refreshing). Filters defined via
 *     `options.conditions`.
 *   - **fuzzy** — like saved but Mailchimp builds the filter from
 *     prose. Not exposed in Batch 1.
 *
 * V2 Batch 1 exposes static + saved. Tag management (the third
 * segment-ish surface in Mailchimp's UI) happens via the
 * `memberSetTags` wrapper, NOT here — tags are a distinct concept
 * from segments at the API layer even though the UI shows them
 * together.
 */

export interface MailchimpSegment {
  id: number;
  name: string;
  member_count?: number;
  type?: string;
  list_id?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── segmentCreate ──────────────────────────────────────────────────────────

/**
 * Mailchimp segment condition. The `field` + `op` + `value` shape is
 * Mailchimp's standard query DSL — exposed verbatim because the
 * documented field/op combinations don't compress into a simpler
 * cross-provider DSL.
 *
 * Examples:
 *   - `{ field: "EMAIL", op: "is", value: "x@y.com" }`
 *   - `{ field: "FNAME", op: "starts", value: "A" }`
 *   - `{ field: "language", op: "is", value: "en" }`
 */
export interface MailchimpSegmentCondition {
  field: string;
  op: string;
  value: string | number | boolean | ReadonlyArray<string | number>;
}

export interface SegmentCreateInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  name: string;
  /**
   * Static segment members — emails to seed into the segment at
   * creation time. Mutually exclusive with `conditions`. Both can be
   * empty (creates an empty static segment).
   */
  staticSegment?: readonly string[];
  /**
   * Saved-segment rule definition. Each condition group is AND-ed
   * together inside the segment.
   */
  conditions?: readonly MailchimpSegmentCondition[];
  /**
   * `match: 'any' | 'all'` for saved segments — how to combine the
   * conditions. Mailchimp's default is `any` (OR semantics); V2
   * wrappers leave the default to the API rather than imposing one.
   */
  match?: "any" | "all";
}

export async function segmentCreate(
  input: SegmentCreateInput,
): Promise<MailchimpSegment> {
  const body: Record<string, unknown> = { name: input.name };

  // Mailchimp's body shape:
  //   - Static segment: `static_segment: ["a@b.com", ...]`.
  //   - Saved segment: `options: { match, conditions }`.
  // Callers should pass exactly one of staticSegment / conditions;
  // the wrapper does NOT enforce mutual exclusion — the schema layer
  // on the action handler does.
  if (input.staticSegment !== undefined) {
    body.static_segment = [...input.staticSegment];
  }
  if (input.conditions !== undefined && input.conditions.length > 0) {
    const options: Record<string, unknown> = {
      conditions: input.conditions.map((c) => ({ ...c })),
    };
    if (input.match !== undefined) options.match = input.match;
    body.options = options;
  }

  return mailchimpRequest<MailchimpSegment>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "POST",
    path: `/lists/${encodeURIComponent(input.audienceId)}/segments`,
    body,
    resourceForNotFound: `segment (create) for audience ${input.audienceId}`,
  });
}

// ─── segmentGet (GET /lists/{audienceId}/segments/{segmentId}) ──────────────

/**
 * Read a single segment's metadata. Used by Mailchimp 2.1 Commit 3's
 * `segment_updated` polling trigger to detect observable state changes
 * (member_count / updated_at / name / type).
 *
 * Note: Mailchimp's segment id is numeric on the wire but accepted as
 * a string in the URL path. We accept string-typed input from the
 * trigger schema and pass through verbatim.
 */
export interface SegmentGetInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  segmentId: string;
}

export async function segmentGet(
  input: SegmentGetInput,
): Promise<MailchimpSegment> {
  return mailchimpRequest<MailchimpSegment>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(input.audienceId)}/segments/${encodeURIComponent(input.segmentId)}`,
    resourceForNotFound: `segment ${input.segmentId} (audience ${input.audienceId})`,
  });
}

// ─── segmentMembersList (GET /lists/{audienceId}/segments/{id}/members) ─────

/**
 * Member shape returned by `/lists/{audienceId}/segments/{id}/members`.
 * Mailchimp returns a subset of the standard member fields here; the
 * `subscriber_added_to_segment` trigger only needs the stable
 * identifier (`id` — the md5(lowercase(email)) subscriber hash) for
 * dedup keys plus a small bounded projection for the trigger payload.
 */
export interface MailchimpSegmentMember {
  id: string;
  email_address?: string;
  status?: string;
  merge_fields?: Record<string, unknown>;
  last_changed?: string;
}

interface MailchimpSegmentMembersResponse {
  members?: MailchimpSegmentMember[];
  total_items?: number;
}

export interface SegmentMembersListResult {
  members: readonly MailchimpSegmentMember[];
  totalItems: number;
}

export interface SegmentMembersListInput {
  accessToken: string;
  dc: string;
  audienceId: string;
  segmentId: string;
  /** Page size — Mailchimp caps at 1000; V2 wrappers clamp at 100. */
  count?: number;
  offset?: number;
}

/**
 * GET /lists/{audienceId}/segments/{segmentId}/members — single-page
 * list-read. Pagination cursoring is the caller's responsibility (the
 * polling trigger keeps its baseline bounded by taking the first
 * page; if a segment exceeds 100 members the trigger fires only on
 * the most-recent 100 by Mailchimp's documented sort). No
 * auto-pagination.
 */
export async function segmentMembersList(
  input: SegmentMembersListInput,
): Promise<SegmentMembersListResult> {
  const query = new URLSearchParams();
  query.set("count", String(Math.min(input.count ?? 50, 100)));
  if (input.offset !== undefined) query.set("offset", String(input.offset));

  const response = await mailchimpRequest<MailchimpSegmentMembersResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(input.audienceId)}/segments/${encodeURIComponent(input.segmentId)}/members`,
    query,
    resourceForNotFound: `segment members (audience ${input.audienceId} segment ${input.segmentId})`,
  });
  return {
    members: response.members ?? [],
    totalItems: response.total_items ?? 0,
  };
}
