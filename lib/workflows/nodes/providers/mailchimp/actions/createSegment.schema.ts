import { NodeComponent } from "../../../types"

export const createSegmentActionSchema: NodeComponent = {
  type: "mailchimp_action_create_segment",
  title: "Create Segment",
  description: "Create a new audience segment for targeted campaigns based on conditions or static member list",
  icon: "Filter" as any,
  providerId: "mailchimp",
  category: "Email",
  isTrigger: false,
  configSchema: [
    {
      name: "audience_id",
      label: "Audience",
      type: "select",
      required: true,
      dynamic: "mailchimp_audiences",
      placeholder: "Select an audience",
      loadOnMount: true
    },
    {
      name: "name",
      label: "Segment Name",
      type: "text",
      required: true,
      placeholder: "e.g., High-Value Customers, New York Subscribers",
      supportsAI: true,
      description: "Name for this segment"
    },
    {
      name: "segmentType",
      label: "Segment Type",
      type: "select",
      required: true,
      defaultValue: "static",
      options: [
        { value: "static", label: "Static (Specific Members)" },
        { value: "saved", label: "Saved (Condition-Based)" }
      ],
      description: "Static segments contain specific members, saved segments auto-update based on conditions"
    },
    {
      name: "members",
      label: "Member Emails (Static Segment)",
      type: "textarea",
      required: false,
      visibleWhen: { field: "segmentType", value: "static" },
      placeholder: "email1@example.com\nemail2@example.com\nemail3@example.com",
      supportsAI: true,
      description: "One email per line for members to include in this static segment"
    },
    {
      name: "conditionType",
      label: "Condition Type (Saved Segment)",
      type: "select",
      required: false,
      visibleWhen: { field: "segmentType", value: "saved" },
      options: [
        { value: "EmailAddress", label: "Email Address" },
        { value: "Date", label: "Date Added/Last Changed" },
        { value: "Campaign", label: "Campaign Activity" },
        { value: "Automation", label: "Automation Activity" },
        { value: "StaticSegment", label: "Member of Static Segment" },
        { value: "Language", label: "Language" },
        { value: "Tags", label: "Tags" }
      ],
      description: "Type of condition to filter subscribers"
    },
    {
      name: "conditionOperator",
      label: "Operator",
      type: "select",
      required: false,
      visibleWhen: { field: "segmentType", value: "saved" },
      options: [
        { value: "is", label: "Is" },
        { value: "not", label: "Is Not" },
        { value: "contains", label: "Contains" },
        { value: "notcontain", label: "Does Not Contain" },
        { value: "starts", label: "Starts With" },
        { value: "ends", label: "Ends With" },
        { value: "greater", label: "Greater Than" },
        { value: "less", label: "Less Than" }
      ],
      description: "How to compare the condition"
    },
    {
      name: "conditionValue",
      label: "Condition Value",
      type: "text",
      required: false,
      visibleWhen: { field: "segmentType", value: "saved" },
      placeholder: "e.g., @gmail.com, 2024-01-01, campaign_id",
      supportsAI: true,
      description: "Value to match against"
    }
  ],
  outputSchema: [
    {
      name: "segmentId",
      label: "Segment ID",
      type: "number",
      description: "Unique identifier for the created segment"
    },
    {
      name: "name",
      label: "Segment Name",
      type: "string",
      description: "Name of the created segment"
    },
    {
      name: "memberCount",
      label: "Member Count",
      type: "number",
      description: "Number of members in the segment"
    },
    {
      name: "type",
      label: "Segment Type",
      type: "string",
      description: "Type of segment (static or saved)"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "ISO timestamp when segment was created"
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "ISO timestamp when segment was last updated"
    }
  ]
}
