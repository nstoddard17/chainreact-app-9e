import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { segmentsList } from "@/integrations/_shared/mailchimp/api/segments";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";

/**
 * `mailchimp:segments` options resolver — Slice 3.MAILCHIMP-2.
 *
 * Backs the `segmentId` picker on segment-scoped triggers
 * (`segment_updated`, `subscriber_added_to_segment`). Both consumers
 * already use `listId` as the parent field name, so the resolver
 * declares `requiredDeps: ["listId"]`.
 *
 * **Field-name variance — DELIBERATE choice of `listId` as the dep.**
 * Mailchimp action schemas use mixed parent names (`audience_id` in 9
 * actions, `listId` in 2 actions), but the existing segment-scoped
 * trigger schemas (the only current consumers of this resolver) both
 * use `listId`. Per the accepted MAILCHIMP-2 plan, the resolver dep
 * matches consumer field names — `listId` is correct for the v1
 * consumer set. Future actions that want a segment selector AND use
 * `audience_id` as the parent name would need a sibling resolver
 * (`mailchimp:segments_by_audience_id`) or a schema rename — deferred
 * to MAILCHIMP-3+ when meta wiring lands.
 *
 * Architecture mirrors `hubspot:deal_stages`:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["listId"]` — route validates + short-circuits
 *     with `MISSING_DEPENDENCY` before dispatch.
 *   - Wrapper goes through `refreshAndRetry`.
 *
 * Mapping (Mailchimp segment → OptionItem):
 *   - `value`: `id.toString()` — Mailchimp's segment id is numeric on
 *     the wire (`number`) but accepted as a string in URL paths and
 *     in the trigger schema (`segmentId: z.string()`). We stringify
 *     here so the picker round-trips cleanly.
 *   - `label`: `name` when non-empty, else stringified id as fallback.
 *   - `description`: `type` (static / saved / fuzzy) + member count
 *     when present — workflow authors care about the static-vs-saved
 *     distinction (different semantics for member changes) and
 *     member_count disambiguates similarly-named segments.
 *
 * Audience-not-found / 404 handling: if the parent `listId` was
 * archived / deleted between picker mounts, the Mailchimp wrapper
 * throws `NotFoundError`. We map to empty `items` rather than throw,
 * mirroring `hubspot:deal_stages` — the workflow author's natural
 * next move is to re-pick the parent audience, and the cascade
 * clears `segmentId` automatically when they do.
 *
 * `hasMore` propagates from the wrapper's `totalItems` vs
 * `segments.length`. Mailchimp's `segmentsList` clamps `count` at 100;
 * audiences with > 100 segments are unusual.
 *
 * Client-side `q` filter mirrors other resolvers: case-insensitive
 * substring match against the label.
 *
 * Error sanitization mirrors `mailchimp:audiences`. Provider error
 * bodies never reach the browser.
 */
export const mailchimpSegmentsResolver: OptionsResolver = {
  source: "mailchimp:segments",
  provider: "mailchimp",
  requiresIntegration: true,
  requiredDeps: ["listId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Mailchimp integration. Connect Mailchimp first.",
      );
    }

    const integration = ctx.integration;

    const listId = ctx.deps.listId;
    if (typeof listId !== "string" || listId.length === 0) {
      // Defense-in-depth — the route's requiredDeps guard should fire
      // before we reach here.
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select an audience first.",
      );
    }

    const dc = ctx.integration.accountMetadata.dc;
    if (typeof dc !== "string" || dc.length === 0) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Reconnect Mailchimp — missing datacenter info.",
      );
    }

    const providerAccountId = integration.providerAccountId;

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "mailchimp",
        providerAccountId,
        apiCall: (accessToken) =>
          segmentsList({ accessToken, dc, audienceId: listId, count: 100 }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Mailchimp and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Mailchimp and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Parent audience id no longer exists (archived / deleted) —
        // empty picker. NOT a thrown error: re-picking the audience
        // clears `segmentId` and triggers a fresh fetch under the new
        // parent value via the cascade.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Mailchimp segments. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const seg of response.segments) {
      if (typeof seg.id !== "number" || !Number.isFinite(seg.id)) continue;
      const value = seg.id.toString();
      const label =
        typeof seg.name === "string" && seg.name.length > 0 ? seg.name : value;
      const type =
        typeof seg.type === "string" && seg.type.length > 0 ? seg.type : null;
      const memberCount =
        typeof seg.member_count === "number" &&
        Number.isFinite(seg.member_count)
          ? seg.member_count
          : null;

      const descriptionParts: string[] = [];
      if (type !== null) descriptionParts.push(type);
      if (memberCount !== null) {
        descriptionParts.push(
          memberCount === 1 ? "1 member" : `${memberCount} members`,
        );
      }
      const description =
        descriptionParts.length > 0 ? descriptionParts.join(" · ") : undefined;

      items.push(
        description !== undefined
          ? { value, label, description }
          : { value, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    const hasMore = response.totalItems > response.segments.length;

    return { items: filtered, hasMore };
  },
};
