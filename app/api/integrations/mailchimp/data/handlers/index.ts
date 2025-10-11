/**
 * Mailchimp Data Handlers Export
 */

import { getMailchimpAudiences } from './audiences'
import { getMailchimpMergeFields } from './mergeFields'
import { getMailchimpTags } from './tags'
import { getMailchimpCampaigns } from './campaigns'

export const mailchimpHandlers = {
  'mailchimp_audiences': getMailchimpAudiences,
  'mailchimp_merge_fields': getMailchimpMergeFields,
  'mailchimp_tags': getMailchimpTags,
  'mailchimp_campaigns': getMailchimpCampaigns,
}

export {
  getMailchimpAudiences,
  getMailchimpMergeFields,
  getMailchimpTags,
  getMailchimpCampaigns,
}
