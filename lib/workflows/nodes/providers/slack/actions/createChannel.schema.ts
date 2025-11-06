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
      defaultValue: "public",
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
    },
    {
      name: "channelTopic",
      label: "Channel Topic",
      type: "text",
      required: false,
      placeholder: "Enter a topic for the channel",
      description: "Set the channel's topic/description",
      showIf: (values: any) => values.template !== 'blank'
    },
    {
      name: "initialMessage",
      label: "Initial Welcome Message",
      type: "textarea",
      required: false,
      rows: 4,
      placeholder: "Welcome to the channel! Here's what this space is for...",
      description: "The first message posted when the channel is created",
      showIf: (values: any) => values.template !== 'blank'
    },
    {
      name: "pinnedMessages",
      label: "Pinned Messages",
      type: "array",
      required: false,
      description: "Messages to pin in the channel",
      showIf: (values: any) => values.template !== 'blank',
      fields: [
        {
          name: "content",
          label: "Message Content",
          type: "textarea",
          required: true,
          placeholder: "Enter message to be pinned"
        }
      ]
    },
    {
      name: "bugReportTemplate",
      label: "Bug Report Template",
      type: "textarea",
      required: false,
      rows: 10,
      placeholder: "**Bug Description:**\n\n**Steps to Reproduce:**\n1.\n2.\n3.\n\n**Expected Behavior:**\n\n**Actual Behavior:**\n\n**Priority:** High/Medium/Low",
      description: "Template for bug reports (customize as needed)",
      showIf: (values: any) => values.template === 'bug-intake-and-triage'
    },
    {
      name: "projectSections",
      label: "Project Sections",
      type: "array",
      required: false,
      description: "Define project sections and their initial messages",
      showIf: (values: any) => values.template === 'project-starter-kit',
      fields: [
        {
          name: "title",
          label: "Section Title",
          type: "text",
          required: true,
          placeholder: "e.g., Project Goals"
        },
        {
          name: "content",
          label: "Section Content",
          type: "textarea",
          required: true,
          placeholder: "Enter the content for this section"
        }
      ]
    },
    {
      name: "helpCategories",
      label: "Help Request Categories",
      type: "array",
      required: false,
      description: "Define categories for help requests",
      showIf: (values: any) => values.template === 'help-requests-process',
      fields: [
        {
          name: "category",
          label: "Category",
          type: "text",
          required: true,
          placeholder: "e.g., Technical Support"
        },
        {
          name: "description",
          label: "Description",
          type: "text",
          required: false,
          placeholder: "Brief description of this category"
        }
      ]
    },
    {
      name: "timeOffRequestForm",
      label: "Time Off Request Form",
      type: "textarea",
      required: false,
      rows: 8,
      placeholder: "**Employee Name:**\n**Department:**\n**Request Type:** (Vacation/Sick/Personal)\n**Start Date:**\n**End Date:**\n**Reason:**\n**Coverage Plan:**",
      description: "Template for time off requests",
      showIf: (values: any) => values.template === 'time-off-request-process'
    },
    {
      name: "benefitsInfo",
      label: "Benefits Information",
      type: "textarea",
      required: false,
      rows: 6,
      placeholder: "Enter information about employee benefits...",
      description: "Information to share about employee benefits",
      showIf: (values: any) => values.template === 'employee-benefits-hub'
    },
    {
      name: "brandGuidelines",
      label: "Brand Guidelines",
      type: "textarea",
      required: false,
      rows: 6,
      placeholder: "**Colors:**\n**Fonts:**\n**Logo Usage:**\n**Tone of Voice:**",
      description: "Brand guidelines to share in the channel",
      showIf: (values: any) => values.template === 'brand-guidelines-hub'
    },
    {
      name: "salesStages",
      label: "Sales Pipeline Stages",
      type: "array",
      required: false,
      description: "Define your sales pipeline stages",
      showIf: (values: any) => values.template === 'sales-deal-tracking' || values.template === 'sales-enablement-hub',
      fields: [
        {
          name: "stage",
          label: "Stage Name",
          type: "text",
          required: true,
          placeholder: "e.g., Prospecting"
        },
        {
          name: "description",
          label: "Stage Description",
          type: "text",
          required: false,
          placeholder: "What happens in this stage"
        }
      ]
    },
    {
      name: "marketingCampaignTemplate",
      label: "Campaign Planning Template",
      type: "textarea",
      required: false,
      rows: 8,
      placeholder: "**Campaign Name:**\n**Objective:**\n**Target Audience:**\n**Channels:**\n**Timeline:**\n**Budget:**\n**Success Metrics:**",
      description: "Template for marketing campaign planning",
      showIf: (values: any) => values.template === 'marketing-campaign-starter-kit'
    },
    {
      name: "expertCategories",
      label: "Expert Categories",
      type: "array",
      required: false,
      description: "Define areas of expertise",
      showIf: (values: any) => values.template === 'ask-an-expert',
      fields: [
        {
          name: "expertise",
          label: "Area of Expertise",
          type: "text",
          required: true,
          placeholder: "e.g., Backend Development"
        },
        {
          name: "experts",
          label: "Expert Names",
          type: "text",
          required: false,
          placeholder: "Comma-separated list of experts"
        }
      ]
    },
    {
      name: "eventChecklist",
      label: "Event Planning Checklist",
      type: "array",
      required: false,
      description: "Checklist items for event planning",
      showIf: (values: any) => values.template === 'event-prep-starter-kit',
      fields: [
        {
          name: "task",
          label: "Task",
          type: "text",
          required: true,
          placeholder: "e.g., Book venue"
        },
        {
          name: "dueDate",
          label: "Due Date",
          type: "text",
          required: false,
          placeholder: "e.g., 2 weeks before event"
        }
      ]
    },
    {
      name: "partnerInfo",
      label: "Partner Information Template",
      type: "textarea",
      required: false,
      rows: 7,
      placeholder: "**Partner Name:**\n**Contact Person:**\n**Email:**\n**Phone:**\n**Partnership Type:**\n**Key Deliverables:**",
      description: "Template for partner information",
      showIf: (values: any) => values.template === 'external-partner-starter-kit'
    },
    {
      name: "supportCategories",
      label: "Support Categories",
      type: "array",
      required: false,
      description: "Define customer support categories",
      showIf: (values: any) => values.template === 'customer-support' || values.template === 'team-support',
      fields: [
        {
          name: "category",
          label: "Category",
          type: "text",
          required: true,
          placeholder: "e.g., Billing Issues"
        },
        {
          name: "responseTime",
          label: "Expected Response Time",
          type: "text",
          required: false,
          placeholder: "e.g., Within 2 hours"
        }
      ]
    },
    {
      name: "coachingTemplate",
      label: "Coaching Session Template",
      type: "textarea",
      required: false,
      rows: 7,
      placeholder: "**Date:**\n**Participant:**\n**Goals for Session:**\n**Topics Discussed:**\n**Action Items:**\n**Next Session Date:**",
      description: "Template for one-on-one coaching sessions",
      showIf: (values: any) => values.template === 'one-on-one-coaching'
    },
    {
      name: "onboardingChecklist",
      label: "Onboarding Checklist",
      type: "array",
      required: false,
      description: "Tasks for new hire onboarding",
      showIf: (values: any) => values.template === 'new-hire-onboarding',
      fields: [
        {
          name: "task",
          label: "Task",
          type: "text",
          required: true,
          placeholder: "e.g., Complete HR paperwork"
        },
        {
          name: "owner",
          label: "Responsible Person",
          type: "text",
          required: false,
          placeholder: "Who handles this task"
        },
        {
          name: "day",
          label: "Day",
          type: "text",
          required: false,
          placeholder: "e.g., Day 1"
        }
      ]
    },
    {
      name: "feedbackTemplate",
      label: "Feedback Form Template",
      type: "textarea",
      required: false,
      rows: 5,
      placeholder: "**Feedback Type:** (Bug/Feature Request/General)\n**Description:**\n**Impact:**\n**Suggested Solution:**",
      description: "Template for collecting feedback",
      showIf: (values: any) => values.template === 'feedback-intake'
    },
    {
      name: "autoPostSchedule",
      label: "Automated Posts",
      type: "array",
      required: false,
      description: "Schedule recurring messages (e.g., weekly reminders)",
      showIf: (values: any) => values.template !== 'blank',
      fields: [
        {
          name: "message",
          label: "Message",
          type: "textarea",
          required: true,
          placeholder: "Message to post"
        },
        {
          name: "frequency",
          label: "Frequency",
          type: "select",
          required: true,
          options: [
            { value: "once", label: "Once (on creation)" },
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" }
          ]
        }
      ]
    }
  ],
  outputSchema: [
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The unique ID of the created channel",
      example: "C1234567890"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the created channel",
      example: "plan-budget"
    },
    {
      name: "isPrivate",
      label: "Is Private",
      type: "boolean",
      description: "Whether the channel is private",
      example: false
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "When the channel was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "creator",
      label: "Creator ID",
      type: "string",
      description: "The user ID of the channel creator",
      example: "U1234567890"
    }
  ]
}