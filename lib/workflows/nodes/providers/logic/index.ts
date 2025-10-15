import {
  GitBranch,
  Code,
  Clock,
  Repeat
} from "lucide-react"
import { NodeComponent } from "../../types"

export const logicNodes: NodeComponent[] = [
  {
    type: "if_then_condition",
    title: "If/Then",
    description: "Execute actions only if conditions are met",
    icon: GitBranch,
    category: "Productivity",
    providerId: "logic",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "conditionMet",
        label: "Condition Met",
        type: "boolean",
        description: "Whether the condition evaluated to true or false",
        example: true
      },
      {
        name: "conditionType",
        label: "Condition Type",
        type: "string",
        description: "The type of condition that was evaluated (simple, multiple, or advanced)",
        example: "simple"
      },
      {
        name: "evaluatedExpression",
        label: "Evaluated Expression",
        type: "string",
        description: "The condition expression that was evaluated",
        example: "{{data.status}} === 'active'"
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the condition evaluation was successful",
        example: true
      }
    ],
    configSchema: [
      // Basic fields (always visible)
      {
        name: "field",
        label: "If",
        type: "text",
        required: true,
        placeholder: "Select or type a value",
        description: "Choose what to check",
        hasVariablePicker: true,
        uiTab: "basic"
      },
      {
        name: "operator",
        label: "Is",
        type: "select",
        required: true,
        defaultValue: "equals",
        options: [
          { value: "equals", label: "Equal to" },
          { value: "not_equals", label: "Not equal to" },
          { value: "contains", label: "Contains" },
          { value: "not_contains", label: "Does not contain" },
          { value: "greater_than", label: "Greater than" },
          { value: "less_than", label: "Less than" },
          { value: "is_empty", label: "Empty" },
          { value: "is_not_empty", label: "Not empty" }
        ],
        description: "How to compare",
        uiTab: "basic"
      },
      {
        name: "value",
        label: "Value",
        type: "text",
        placeholder: "Enter value to compare",
        description: "What to compare against",
        hasVariablePicker: true,
        uiTab: "basic",
        visibilityCondition: {
          field: "operator",
          operator: "in",
          value: ["equals", "not_equals", "contains", "not_contains", "greater_than", "less_than"]
        }
      },
      {
        name: "continueOnFalse",
        label: "Continue even if condition is false",
        type: "boolean",
        defaultValue: false,
        description: "By default, workflow stops if condition is false",
        uiTab: "basic"
      },

      // Advanced fields (only shown in advanced tab)
      {
        name: "conditionType",
        label: "Condition Mode",
        type: "select",
        defaultValue: "simple",
        options: [
          { value: "simple", label: "Simple Comparison" },
          { value: "multiple", label: "Multiple Conditions" },
          { value: "advanced", label: "JavaScript Expression" }
        ],
        description: "Choose condition complexity",
        uiTab: "advanced"
      },
      {
        name: "logicOperator",
        label: "Combine Conditions With",
        type: "select",
        defaultValue: "and",
        options: [
          { value: "and", label: "AND (all must be true)" },
          { value: "or", label: "OR (any can be true)" }
        ],
        description: "How to combine multiple conditions",
        uiTab: "advanced",
        visibilityCondition: { field: "conditionType", operator: "equals", value: "multiple" }
      },
      {
        name: "additionalConditions",
        label: "Additional Conditions",
        type: "custom",
        description: "Add more conditions for complex logic",
        uiTab: "advanced",
        visibilityCondition: { field: "conditionType", operator: "equals", value: "multiple" }
      },
      {
        name: "advancedExpression",
        label: "JavaScript Expression",
        type: "textarea",
        placeholder: "// Example:\ndata.score > 80 && data.status === 'active'\n\n// Available variables:\n// data, trigger, previous, nodeOutputs",
        description: "Write custom JavaScript for complex conditions",
        uiTab: "advanced",
        visibilityCondition: { field: "conditionType", operator: "equals", value: "advanced" }
      },
      {
        name: "advancedOperatorOptions",
        label: "Advanced Operator Options",
        type: "select",
        options: [
          { value: "greater_equal", label: "Greater than or equal (≥)" },
          { value: "less_equal", label: "Less than or equal (≤)" },
          { value: "starts_with", label: "Starts with" },
          { value: "ends_with", label: "Ends with" },
          { value: "exists", label: "Exists" },
          { value: "not_exists", label: "Does not exist" }
        ],
        description: "Additional comparison operators",
        uiTab: "advanced",
        visibilityCondition: { field: "conditionType", operator: "equals", value: "simple" }
      }
    ],
  },
  {
    type: "delay",
    title: "Delay",
    description: "Pause the workflow for a specified amount of time",
    icon: Clock,
    category: "Productivity",
    providerId: "logic",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "delayDurationSeconds",
        label: "Delay Duration (seconds)",
        type: "number",
        description: "The total duration of the delay in seconds",
        example: 60
      },
      {
        name: "delayDuration",
        label: "Delay Duration (ms)",
        type: "number",
        description: "The total duration of the delay in milliseconds",
        example: 60000
      },
      {
        name: "delayUnit",
        label: "Time Unit Used",
        type: "string",
        description: "The time unit that was used for the delay",
        example: "minutes"
      },
      {
        name: "startTime",
        label: "Start Time",
        type: "string",
        description: "When the delay started (ISO 8601 format)",
        example: "2024-01-15T10:30:00Z"
      },
      {
        name: "endTime",
        label: "End Time",
        type: "string",
        description: "When the delay ended (ISO 8601 format)",
        example: "2024-01-15T10:31:00Z"
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the delay completed successfully",
        example: true
      }
    ],
    configSchema: [
      { name: "duration", label: "Duration", type: "number", placeholder: "e.g., 5", required: true, description: "How long to pause the workflow" },
      { 
        name: "timeUnit", 
        label: "Time Unit", 
        type: "select", 
        required: true,
        defaultValue: "seconds",
        options: [
          { value: "seconds", label: "Seconds" },
          { value: "minutes", label: "Minutes" },
          { value: "hours", label: "Hours" },
          { value: "days", label: "Days" },
          { value: "weeks", label: "Weeks" },
          { value: "months", label: "Months" }
        ],
        description: "The unit of time for the delay duration" 
      },
    ],
  },
  {
    type: "custom_script",
    title: "Custom Script",
    description: "Run custom Javascript code",
    icon: Code,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { name: "script", label: "JavaScript Code", type: "textarea", placeholder: "return { value: 1 };", description: "Custom JavaScript code to execute (must return an object)" },
    ],
  },
  {
    type: "loop",
    title: "Loop",
    description: "Repeat a set of actions for each item in a list",
    icon: Repeat,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { name: "items", label: "Items to loop over", type: "text", placeholder: "{{data.array}}", description: "Array or list of items to iterate through" },
    ],
  },
]