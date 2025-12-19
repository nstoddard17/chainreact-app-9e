import { MessageSquare, List } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Granular Notion Comment Actions
 * Each action is focused on a single comment operation
 */

export const notionCommentActions: NodeComponent[] = [
  // ============= CREATE COMMENT =============
  {
    type: "notion_action_create_comment",
    title: "Create Comment",
    description: "Add a comment to a page, block, or discussion thread",
    icon: MessageSquare,
    providerId: "notion",
    requiredScopes: ["comment.write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace",
        loadOnMount: true
      },
      {
        name: "commentTarget",
        label: "Comment On",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "page", label: "Page (new comment thread)" },
          { value: "block", label: "Block (new comment thread)" },
          { value: "discussion", label: "Discussion (reply to existing thread)" }
        ],
        placeholder: "Select where to add comment",
        description: "Choose whether to start a new comment thread or reply to an existing one",
        dependsOn: "workspace",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      // Page selection for page comments
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "The page to comment on",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        visibilityCondition: { field: "commentTarget", operator: "equals", value: "page" }
      },
      // Block ID for block comments
      {
        name: "blockId",
        label: "Block ID",
        type: "text",
        required: true,
        placeholder: "Enter block ID (e.g., block_abc123...)",
        description: "The ID of the block to comment on. You can get this from the 'List Page Content' action.",
        supportsVariables: true,
        hasConnectButton: true,
        visibilityCondition: { field: "commentTarget", operator: "equals", value: "block" }
      },
      // Discussion ID for thread replies
      {
        name: "discussionId",
        label: "Discussion ID",
        type: "text",
        required: true,
        placeholder: "Enter discussion ID (from previous comment)",
        description: "The ID of the discussion thread to reply to. Get this from a previous comment or the 'List Comments' action.",
        supportsVariables: true,
        hasConnectButton: true,
        visibilityCondition: { field: "commentTarget", operator: "equals", value: "discussion" }
      },
      // Comment content
      {
        name: "commentText",
        label: "Comment Text",
        type: "textarea",
        required: true,
        placeholder: "Enter your comment...",
        rows: 5,
        description: "The text content of your comment",
        supportsVariables: true,
        hasConnectButton: true,
        dependsOn: "commentTarget",
        hidden: {
          $deps: ["commentTarget"],
          $condition: { commentTarget: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "comment_id",
        label: "Comment ID",
        type: "string",
        description: "The unique ID of the created comment"
      },
      {
        name: "discussion_id",
        label: "Discussion ID",
        type: "string",
        description: "The discussion thread ID (for future replies)"
      },
      {
        name: "parent",
        label: "Parent",
        type: "object",
        description: "The parent object (page or block) that was commented on"
      },
      {
        name: "created_time",
        label: "Created Time",
        type: "string",
        description: "When the comment was created"
      },
      {
        name: "created_by",
        label: "Created By",
        type: "object",
        description: "The user who created the comment"
      }
    ]
  },

  // ============= LIST COMMENTS =============
  {
    type: "notion_action_list_comments",
    title: "List Comments",
    description: "Retrieve all comments from a page or block",
    icon: List,
    providerId: "notion",
    requiredScopes: ["comment.read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace",
        loadOnMount: true
      },
      {
        name: "listTarget",
        label: "List Comments From",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "page", label: "Page" },
          { value: "block", label: "Block" }
        ],
        placeholder: "Select source",
        description: "Choose whether to list comments from a page or a specific block",
        dependsOn: "workspace",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      // Page selection for listing
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "The page to retrieve comments from",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        visibilityCondition: { field: "listTarget", operator: "equals", value: "page" }
      },
      // Block ID for listing
      {
        name: "blockId",
        label: "Block ID",
        type: "text",
        required: true,
        placeholder: "Enter block ID",
        description: "The ID of the block to retrieve comments from",
        supportsVariables: true,
        hasConnectButton: true,
        visibilityCondition: { field: "listTarget", operator: "equals", value: "block" }
      },
      // Pagination limit
      {
        name: "pageSize",
        label: "Page Size",
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100,
        placeholder: "100",
        description: "Number of comments to return (max 100)",
        dependsOn: "listTarget",
        hidden: {
          $deps: ["listTarget"],
          $condition: { listTarget: { $exists: false } }
        }
      },
      {
        name: "startCursor",
        label: "Start Cursor (Pagination)",
        type: "text",
        required: false,
        placeholder: "Enter cursor from previous query",
        description: "For pagination - use next_cursor from previous query",
        supportsVariables: true,
        hasConnectButton: true,
        dependsOn: "listTarget",
        hidden: {
          $deps: ["listTarget"],
          $condition: { listTarget: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "comments",
        label: "Comments",
        type: "array",
        description: "Array of comments from the page or block"
      },
      {
        name: "has_more",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more comments to load"
      },
      {
        name: "next_cursor",
        label: "Next Cursor",
        type: "string",
        description: "Cursor for retrieving next page of comments"
      },
      {
        name: "total_count",
        label: "Total Count",
        type: "number",
        description: "Number of comments returned in this page"
      }
    ]
  }
]
