import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Mailchimp discovery sub-registry — Slice 3.MAILCHIMP-4.
 *
 * Per-provider extraction of the Mailchimp meta imports so the central
 * `services/discovery/_registry.ts` stays under the 400-line lint
 * warning cap. Future providers MAY follow the same pattern — the
 * central registry simply spreads `MAILCHIMP_ACTION_METAS` /
 * `MAILCHIMP_TRIGGER_METAS` into its `ALL_ACTION_META` /
 * `ALL_TRIGGER_META` arrays. Module-load validation
 * (`ActionMetaSchema.parse` + `TriggerMetaSchema.parse` + duplicate-key
 * rejection) still happens centrally — this file is purely an import
 * grouping.
 *
 * **Coverage:** 14 actions (12 from MAILCHIMP-3 + 2 campaign reads
 * from MAILCHIMP-4) + 7 triggers (1 webhook + 6 polling). All 7
 * triggers register their activation hook via `registerActivation(...)`
 * inside their respective `index.ts` files — the
 * trigger-meta-activation-invariant test is satisfied without any
 * `SHARED_INFRA_EXEMPT_KEYS` additions.
 *
 * **Field-name variance is preserved 1:1 with runtime schemas** —
 * 10 actions + 2 triggers use snake_case `audience_id`/`email`;
 * 2 actions + 2 triggers use camelCase `listId`/`emailAddress`/
 * `audienceId`. Drift in either direction fails the meta-coverage
 * structural test.
 */

import { mailchimpAddSubscriberMeta } from "@/integrations/mailchimp/actions/addSubscriber.meta";
import { mailchimpUpdateSubscriberMeta } from "@/integrations/mailchimp/actions/updateSubscriber.meta";
import { mailchimpGetSubscriberMeta } from "@/integrations/mailchimp/actions/getSubscriber.meta";
import { mailchimpGetSubscribersMeta } from "@/integrations/mailchimp/actions/getSubscribers.meta";
import { mailchimpAddTagMeta } from "@/integrations/mailchimp/actions/addTag.meta";
import { mailchimpRemoveTagMeta } from "@/integrations/mailchimp/actions/removeTag.meta";
import { mailchimpCreateAudienceMeta } from "@/integrations/mailchimp/actions/createAudience.meta";
import { mailchimpCreateSegmentMeta } from "@/integrations/mailchimp/actions/createSegment.meta";
import { mailchimpCreateCustomEventMeta } from "@/integrations/mailchimp/actions/createCustomEvent.meta";
import { mailchimpAddNoteMeta } from "@/integrations/mailchimp/actions/addNote.meta";
import { mailchimpUnsubscribeSubscriberMeta } from "@/integrations/mailchimp/actions/unsubscribeSubscriber.meta";
import { mailchimpRemoveSubscriberMeta } from "@/integrations/mailchimp/actions/removeSubscriber.meta";
import { mailchimpGetCampaignMeta } from "@/integrations/mailchimp/actions/getCampaign.meta";
import { mailchimpGetCampaignStatsMeta } from "@/integrations/mailchimp/actions/getCampaignStats.meta";

import { mailchimpAudienceEventTriggerMeta } from "@/integrations/mailchimp/triggers/audienceEvent/audienceEvent.meta";
import { mailchimpCampaignCreatedTriggerMeta } from "@/integrations/mailchimp/triggers/campaignCreated/campaignCreated.meta";
import { mailchimpEmailOpenedTriggerMeta } from "@/integrations/mailchimp/triggers/emailOpened/emailOpened.meta";
import { mailchimpLinkClickedTriggerMeta } from "@/integrations/mailchimp/triggers/linkClicked/linkClicked.meta";
import { mailchimpNewAudienceTriggerMeta } from "@/integrations/mailchimp/triggers/newAudience/newAudience.meta";
import { mailchimpSegmentUpdatedTriggerMeta } from "@/integrations/mailchimp/triggers/segmentUpdated/segmentUpdated.meta";
import { mailchimpSubscriberAddedToSegmentTriggerMeta } from "@/integrations/mailchimp/triggers/subscriberAddedToSegment/subscriberAddedToSegment.meta";

/**
 * Mailchimp action metas in displayOrder (10..140). 12 from MAILCHIMP-3
 * (subscriber writes, reads, tag management, audience+segment creation,
 * events+notes, high-risk consent+removal) + 2 campaign reads from
 * MAILCHIMP-4. `unsubscribe_subscriber` = high + confirm-only;
 * `remove_subscriber` = full destructive trio.
 */
export const MAILCHIMP_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  mailchimpAddSubscriberMeta,
  mailchimpUpdateSubscriberMeta,
  mailchimpGetSubscriberMeta,
  mailchimpGetSubscribersMeta,
  mailchimpAddTagMeta,
  mailchimpRemoveTagMeta,
  mailchimpCreateAudienceMeta,
  mailchimpCreateSegmentMeta,
  mailchimpCreateCustomEventMeta,
  mailchimpAddNoteMeta,
  mailchimpUnsubscribeSubscriberMeta,
  mailchimpRemoveSubscriberMeta,
  mailchimpGetCampaignMeta,
  mailchimpGetCampaignStatsMeta,
];

/**
 * Mailchimp trigger metas in displayOrder (10..70). 1 webhook
 * (`audience_event`) + 6 polling (`campaign_created`, `email_opened`,
 * `link_clicked`, `new_audience`, `segment_updated`,
 * `subscriber_added_to_segment`). Every trigger's `index.ts` registers
 * its activation hook so the activation-invariant test is satisfied
 * without exemptions.
 */
export const MAILCHIMP_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  mailchimpAudienceEventTriggerMeta,
  mailchimpCampaignCreatedTriggerMeta,
  mailchimpEmailOpenedTriggerMeta,
  mailchimpLinkClickedTriggerMeta,
  mailchimpNewAudienceTriggerMeta,
  mailchimpSegmentUpdatedTriggerMeta,
  mailchimpSubscriberAddedToSegmentTriggerMeta,
];
