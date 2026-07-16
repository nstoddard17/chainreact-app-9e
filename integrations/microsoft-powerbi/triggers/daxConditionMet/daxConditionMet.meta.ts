import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:dax_condition_met`.
 *
 * Edge-triggered threshold watch over a scalar DAX measure: fires once when
 * the condition becomes true and re-arms when it goes false again. The
 * scalar reaches downstream nodes as `value` and is marked sensitive — a
 * measure can carry revenue, headcount, or other business-confidential
 * figures.
 */
export const microsoftPowerBiDaxConditionMetTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:dax_condition_met",
  provider: "microsoft-powerbi",
  type: "dax_condition_met",
  displayName: "DAX Condition Met",
  description:
    "Fires when a DAX query's scalar result starts satisfying your condition. Fires once per transition — it re-arms only after the condition stops being true.",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace holding the semantic model.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "semanticModelId",
      label: "Semantic Model",
      description: "The semantic model (dataset) to query.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "daxQuery",
      label: "DAX Query",
      description:
        "Must return a single scalar value — the first column of the first row is compared. Example: EVALUATE ROW(\"Total\", [Total Sales])",
      type: "textarea",
      required: true,
      placeholder: 'EVALUATE ROW("Total", [Total Sales])',
    },
    {
      name: "operator",
      label: "Condition",
      description:
        "How the result is compared to the threshold. Numeric comparison is used when both the result and the threshold are numbers; otherwise only Equals / Not equals work.",
      type: "select",
      required: true,
      options: [
        { value: "gt", label: "Greater than" },
        { value: "gte", label: "Greater than or equal to" },
        { value: "lt", label: "Less than" },
        { value: "lte", label: "Less than or equal to" },
        { value: "eq", label: "Equals" },
        { value: "neq", label: "Not equals" },
      ],
    },
    {
      name: "threshold",
      label: "Threshold",
      description: "The value the query result is compared against.",
      type: "text",
      required: true,
      placeholder: "10000",
    },
    {
      name: "impersonatedUserName",
      label: "Run As (RLS User)",
      description:
        "Evaluate the query as this user (UPN) so row-level security applies. Ignored when the model has no RLS.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "analyst@contoso.com",
    },
  ],
  payloadShape: [
    { name: "workspaceId", type: "string", description: "The workspace that was queried." },
    { name: "semanticModelId", type: "string", description: "The semantic model that was queried." },
    {
      name: "value",
      type: "unknown",
      description: "The scalar the DAX query returned when the condition became true.",
      sensitive: true,
    },
    { name: "operator", type: "string", description: "The comparison that was evaluated." },
    { name: "threshold", type: "string", description: "The threshold the value was compared against." },
    { name: "conditionMet", type: "boolean", description: "Always true — the trigger fires only on the transition into the met state." },
  ],
  displayOrder: 110,
};
