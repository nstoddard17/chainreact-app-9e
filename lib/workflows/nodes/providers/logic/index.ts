import {
  GitBranch,
  Clock,
  Repeat,
  GitFork,
  Filter,
  Globe,
  Split,
  Timer,
  Braces
} from "lucide-react"
import { NodeComponent } from "../../types"

export const logicNodes: NodeComponent[] = [
  {
    type: "router",
    title: "Router",
    description: "Route workflow based on conditions - filter or multi-path routing",
    icon: GitFork,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    multipleOutputs: true,
    outputSchema: [
      {
        name: "mode",
        label: "Router Mode",
        type: "string",
        description: "Whether this router is in filter or multi-path mode",
        example: "router"
      },
      {
        name: "pathTaken",
        label: "Path Taken",
        type: "string",
        description: "Which path was taken (Path A, Path B, Else, or 'stopped' if filter mode failed)",
        example: "Path A"
      },
      {
        name: "conditionsMet",
        label: "Conditions Met",
        type: "boolean",
        description: "Whether the conditions were met",
        example: true
      },
      {
        name: "evaluatedPaths",
        label: "Evaluated Paths",
        type: "array",
        description: "All paths that were evaluated (router mode only)",
        example: [{ name: "Path A", conditionsMet: true }, { name: "Path B", conditionsMet: false }]
      },
      {
        name: "reason",
        label: "Stop Reason",
        type: "string",
        description: "Why the workflow was stopped (filter mode only)",
        example: "Status does not equal 'active'"
      }
    ],
    configSchema: [
      {
        name: "mode",
        label: "Router Mode",
        type: "select",
        required: true,
        defaultValue: "router",
        options: [
          { value: "filter", label: "Filter - Continue or stop workflow" },
          { value: "router", label: "Router - Multi-path routing" }
        ],
        description: "Choose whether to filter (single pass/fail) or route to multiple paths",
        tooltip: "Filter mode stops the workflow if conditions aren't met. Router mode creates multiple output paths."
      },
      {
        name: "conditions",
        label: "Conditions",
        type: "custom",
        required: true,
        description: "Define the routing conditions",
        customComponent: "FilterCriteriaBuilder"
      },
      {
        name: "stopMessage",
        label: "Stop Message",
        type: "text",
        placeholder: "Workflow stopped by filter",
        description: "Custom message when workflow is stopped (filter mode only)",
        uiTab: "advanced",
        visibilityCondition: {
          field: "mode",
          operator: "equals",
          value: "filter"
        }
      }
    ],
  },
  {
    type: "http_request",
    title: "HTTP Request",
    description: "Send HTTP requests to any API endpoint with custom headers and body",
    icon: Globe,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "status",
        label: "Status Code",
        type: "number",
        description: "HTTP status code (200, 404, etc.)",
        example: 200
      },
      {
        name: "data",
        label: "Response Data",
        type: "object",
        description: "Response body from the API",
        example: { success: true, message: "Data received" }
      },
      {
        name: "headers",
        label: "Response Headers",
        type: "object",
        description: "Response headers from the API",
        example: { "content-type": "application/json" }
      }
    ],
    configSchema: [
      {
        name: "method",
        label: "Request Method",
        type: "select",
        required: true,
        defaultValue: "POST",
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" }
        ],
        description: "HTTP method to use"
      },
      {
        name: "url",
        label: "URL",
        type: "text",
        required: true,
        placeholder: "https://api.example.com/endpoint",
        description: "The API endpoint URL",
        hasVariablePicker: true
      },
      {
        name: "headers",
        label: "Headers",
        type: "custom",
        description: "HTTP headers to send with the request",
        customComponent: "KeyValuePairs",
        defaultValue: []
      },
      {
        name: "queryParams",
        label: "Query Parameters",
        type: "custom",
        description: "URL query parameters",
        customComponent: "KeyValuePairs",
        defaultValue: [],
        visibilityCondition: {
          field: "method",
          operator: "equals",
          value: "GET"
        }
      },
      {
        name: "body",
        label: "Request Body",
        type: "textarea",
        placeholder: '{\n  "key": "value",\n  "data": "{{variable}}"\n}',
        description: "Request body (JSON format)",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "method",
          operator: "in",
          value: ["POST", "PUT", "PATCH"]
        }
      },
      {
        name: "authType",
        label: "Authentication",
        type: "select",
        defaultValue: "none",
        options: [
          { value: "none", label: "None" },
          { value: "bearer", label: "Bearer Token" },
          { value: "basic", label: "Basic Auth" },
          { value: "apikey", label: "API Key" }
        ],
        description: "Authentication method",
        uiTab: "advanced"
      },
      {
        name: "authToken",
        label: "Token / API Key",
        type: "text",
        placeholder: "sk_live_...",
        description: "Authentication token or API key",
        hasVariablePicker: true,
        uiTab: "advanced",
        visibilityCondition: {
          field: "authType",
          operator: "in",
          value: ["bearer", "apikey"]
        }
      },
      {
        name: "authUsername",
        label: "Username",
        type: "text",
        description: "Basic auth username",
        uiTab: "advanced",
        visibilityCondition: {
          field: "authType",
          operator: "equals",
          value: "basic"
        }
      },
      {
        name: "authPassword",
        label: "Password",
        type: "password",
        description: "Basic auth password",
        uiTab: "advanced",
        visibilityCondition: {
          field: "authType",
          operator: "equals",
          value: "basic"
        }
      },
      {
        name: "timeout",
        label: "Timeout (seconds)",
        type: "number",
        defaultValue: 30,
        placeholder: "30",
        description: "Request timeout in seconds",
        uiTab: "advanced"
      }
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
        description: "How long the workflow paused",
        example: 300
      },
      {
        name: "startTime",
        label: "Pause Started",
        type: "string",
        description: "When the delay began (ISO 8601 format)",
        example: "2024-01-15T10:30:00Z"
      },
      {
        name: "endTime",
        label: "Pause Ended",
        type: "string",
        description: "When the delay completed (ISO 8601 format)",
        example: "2024-01-15T10:35:00Z"
      },
      {
        name: "success",
        label: "Success",
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
    type: "loop",
    title: "Loop",
    description: "Iterate through an array or repeat actions N times",
    icon: Repeat,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "loopMode",
        label: "Loop Mode",
        type: "select",
        required: true,
        defaultValue: "items",
        options: [
          { value: "items", label: "Loop Over Items" },
          { value: "count", label: "Loop N Times" }
        ],
        description: "Choose whether to loop through items or repeat N times",
        tooltip: "Loop Over Items processes each item in an array. Loop N Times repeats an action a specific number of times."
      },
      {
        name: "items",
        label: "Items to Loop Over",
        type: "text",
        required: true,
        placeholder: "{{Previous Node.items}}",
        description: "Array of items to iterate through. Can be from a previous node or a JSON array.",
        supportsAI: true,
        visibilityCondition: {
          field: "loopMode",
          operator: "equals",
          value: "items"
        }
      },
      {
        name: "batchSize",
        label: "Batch Size",
        type: "number",
        required: false,
        defaultValue: 1,
        placeholder: "1",
        description: "Number of items to process in each iteration (default: 1)",
        visibilityCondition: {
          field: "loopMode",
          operator: "equals",
          value: "items"
        }
      },
      {
        name: "count",
        label: "Number of Repetitions",
        type: "number",
        required: true,
        placeholder: "10",
        description: "How many times to repeat the loop (max: 500)",
        visibilityCondition: {
          field: "loopMode",
          operator: "equals",
          value: "count"
        }
      },
      {
        name: "initialValue",
        label: "Initial Value",
        type: "number",
        required: false,
        defaultValue: 1,
        placeholder: "1",
        description: "Starting number for the counter (default: 1)",
        visibilityCondition: {
          field: "loopMode",
          operator: "equals",
          value: "count"
        }
      },
      {
        name: "stepIncrement",
        label: "Step Increment",
        type: "number",
        required: false,
        defaultValue: 1,
        placeholder: "1",
        description: "How much to increase the counter each iteration (default: 1)",
        visibilityCondition: {
          field: "loopMode",
          operator: "equals",
          value: "count"
        }
      }
    ],
    outputSchema: [
      {
        name: "currentItem",
        label: "Current Item",
        type: "object",
        description: "The current item being processed in the loop (items mode only)"
      },
      {
        name: "index",
        label: "Index",
        type: "number",
        description: "Zero-based index of the current item (0, 1, 2, ...)"
      },
      {
        name: "iteration",
        label: "Iteration Number",
        type: "number",
        description: "One-based iteration number (1, 2, 3, ...)"
      },
      {
        name: "counter",
        label: "Counter Value",
        type: "number",
        description: "Current counter value (count mode only)"
      },
      {
        name: "totalItems",
        label: "Total Items",
        type: "number",
        description: "Total number of items in the array (items mode) or total repetitions (count mode)"
      },
      {
        name: "isFirst",
        label: "Is First",
        type: "boolean",
        description: "True if this is the first iteration"
      },
      {
        name: "isLast",
        label: "Is Last",
        type: "boolean",
        description: "True if this is the last iteration"
      },
      {
        name: "batch",
        label: "Current Batch",
        type: "array",
        description: "Array of items in the current batch (items mode with batch size > 1)"
      },
      {
        name: "progressPercentage",
        label: "Progress Percentage",
        type: "number",
        description: "Completion percentage (0-100)"
      },
      {
        name: "remainingItems",
        label: "Remaining Items",
        type: "number",
        description: "Number of items/iterations remaining"
      }
    ]
  },
]