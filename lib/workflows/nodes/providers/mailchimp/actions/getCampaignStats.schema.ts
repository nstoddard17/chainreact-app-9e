import { NodeComponent } from "../../../types"

export const getCampaignStatsActionSchema: NodeComponent = {
  type: "mailchimp_action_get_campaign_stats",
  title: "Get Campaign Statistics",
  description: "Retrieve detailed analytics and performance metrics for an email campaign",
  icon: "BarChart" as any,
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
      description: "Select the campaign to get statistics for"
    }
  ],
  outputSchema: [
    {
      name: "opens",
      label: "Total Opens",
      type: "number",
      description: "Total number of times the campaign was opened"
    },
    {
      name: "uniqueOpens",
      label: "Unique Opens",
      type: "number",
      description: "Number of unique recipients who opened the campaign"
    },
    {
      name: "openRate",
      label: "Open Rate",
      type: "number",
      description: "Percentage of recipients who opened the campaign"
    },
    {
      name: "clicks",
      label: "Total Clicks",
      type: "number",
      description: "Total number of clicks on links in the campaign"
    },
    {
      name: "uniqueClicks",
      label: "Unique Clicks",
      type: "number",
      description: "Number of unique recipients who clicked any link"
    },
    {
      name: "clickRate",
      label: "Click Rate",
      type: "number",
      description: "Percentage of recipients who clicked any link"
    },
    {
      name: "unsubscribes",
      label: "Unsubscribes",
      type: "number",
      description: "Number of recipients who unsubscribed"
    },
    {
      name: "bounces",
      label: "Bounces",
      type: "number",
      description: "Total number of bounced emails"
    },
    {
      name: "emailsSent",
      label: "Emails Sent",
      type: "number",
      description: "Total number of emails sent"
    },
    {
      name: "revenue",
      label: "Revenue",
      type: "number",
      description: "Total revenue generated from the campaign (if e-commerce tracking is enabled)"
    }
  ]
}
