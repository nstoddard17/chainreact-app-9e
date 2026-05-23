import {
  OPTIONS_SOURCE_KEY_REGEX,
  type OptionsResolver,
} from "./types";

// Fixture resolver (Slice 3.30). Stays registered so smoke / route /
// integration tests have a provider-mock-free baseline.
import { nativeExamplesResolver } from "./fixtures/nativeExamples";

// First real provider resolver — Slice 3.32 (Slack channels picker for
// `slack:upload_file.channel`).
import { slackChannelsResolver } from "@/integrations/slack/options/channels";

// Google Sheets resolvers — Slice 3.GSHEETS-2.
// `spreadsheets` enumerates the connected user's spreadsheets via
// Drive's `files.list` (requires `drive.metadata.readonly` scope —
// added to the google-sheets manifest in the same slice). `sheets`
// enumerates the worksheets/tabs of a selected spreadsheet via Sheets'
// `spreadsheets.get?includeGridData=false`; depends on spreadsheetId.
// Together they back the two-hop cascade documented in
// docs/slices/phase-3/google-sheets-action-metadata-plan.md §4.
import { googleSheetsSpreadsheetsResolver } from "@/integrations/google-sheets/options/spreadsheets";
import { googleSheetsSheetsResolver } from "@/integrations/google-sheets/options/sheets";

// HubSpot resolvers — Slice 3.HUBSPOT-2.
//   - `hubspot:owners` — backs the `hubspot_owner_id` field across 8
//     create/update actions and engagements.
//   - `hubspot:deal_pipelines` → `hubspot:deal_stages` (depends on
//     `pipeline`) — the canonical pipeline → stage cascade for
//     `create_deal` / `update_deal`.
//   - `hubspot:ticket_pipelines` → `hubspot:ticket_stages` (depends on
//     `hs_pipeline`) — same cascade shape against ticket pipelines for
//     `create_ticket` / `update_ticket`.
//   - `hubspot:lists` — backs `listId` on `add_contact_to_list` and
//     `remove_from_list`. Surfaces `processingType` (MANUAL vs
//     DYNAMIC) on the option description so authors don't accidentally
//     target a dynamic list (which the membership APIs reject).
//
// All five core resolvers are read-only against scopes already in the
// 18-scope HubSpot manifest; no reconnect required.
import { hubspotOwnersResolver } from "@/integrations/hubspot/options/owners";
import { hubspotDealPipelinesResolver } from "@/integrations/hubspot/options/dealPipelines";
import { hubspotDealStagesResolver } from "@/integrations/hubspot/options/dealStages";
import { hubspotTicketPipelinesResolver } from "@/integrations/hubspot/options/ticketPipelines";
import { hubspotTicketStagesResolver } from "@/integrations/hubspot/options/ticketStages";
import { hubspotListsResolver } from "@/integrations/hubspot/options/lists";

// Mailchimp resolvers — Slice 3.MAILCHIMP-2.
//   - `mailchimp:audiences` — backs the audience / list picker across
//     the Mailchimp action + trigger surface (account-scoped, no deps).
//   - `mailchimp:campaigns` — backs the `campaignId` picker on
//     `get_campaign` / `get_campaign_stats` actions + `email_opened` /
//     `link_clicked` trigger filters (account-scoped, no deps).
//   - `mailchimp:segments` (depends on `listId`) — backs the
//     `segmentId` picker on `segment_updated` /
//     `subscriber_added_to_segment` triggers. Dep name is `listId`
//     because the two existing consumer trigger schemas both use
//     `listId` as the parent field — see the resolver file's header
//     for the field-name-variance discussion.
//
// Resolvers ship resolver-first ahead of MAILCHIMP-3 / MAILCHIMP-4
// metas. Mailchimp stays OUT of `COVERED_PROVIDERS` until those land.
// All three resolvers are read-only against the single
// `account_access` scope already in the Mailchimp manifest — no
// reconnect required.
import { mailchimpAudiencesResolver } from "@/integrations/mailchimp/options/audiences";
import { mailchimpCampaignsResolver } from "@/integrations/mailchimp/options/campaigns";
import { mailchimpSegmentsResolver } from "@/integrations/mailchimp/options/segments";

/**
 * Hand-maintained options-source resolver registry.
 *
 * Plan reference: docs/slices/phase-3/options-source-plan.md §5.
 *
 * Discipline mirrors `services/discovery/_registry.ts`:
 *   - Explicit imports surface in PRs — adding a resolver means
 *     adding the import + an entry in `ALL_RESOLVERS`.
 *   - Module-load validation:
 *     - Every `source` matches the `<provider>:<resource>` regex.
 *     - Duplicate sources throw at module load with a clear error.
 *   - The exported lookup map is frozen — no runtime mutation.
 *
 * Why hand-maintained rather than glob-style auto-discovery:
 *   - Reviewers scan the diff to see exactly which resolvers a slice
 *     covers; no implicit auto-registration.
 *   - Resolver placement is colocated under each provider tree
 *     (`integrations/<provider>/options/<resource>.ts`) — the central
 *     registry is the audit surface, not the discovery mechanism.
 *
 * Server-only — never imported by client code. The structural test
 * at `tests/structure/client-server-boundary.test.ts` catches any
 * non-type-only import of `@/services/options/...` from
 * `features/` / `components/` / `lib/api/` / `stores/`.
 */

export const ALL_OPTIONS_RESOLVERS: ReadonlyArray<OptionsResolver> = [
  nativeExamplesResolver,
  slackChannelsResolver,
  googleSheetsSpreadsheetsResolver,
  googleSheetsSheetsResolver,
  // HubSpot (Slice 3.HUBSPOT-2). Resolver-first ahead of HubSpot
  // metadata batches (HUBSPOT-3..6); 17 of the 26 HubSpot mutation /
  // read metas consume at least one of these resolvers.
  hubspotOwnersResolver,
  hubspotDealPipelinesResolver,
  hubspotDealStagesResolver,
  hubspotTicketPipelinesResolver,
  hubspotTicketStagesResolver,
  hubspotListsResolver,
  // Mailchimp (Slice 3.MAILCHIMP-2). Resolver-first ahead of
  // MAILCHIMP-3 (12 action metas) + MAILCHIMP-4 (2 campaign-read
  // metas + 7 trigger metas + COVERED_PROVIDERS flip).
  mailchimpAudiencesResolver,
  mailchimpCampaignsResolver,
  mailchimpSegmentsResolver,
];

// Module-load validation. Throws synchronously so any importer of this
// module fails the build with a clear message rather than a runtime
// surprise on the first request.
const resolverBySource: ReadonlyMap<string, OptionsResolver> = (() => {
  const m = new Map<string, OptionsResolver>();
  for (const r of ALL_OPTIONS_RESOLVERS) {
    if (!OPTIONS_SOURCE_KEY_REGEX.test(r.source)) {
      throw new Error(
        `Options resolver source '${r.source}' does not match <provider>:<resource> regex.`,
      );
    }
    const expected = `${r.provider}:`;
    if (!r.source.startsWith(expected)) {
      throw new Error(
        `Options resolver source '${r.source}' does not start with declared provider '${r.provider}'.`,
      );
    }
    if (m.has(r.source)) {
      throw new Error(
        `Duplicate options resolver registered for source '${r.source}'.`,
      );
    }
    m.set(r.source, r);
  }
  return m;
})();

/**
 * Look up a resolver by its `source` key. Returns `undefined` when
 * the source isn't registered — the route maps that to a
 * `SOURCE_NOT_FOUND` response.
 */
export function getOptionsResolver(source: string): OptionsResolver | undefined {
  return resolverBySource.get(source);
}

/**
 * Stable, deterministic list of all registered resolvers, sorted by
 * `source`. Exposed primarily so structural / registry tests can
 * assert coverage shape without relying on an `Object.entries`-style
 * iteration order; also useful when the future admin tooling lists
 * known sources.
 */
export function listOptionsResolvers(): ReadonlyArray<OptionsResolver> {
  return [...resolverBySource.values()].sort((a, b) =>
    a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
  );
}
