import { NodeComponent } from "../../../types"

export const scheduleCampaignActionSchema: NodeComponent = {
  type: "mailchimp_action_schedule_campaign",
  title: "Schedule Campaign",
  description: "Schedule an email campaign to be sent at a specific date and time",
  icon: "Calendar" as any,
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
      description: "Select the campaign to schedule"
    },
    {
      name: "scheduleType",
      label: "Schedule Type",
      type: "select",
      required: true,
      defaultValue: "absolute",
      options: [
        { value: "absolute", label: "Specific Date & Time" },
        { value: "relative", label: "Relative (in X hours/days)" }
      ]
    },
    {
      name: "scheduleTime",
      label: "Schedule Date & Time",
      type: "datetime-local",
      required: false,
      visibleWhen: { field: "scheduleType", value: "absolute" },
      description: "When to send the campaign (must be at least 15 minutes in the future)"
    },
    {
      name: "relativeAmount",
      label: "Amount",
      type: "number",
      required: false,
      visibleWhen: { field: "scheduleType", value: "relative" },
      placeholder: "e.g., 2",
      description: "Number of hours or days from now"
    },
    {
      name: "relativeUnit",
      label: "Time Unit",
      type: "select",
      required: false,
      visibleWhen: { field: "scheduleType", value: "relative" },
      options: [
        { value: "hours", label: "Hours" },
        { value: "days", label: "Days" }
      ]
    },
    {
      name: "timewarp",
      label: "Enable Timewarp",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Send the campaign based on the recipient's timezone (Pro feature)"
    },
    {
      name: "batchDelivery",
      label: "Enable Batch Delivery",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Send the campaign in batches over time to avoid overwhelming your servers"
    },
    {
      name: "batchCount",
      label: "Number of Batches",
      type: "number",
      required: false,
      visibleWhen: { field: "batchDelivery", value: true },
      placeholder: "e.g., 3",
      description: "Divide the audience into this many batches"
    }
  ],
  outputSchema: [
    {
      name: "scheduledTime",
      label: "Scheduled Time",
      type: "string",
      description: "ISO timestamp when the campaign is scheduled to send"
    },
    {
      name: "campaignId",
      label: "Campaign ID",
      type: "string",
      description: "ID of the scheduled campaign"
    },
    {
      name: "status",
      label: "Campaign Status",
      type: "string",
      description: "Current status of the campaign (should be 'schedule')"
    }
  ]
}
