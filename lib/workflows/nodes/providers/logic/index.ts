import { 
  Filter, 
  GitBranch, 
  Code,
  Clock,
  Repeat
} from "lucide-react"
import { NodeComponent } from "../../types"

export const logicNodes: NodeComponent[] = [
  {
    type: "filter",
    title: "Filter",
    description: "Filter data based on conditions",
    icon: Filter,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    configSchema: [
      { name: "condition", label: "Condition", type: "textarea", placeholder: "e.g., {{data.value}} > 100", description: "JavaScript expression to evaluate as filter condition" },
    ],
  },
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
      {
        name: "conditionType",
        label: "Condition Type",
        type: "select",
        required: true,
        defaultValue: "simple",
        options: [
          { value: "simple", label: "Simple Comparison" },
          { value: "multiple", label: "Multiple Conditions" },
          { value: "advanced", label: "Advanced Expression" }
        ],
        description: "Choose how to define your condition"
      },
      {
        name: "field",
        label: "Field to Check",
        type: "text",
        required: true,
        placeholder: "e.g., {{data.status}}, {{trigger.email}}, {{previous.result}}",
        description: "The field or variable to evaluate"
      },
      {
        name: "operator",
        label: "Operator",
        type: "select",
        required: true,
        options: [
          { value: "equals", label: "Equals (=)" },
          { value: "not_equals", label: "Not Equals (≠)" },
          { value: "greater_than", label: "Greater Than (>)" },
          { value: "less_than", label: "Less Than (<)" },
          { value: "greater_equal", label: "Greater Than or Equal (≥)" },
          { value: "less_equal", label: "Less Than or Equal (≤)" },
          { value: "contains", label: "Contains" },
          { value: "not_contains", label: "Does Not Contain" },
          { value: "starts_with", label: "Starts With" },
          { value: "ends_with", label: "Ends With" },
          { value: "is_empty", label: "Is Empty" },
          { value: "is_not_empty", label: "Is Not Empty" },
          { value: "exists", label: "Exists" },
          { value: "not_exists", label: "Does Not Exist" }
        ],
        description: "How to compare the field"
      },
      {
        name: "value",
        label: "Value to Compare",
        type: "text",
        placeholder: "e.g., 'approved', 100, {{data.threshold}}",
        description: "The value to compare against (leave empty for existence checks)"
      },
      {
        name: "logicOperator",
        label: "Logic Operator",
        type: "select",
        defaultValue: "and",
        options: [
          { value: "and", label: "AND (all conditions must be true)" },
          { value: "or", label: "OR (any condition can be true)" }
        ],
        description: "How to combine multiple conditions"
      },
      {
        name: "additionalConditions",
        label: "Additional Conditions",
        type: "custom",
        description: "Add more conditions for complex logic"
      },
      {
        name: "advancedExpression",
        label: "Advanced Expression",
        type: "textarea",
        placeholder: "e.g., {{data.score}} > 80 && {{data.status}} === 'active'",
        description: "Write a custom JavaScript expression for complex conditions"
      },
      {
        name: "continueOnFalse",
        label: "Continue Workflow if False",
        type: "boolean",
        defaultValue: false,
        description: "If unchecked, workflow stops when condition is false"
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
        name: "delayDuration",
        label: "Delay Duration",
        type: "number",
        description: "The duration of the delay in seconds",
        example: 60
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
      { name: "duration", label: "Duration (seconds)", type: "number", placeholder: "e.g., 60", description: "How long to pause the workflow in seconds" },
    ],
  },
  {
    type: "conditional",
    title: "Conditional Logic",
    description: "Branch workflow based on conditions",
    icon: GitBranch,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    configSchema: [
      { name: "condition", label: "Condition", type: "textarea", placeholder: "e.g., {{data.status}} === 'success'", description: "JavaScript expression to determine workflow branching" },
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
    configSchema: [
      { name: "items", label: "Items to loop over", type: "text", placeholder: "{{data.array}}", description: "Array or list of items to iterate through" },
    ],
  },
]