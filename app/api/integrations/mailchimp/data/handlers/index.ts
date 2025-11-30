/**
 * Mailchimp Data Handlers Export
 */

import { getMailchimpAudiences } from './audiences'
import { getMailchimpMergeFields } from './mergeFields'
import { getMailchimpTags } from './tags'
import { getMailchimpCampaigns } from './campaigns'
import { handleMailchimpSubscribers } from './subscribers'
import { getMailchimpSegments } from './segments'

export const mailchimpHandlers = {
  'mailchimp_audiences': getMailchimpAudiences,
  'mailchimp_merge_fields': getMailchimpMergeFields,
  'mailchimp_tags': getMailchimpTags,
  'mailchimp_campaigns': getMailchimpCampaigns,
  'mailchimp_subscribers': handleMailchimpSubscribers,
  'mailchimp_segments': getMailchimpSegments,
}

export {
  getMailchimpAudiences,
  getMailchimpMergeFields,
  getMailchimpTags,
  getMailchimpCampaigns,
  handleMailchimpSubscribers,
  getMailchimpSegments,
}
