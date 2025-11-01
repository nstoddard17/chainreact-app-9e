import { NodeComponent } from "../../../types"

export const getCampaignActionSchema: NodeComponent = {
  type: "mailchimp_action_get_campaign",
  title: "Get Campaign",
  description: "Retrieve detailed information about a specific email campaign",
  icon: "FileText" as any,
  providerId: "mailchimp",
  category: "Email",
  isTrigger: false,
  configSchema: [
    {
      name: "campaign_id",
      label: "Campaign",
      type: "select",
      required: true,
      dynamic: "mailchimp_campaigns",
      placeholder: "Select a campaign",
      loadOnMount: true,
      description: "Select the campaign to retrieve details for"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Campaign ID",
      type: "string",
      description: "Unique identifier for the campaign"
    },
    {
      name: "type",
      label: "Campaign Type",
      type: "string",
      description: "Type of campaign (regular, plaintext, absplit, rss, variate)"
    },
    {
      name: "status",
      label: "Status",
      type: "string",
      description: "Current status (save, paused, schedule, sending, sent)"
    },
    {
      name: "subjectLine",
      label: "Subject Line",
      type: "string",
      description: "Email subject line"
    },
    {
      name: "previewText",
      label: "Preview Text",
      type: "string",
      description: "Preview text shown in email clients"
    },
    {
      name: "fromName",
      label: "From Name",
      type: "string",
      description: "Sender name"
    },
    {
      name: "replyTo",
      label: "Reply To",
      type: "string",
      description: "Reply-to email address"
    },
    {
      name: "audienceId",
      label: "Audience ID",
      type: "string",
      description: "ID of the audience this campaign targets"
    },
    {
      name: "recipientCount",
      label: "Recipient Count",
      type: "number",
      description: "Number of recipients"
    },
    {
      name: "createTime",
      label: "Created At",
      type: "string",
      description: "ISO timestamp when campaign was created"
    },
    {
      name: "sendTime",
      label: "Send Time",
      type: "string",
      description: "ISO timestamp when campaign was/will be sent"
    },
    {
      name: "webId",
      label: "Web ID",
      type: "number",
      description: "Campaign web ID for URLs"
    },
    {
      name: "archiveUrl",
      label: "Archive URL",
      type: "string",
      description: "Public archive URL for the campaign"
    }
  ]
}
