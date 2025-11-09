import { NodeComponent } from "../../../types"

const SLACK_FIND_MESSAGE_METADATA = {
  key: "slack_action_find_message",
  name: "Find Message",
  description: "Search for messages in Slack using the search API"
}

export const findMessageActionSchema: NodeComponent = {
  type: SLACK_FIND_MESSAGE_METADATA.key,
  title: SLACK_FIND_MESSAGE_METADATA.name,
  description: SLACK_FIND_MESSAGE_METADATA.description,
  icon: "Search" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["search:read"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    {
      name: "query",
      label: "Search Query",
      type: "text",
      required: true,
      placeholder: "deployment in:#general from:@john",
      supportsAI: true,
      tooltip: "The search query. Supports Slack search modifiers like 'in:#channel', 'from:@user', 'has:link', 'after:2024-01-01', etc. See Slack search syntax documentation for advanced options."
    },
    {
      name: "sort",
      label: "Sort By",
      type: "select",
      required: false,
      defaultValue: "score",
      options: [
        { label: "Best Match (Relevance)", value: "score" },
        { label: "Most Recent", value: "timestamp" }
      ],
      tooltip: "How to sort the search results. 'Best Match' uses Slack's relevance algorithm, 'Most Recent' shows newest first."
    },
    {
      name: "sortDirection",
      label: "Sort Direction",
      type: "select",
      required: false,
      defaultValue: "desc",
      options: [
        { label: "Descending (High to Low)", value: "desc" },
        { label: "Ascending (Low to High)", value: "asc" }
      ],
      tooltip: "The direction to sort results. Descending shows highest scores/newest first."
    },
    {
      name: "count",
      label: "Number of Results",
      type: "number",
      required: false,
      defaultValue: 20,
      placeholder: "20",
      tooltip: "The maximum number of messages to return (1-100). Default is 20."
    },
    {
      name: "highlight",
      label: "Highlight Matches",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, wraps matching text in the results with highlighting markers."
    }
  ],
  outputSchema: [
    {
      name: "totalMatches",
      label: "Total Matches",
      type: "number",
      description: "Total number of messages that matched the search",
      example: 156
    },
    {
      name: "messages",
      label: "Messages",
      type: "array",
      description: "Array of matching messages",
      example: []
    },
    {
      name: "query",
      label: "Search Query",
      type: "string",
      description: "The search query that was executed",
      example: "deployment in:#general"
    },
    {
      name: "hasMore",
      label: "Has More Results",
      type: "boolean",
      description: "Whether there are more results beyond the returned count",
      example: true
    }
  ]
}
