import { NodeComponent } from "../../../types"

const SLACK_CREATE_CHANNEL_METADATA = {
  key: "slack_action_create_channel",
  name: "Create Channel",
  description: "Create a new Slack channel with advanced options"
}

export const createChannelActionSchema: NodeComponent = {
  type: SLACK_CREATE_CHANNEL_METADATA.key,
  title: SLACK_CREATE_CHANNEL_METADATA.name,
  description: SLACK_CREATE_CHANNEL_METADATA.description,
  icon: "Hash" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["groups:write", "users:read"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    {
      name: "workspace",
      label: "Workspace",
      type: "select",
      required: true,
      dynamic: "slack_workspaces",
      description: "Select the Slack workspace."
    },
    {
      name: "template",
      label: "Template",
      type: "combobox",
      required: true,
      defaultValue: "blank",
      options: [
        { value: "blank", label: "Blank Channel" },
        { value: "project-starter-kit", label: "Project Starter Kit" },
        { value: "help-requests-process", label: "Help Requests Process" },
        { value: "time-off-request-process", label: "Time Off Request Process" },
        { value: "employee-benefits-hub", label: "Employee Benefits Hub" },
        { value: "brand-guidelines-hub", label: "Brand Guidelines Hub" },
        { value: "bug-intake-and-triage", label: "Bug Intake And Triage" },
        { value: "sales-enablement-hub", label: "Sales Enablement Hub" },
        { value: "marketing-campaign-starter-kit", label: "Marketing Campaign Starter Kit" },
        { value: "ask-an-expert", label: "Ask An Expert" },
        { value: "event-prep-starter-kit", label: "Event Prep Starter Kit" },
        { value: "external-partner-starter-kit", label: "External Partner Starter Kit" },
        { value: "customer-support", label: "Customer Support" },
        { value: "sales-deal-tracking", label: "Sales Deal Tracking" },
        { value: "one-on-one-coaching", label: "One On One Coaching" },
        { value: "new-hire-onboarding", label: "New Hire Onboarding" },
        { value: "feedback-intake", label: "Feedback Intake" },
        { value: "team-support", label: "Team Support" },
      ],
      description: "Choose a channel template."
    },
    {
      name: "templatePreview",
      label: "Template Preview",
      type: "custom",
      required: false
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "text",
      required: true,
      placeholder: "e.g. plan-budget",
      description: "Enter a channel name (lowercase, no spaces)."
    },
    {
      name: "visibility",
      label: "Visibility",
      type: "select",
      required: true,
      options: [
        { value: "public", label: "Public" },
        { value: "private", label: "Private" }
      ],
      description: "Choose whether the channel is public or private."
    },
    {
      name: "addPeople",
      label: "Add People to Channel",
      type: "combobox",
      required: false,
      dynamic: "slack_users",
      description: "Add people by name or email."
    },
    {
      name: "autoAddNewMembers",
      label: "Auto-add new workspace members",
      type: "boolean",
      required: false,
      description: "When new people join your workspace, automatically add them to this channel. (Admins only)"
    }
  ]
}