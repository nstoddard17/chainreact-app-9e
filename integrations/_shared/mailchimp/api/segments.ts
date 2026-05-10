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
