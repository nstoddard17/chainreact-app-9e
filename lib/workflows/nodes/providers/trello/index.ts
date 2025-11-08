import { Briefcase, MessageSquare, Users, Plus, Layout, List, Move } from "lucide-react"
import { NodeComponent } from "../../types"

export const trelloNodes: NodeComponent[] = [
  {
    type: "trello_trigger_new_card",
    title: "New Card",
    description: "Triggers when a new card is created on a board.",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        dynamic: "trello_boards",
        required: true,
        loadOnMount: true,
        placeholder: "Select a board"
      },
      {
        name: "listId",
        label: "List",
        type: "select",
        dynamic: "trello_lists",
        dependsOn: "boardId",
        required: false,
        placeholder: "Select a list",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } }
      }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board" },
      { name: "listId", label: "List ID", type: "string", description: "The ID of the list" },
      { name: "cardId", label: "Card ID", type: "string", description: "The unique ID of the card" },
      { name: "name", label: "Name", type: "string", description: "The name of the card" },
      { name: "desc", label: "Description", type: "string", description: "The description of the card" },
      { name: "url", label: "URL", type: "string", description: "The URL to the card" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the card was created" }
    ]
  },
  {
    type: "trello_trigger_card_updated",
    title: "Card Updated",
    description: "Triggers when a card's properties change (name, description, due date, labels, members, etc.)",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        dynamic: "trello_boards",
        required: true,
        loadOnMount: true,
        placeholder: "Select a board"
      },
      {
        name: "listId",
        label: "List",
        type: "select",
        dynamic: "trello_lists",
        dependsOn: "boardId",
        required: false,
        placeholder: "Select a list (optional)",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Only trigger for cards in a specific list"
      },
      // API VERIFICATION: Trello webhooks fire for ANY card update, but the webhook
      // payload includes action.data.old object containing ONLY the changed fields.
      // We can implement client-side filtering by checking which keys exist in action.data.old
      // Examples: https://github.com/fiatjaf/trello-webhooks
      // Docs: https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/
      {
        name: "watchedProperties",
        label: "Watch Specific Properties",
        type: "multi-select",
        required: false,
        options: [
          { value: "name", label: "Card Name" },
          { value: "desc", label: "Description" },
          { value: "due", label: "Due Date" },
          { value: "dueComplete", label: "Due Date Completion" },
          { value: "closed", label: "Archive Status" },
          { value: "idList", label: "List" },
          { value: "pos", label: "Position in List" },
          { value: "idLabels", label: "Labels" },
          { value: "idMembers", label: "Members" },
          { value: "idChecklists", label: "Checklists" },
          { value: "cover", label: "Card Cover" }
        ],
        placeholder: "All Properties",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Only trigger when these specific properties change. Leave empty to trigger on any change."
      }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board" },
      { name: "listId", label: "List ID", type: "string", description: "The ID of the list" },
      { name: "cardId", label: "Card ID", type: "string", description: "The unique ID of the card" },
      { name: "name", label: "Card Name", type: "string", description: "The name of the card" },
      { name: "desc", label: "Description", type: "string", description: "The card's description" },
      { name: "changedFields", label: "Changed Fields", type: "array", description: "Array of field names that were changed (from action.data.old keys)" },
      { name: "oldValues", label: "Old Values", type: "object", description: "The previous values of changed fields (from action.data.old)" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the card was updated" }
    ]
  },
  {
    type: "trello_trigger_card_moved",
    title: "Card Moved",
    description: "Triggers when a card is moved between lists or boards",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        dynamic: "trello_boards",
        required: true,
        loadOnMount: true,
        placeholder: "Select a board",
        tooltip: "Select the board to monitor for card moves"
      },
      {
        name: "watchedLists",
        label: "Watch Specific Lists",
        type: "multi-select",
        dynamic: "trello_lists",
        dependsOn: "boardId",
        required: false,
        placeholder: "All lists",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Only trigger when cards move into or out of these lists. Leave empty to monitor all lists."
      }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board" },
      { name: "fromListId", label: "From List ID", type: "string", description: "The ID of the source list" },
      { name: "toListId", label: "To List ID", type: "string", description: "The ID of the destination list" },
      { name: "cardId", label: "Card ID", type: "string", description: "The unique ID of the card" },
      { name: "movedAt", label: "Moved At", type: "string", description: "When the card was moved" }
    ]
  },
  {
    type: "trello_trigger_comment_added",
    title: "Comment Added",
    description: "Triggers when a new comment is added to a card",
    icon: MessageSquare,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        dynamic: "trello_boards",
        required: true,
        loadOnMount: true,
        placeholder: "Select a board",
        tooltip: "Select the board to monitor for comments"
      },
      {
        name: "listId",
        label: "List",
        type: "select",
        dynamic: "trello_lists",
        dependsOn: "boardId",
        required: false,
        placeholder: "Select a list (optional)",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Only trigger for cards in a specific list"
      },
      {
        name: "cardId",
        label: "Card",
        type: "select",
        dynamic: "trello_cards",
        dependsOn: "listId",
        required: false,
        placeholder: "Select a card (optional)",
        hidden: { $condition: { listId: { $exists: false } } },
        tooltip: "Optionally filter to only comments on a specific card"
      }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board" },
      { name: "cardId", label: "Card ID", type: "string", description: "The unique ID of the card" },
      { name: "commentId", label: "Comment ID", type: "string", description: "The unique ID of the comment" },
      { name: "commentText", label: "Comment Text", type: "string", description: "The text of the comment" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the comment author" },
      { name: "authorName", label: "Author Name", type: "string", description: "The name of the comment author" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the comment was created" }
    ]
  },
  {
    type: "trello_trigger_member_changed",
    title: "Card Members Changed",
    description: "Triggers when a member is added to or removed from a card",
    icon: Users,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        dynamic: "trello_boards",
        required: false,
        loadOnMount: true,
        placeholder: "Select a board"
      }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board" },
      { name: "cardId", label: "Card ID", type: "string", description: "The unique ID of the card" },
      { name: "action", label: "Action", type: "string", description: "Whether member was added or removed" },
      { name: "memberId", label: "Member ID", type: "string", description: "The ID of the member" },
      { name: "memberName", label: "Member Name", type: "string", description: "The name of the member" },
      { name: "changedAt", label: "Changed At", type: "string", description: "When the member change occurred" }
    ]
  },
  {
    type: "trello_action_create_card",
    title: "Create Card",
    description: "Creates a new card on a Trello board with full customization options.",
    icon: Plus,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      // Core Configuration - Always visible
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true,
        tooltip: "Select the Trello board where the card will be created"
      },

      // List - Show after board selection
      {
        name: "listId",
        label: "List",
        type: "select",
        required: true,
        dynamic: "trello_lists",
        dependsOn: "boardId",
        placeholder: "Select a list",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Select the list where the card will be created"
      },

      // Copy from existing card (optional template functionality)
      {
        name: "idCardSource",
        label: "Copy from Existing Card (Optional)",
        type: "select",
        required: false,
        dynamic: "trello_all_cards",
        dependsOn: "boardId",
        placeholder: "Select a card to use as a template",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Select an existing card to use as a template. The new card will inherit properties from this card, making it easy to create similar cards with the same structure, members, labels, etc."
      },
      {
        name: "keepFromSource",
        label: "Elements to Copy from Source Card",
        type: "multi-select",
        required: false,
        options: [
          { value: "attachments", label: "Attachments (files and links)" },
          { value: "checklists", label: "Checklists (all lists and items)" },
          { value: "comments", label: "Comments (discussion history)" },
          { value: "due", label: "Due Date (deadline settings)" },
          { value: "labels", label: "Labels (categories and tags)" },
          { value: "members", label: "Members (assigned people)" },
          { value: "stickers", label: "Stickers (fun decorations)" }
        ],
        dependsOn: "idCardSource",
        hidden: { $condition: { idCardSource: { $exists: false } } },
        tooltip: "Choose which elements to copy from the source card. By default, all elements are copied. Use this to selectively copy only what you need - for example, copy just the checklists and labels while assigning different members."
      },

      // Basic Card Information
      {
        name: "name",
        label: "Card Name",
        type: "text",
        required: true,
        placeholder: "Enter card name",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "The title that will appear on the card",
        supportsAI: true
      },
      {
        name: "desc",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Enter card description (supports Markdown)",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Detailed description of the card. Supports Markdown formatting.",
        supportsAI: true
      },

      // Position
      {
        name: "pos",
        label: "Position",
        type: "select",
        required: false,
        defaultValue: "bottom",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        options: [
          { value: "top", label: "Top of list" },
          { value: "bottom", label: "Bottom of list" }
        ],
        tooltip: "Where to place the card in the list"
      },

      // Due Date and Start Date
      {
        name: "due",
        label: "Due Date & Time",
        type: "date",
        required: false,
        placeholder: "Select a due date and time for the card",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "When the card should be completed (date and time)"
      },
      {
        name: "dueComplete",
        label: "Mark Due Date Complete",
        type: "boolean",
        defaultValue: false,
        required: false,
        dependsOn: "due",
        hidden: { $condition: { due: { $exists: false } } },
        tooltip: "Whether to mark the due date as already completed"
      },
      {
        name: "start",
        label: "Start Date & Time",
        type: "date",
        required: false,
        placeholder: "Select a start date and time for the card",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "When work on the card should begin (date and time)"
      },

      // Members and Labels
      {
        name: "idMembers",
        label: "Assign Members",
        type: "multi-select",
        required: false,
        dynamic: "trello_board_members",
        dependsOn: "boardId",
        placeholder: "Select members to assign to this card",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Board members who will be assigned to this card"
      },
      {
        name: "idLabels",
        label: "Labels",
        type: "multi-select",
        required: false,
        dynamic: "trello_board_labels",
        dependsOn: "boardId",
        placeholder: "Select labels to apply",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Labels to categorize and organize the card"
      },

      // Attachment with toggle between upload and URL
      {
        name: "attachment",
        label: "Attachment",
        type: "file-with-toggle",
        required: false,
        placeholder: "Choose a file to attach",
        accept: "*",
        maxSize: 10 * 1024 * 1024, // 10MB limit
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Attach a file to the card. Upload: Choose a file from your computer (max 10MB). URL: Provide a direct link to a file or webpage.",
        toggleOptions: {
          modes: ["upload", "url"],
          labels: {
            upload: "Upload",
            url: "URL"
          },
          placeholders: {
            url: "https://example.com/document.pdf"
          },
          defaultMode: "upload"
        }
      },

      // Location
      {
        name: "address",
        label: "Location Address",
        type: "text",
        required: false,
        placeholder: "123 Main St, City, State",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Physical address associated with the card",
        supportsAI: true
      },
      {
        name: "locationName",
        label: "Location Name",
        type: "text",
        required: false,
        placeholder: "Office Building A",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "Name of the location",
        supportsAI: true
      },
      {
        name: "coordinates",
        label: "GPS Coordinates",
        type: "text",
        required: false,
        placeholder: "latitude,longitude",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        tooltip: "GPS coordinates in format: latitude,longitude",
        supportsAI: true
      }
    ],
    outputSchema: [
      { name: "id", label: "Card ID", type: "string", description: "The unique ID of the created card" },
      { name: "name", label: "Card Name", type: "string", description: "The name of the created card" },
      { name: "url", label: "Card URL", type: "string", description: "Direct URL to view the card" },
      { name: "shortUrl", label: "Short URL", type: "string", description: "Shortened URL to the card" },
      { name: "idList", label: "List ID", type: "string", description: "The ID of the list containing the card" },
      { name: "idBoard", label: "Board ID", type: "string", description: "The ID of the board containing the card" },
      { name: "desc", label: "Description", type: "string", description: "The card's description" },
      { name: "due", label: "Due Date", type: "string", description: "The card's due date if set" },
      { name: "start", label: "Start Date", type: "string", description: "The card's start date if set" },
      { name: "closed", label: "Is Archived", type: "boolean", description: "Whether the card is archived" },
      { name: "idMembers", label: "Member IDs", type: "array", description: "IDs of assigned members" },
      { name: "idLabels", label: "Label IDs", type: "array", description: "IDs of applied labels" },
      { name: "badges", label: "Badges", type: "object", description: "Card badges (attachments, comments, etc.)" },
      { name: "pos", label: "Position", type: "number", description: "The card's position in the list" }
    ]
  },
  {
    type: "trello_action_create_board",
    title: "Create Board",
    description: "Create a new Trello board",
    icon: Layout,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "template",
        label: "Board Template",
        type: "select",
        required: false,
        placeholder: "Select a template (optional)",
        options: [
          { value: "", label: "No Template" },
          { value: "basic", label: "Basic Board (To Do, Doing, Done)" },
          { value: "kanban", label: "Kanban Board (7 lists with sample cards)" },
          { value: "project-management", label: "Project Management (6 lists)" },
          { value: "agile-board", label: "Agile Board (6 lists with sample cards)" },
          { value: "simple-project-board", label: "Simple Project Board (4 lists)" },
          { value: "weekly-planner", label: "Weekly Planner (7 lists)" }
        ],
        helperText: "Select a predefined template with lists and sample cards"
      },
      {
        name: "sourceBoardId",
        label: "Copy from Existing Board (Optional)",
        type: "select",
        required: false,
        dynamic: "trello_boards",
        placeholder: "Select a board to copy",
        helperText: "Copy all lists and cards from an existing board (overrides template if provided)",
        loadOnMount: true
      },
      { name: "name", label: "Board Name", type: "text", required: true, placeholder: "Enter board name", supportsAI: true },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Board description", supportsAI: true },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "workspace", options: [
        { value: "private", label: "Private" },
        { value: "public", label: "Public" },
        { value: "workspace", label: "Workspace" }
      ] }
    ],
    producesOutput: true,
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string", description: "The unique ID of the created board" },
      { name: "name", label: "Board Name", type: "string", description: "The name of the board" },
      { name: "url", label: "Board URL", type: "string", description: "URL to access the board" },
      { name: "shortUrl", label: "Short URL", type: "string", description: "Shortened URL for the board" },
      { name: "description", label: "Description", type: "string", description: "Board description" },
      { name: "visibility", label: "Visibility", type: "string", description: "Board visibility setting" },
      { name: "closed", label: "Is Closed", type: "boolean", description: "Whether the board is closed/archived" }
    ]
  },
  {
    type: "trello_action_create_list",
    title: "Create List",
    description: "Create a new list on a Trello board",
    icon: List,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello_boards", placeholder: "Select a board", loadOnMount: true },
      { name: "name", label: "List Name", type: "text", required: true, placeholder: "Enter list name", hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } }, supportsAI: true },
      {
        name: "position",
        label: "List Position",
        type: "select",
        required: false,
        defaultValue: "bottom",
        options: [
          { value: "top", label: "First (leftmost)" },
          { value: "bottom", label: "Last (rightmost)" },
          { value: "after_first", label: "After first list" },
          { value: "before_last", label: "Before last list" },
          { value: "middle", label: "Middle of board" },
          { value: "custom", label: "Custom position" }
        ],
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
        helperText: "Choose where to place the new list on the board"
      },
      {
        name: "specificPosition",
        label: "Specific Position Number",
        type: "number",
        required: false,
        placeholder: "e.g., 3 for third position",
        hidden: {
          $deps: ["position"],
          $condition: { position: { $ne: "custom" } }
        },
        helperText: "Enter exact position number (1 = first, 2 = second, etc.)"
      }
    ],
    producesOutput: true,
    outputSchema: [
      { name: "listId", label: "List ID", type: "string", description: "The unique ID of the created list" },
      { name: "name", label: "List Name", type: "string", description: "The name of the list" },
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board containing this list" },
      { name: "pos", label: "Position", type: "number", description: "The position of the list on the board" },
      { name: "closed", label: "Is Archived", type: "boolean", description: "Whether the list is archived" }
    ]
  },
  {
    type: "trello_action_move_card",
    title: "Move Card",
    description: "Move a card to a different list",
    icon: Move,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello_boards", placeholder: "Select a board", loadOnMount: true },
      { name: "cardId", label: "Card", type: "select", required: true, dynamic: "trello_cards", dependsOn: "boardId", placeholder: "Select a card to move", hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } } },
      { name: "listId", label: "Target List", type: "select", required: true, dynamic: "trello_lists", dependsOn: "boardId", placeholder: "Select target list", hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } } },
      { name: "position", label: "Position", type: "select", required: false, defaultValue: "bottom", hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } }, options: [
        { value: "top", label: "Top" },
        { value: "bottom", label: "Bottom" }
      ] }
    ],
    producesOutput: true,
    outputSchema: [
      { name: "cardId", label: "Card ID", type: "string", description: "The unique ID of the moved card" },
      { name: "name", label: "Card Name", type: "string", description: "The name of the card" },
      { name: "listId", label: "New List ID", type: "string", description: "The ID of the list the card was moved to" },
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board" },
      { name: "pos", label: "Position", type: "number", description: "The position of the card in the new list" },
      { name: "url", label: "Card URL", type: "string", description: "URL to access the card" }
    ]
  },
  {
    type: "trello_action_get_cards",
    title: "Get Cards",
    description: "Retrieve cards from a Trello board with optional filtering",
    icon: Briefcase,
    providerId: "trello",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true
      },
      {
        name: "listId",
        label: "List (Optional)",
        type: "select",
        required: false,
        dynamic: "trello_lists",
        dependsOn: "boardId",
        placeholder: "Select a list to filter by",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } }
      },
      {
        name: "filter",
        label: "Card Status",
        type: "select",
        required: false,
        defaultValue: "open",
        options: [
          { value: "all", label: "All Cards" },
          { value: "open", label: "Open Cards" },
          { value: "closed", label: "Archived Cards" }
        ],
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } }
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Maximum number of cards to retrieve",
        hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } }
      }
    ],
    outputSchema: [
      { name: "cards", label: "Cards", type: "array", description: "Array of cards from the board" },
      { name: "count", label: "Count", type: "number", description: "Number of cards retrieved" }
    ]
  },
  {
    type: "trello_action_update_card",
    title: "Update Card",
    description: "Update an existing card's properties (name, description, due date, position, etc.)",
    icon: Briefcase,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true,
        tooltip: "Select the board containing the card"
      },
      {
        name: "cardId",
        label: "Card",
        type: "select",
        required: true,
        dynamic: "trello_cards",
        dependsOn: "boardId",
        placeholder: "Select a card to update",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Select the card you want to update"
      },
      {
        name: "name",
        label: "Card Name",
        type: "text",
        required: false,
        placeholder: "Enter new card name (leave empty to keep current)",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Update the card title",
        supportsAI: true
      },
      {
        name: "desc",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Enter new description (leave empty to keep current)",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Update the card description. Supports Markdown.",
        supportsAI: true
      },
      {
        name: "listId",
        label: "Move to List",
        type: "select",
        required: false,
        dynamic: "trello_lists",
        dependsOn: "boardId",
        placeholder: "Select a list (optional)",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Move the card to a different list"
      },
      {
        name: "pos",
        label: "Position in List",
        type: "select",
        required: false,
        options: [
          { value: "top", label: "Top of list" },
          { value: "bottom", label: "Bottom of list" }
        ],
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Change the card's position in the list"
      },
      {
        name: "due",
        label: "Due Date",
        type: "date",
        required: false,
        placeholder: "Select a new due date (optional)",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Update the card's due date"
      },
      {
        name: "dueComplete",
        label: "Mark Due Date Complete",
        type: "boolean",
        defaultValue: false,
        required: false,
        dependsOn: "due",
        hidden: { $condition: { due: { $exists: false } } },
        tooltip: "Mark the due date as completed"
      },
      {
        name: "closed",
        label: "Archive Card",
        type: "boolean",
        defaultValue: false,
        required: false,
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Set to true to archive the card, false to unarchive"
      }
    ],
    outputSchema: [
      { name: "id", label: "Card ID", type: "string", description: "The ID of the updated card" },
      { name: "name", label: "Card Name", type: "string", description: "The updated name of the card" },
      { name: "desc", label: "Description", type: "string", description: "The updated description" },
      { name: "url", label: "Card URL", type: "string", description: "URL to view the card" },
      { name: "idList", label: "List ID", type: "string", description: "The ID of the list containing the card" },
      { name: "due", label: "Due Date", type: "string", description: "The card's due date" },
      { name: "closed", label: "Is Archived", type: "boolean", description: "Whether the card is archived" }
    ]
  },
  {
    type: "trello_action_archive_card",
    title: "Archive Card",
    description: "Archive or unarchive a card on a Trello board",
    icon: Briefcase,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true,
        tooltip: "Select the board containing the card"
      },
      {
        name: "cardId",
        label: "Card",
        type: "select",
        required: true,
        dynamic: "trello_cards",
        dependsOn: "boardId",
        placeholder: "Select a card",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Select the card to archive"
      },
      {
        name: "closed",
        label: "Archive Action",
        type: "select",
        required: true,
        defaultValue: "true",
        options: [
          { value: "true", label: "Archive card" },
          { value: "false", label: "Unarchive card" }
        ],
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Choose whether to archive or unarchive the card"
      }
    ],
    outputSchema: [
      { name: "id", label: "Card ID", type: "string", description: "The ID of the card" },
      { name: "name", label: "Card Name", type: "string", description: "The name of the card" },
      { name: "closed", label: "Is Archived", type: "boolean", description: "Whether the card is archived" },
      { name: "url", label: "Card URL", type: "string", description: "URL to view the card" }
    ]
  },
  {
    type: "trello_action_add_comment",
    title: "Add Comment",
    description: "Add a comment to a Trello card",
    icon: MessageSquare,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true,
        tooltip: "Select the board containing the card"
      },
      {
        name: "cardId",
        label: "Card",
        type: "select",
        required: true,
        dynamic: "trello_cards",
        dependsOn: "boardId",
        placeholder: "Select a card",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Select the card to comment on"
      },
      {
        name: "text",
        label: "Comment Text",
        type: "textarea",
        required: true,
        placeholder: "Enter your comment",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "The text of the comment. Supports Markdown.",
        supportsAI: true
      }
    ],
    outputSchema: [
      { name: "id", label: "Comment ID", type: "string", description: "The ID of the comment" },
      { name: "data", label: "Comment Data", type: "object", description: "Comment data including text" },
      { name: "date", label: "Created At", type: "string", description: "When the comment was created" },
      { name: "memberCreator", label: "Creator", type: "object", description: "Information about who created the comment" }
    ]
  },
  {
    type: "trello_trigger_card_archived",
    title: "Card Archived",
    description: "Triggers when a card is archived or unarchived",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        dynamic: "trello_boards",
        required: false,
        loadOnMount: true,
        placeholder: "Select a board (optional)"
      }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string", description: "The ID of the board" },
      { name: "cardId", label: "Card ID", type: "string", description: "The ID of the card" },
      { name: "name", label: "Card Name", type: "string", description: "The name of the card" },
      { name: "closed", label: "Is Archived", type: "boolean", description: "Whether the card was archived (true) or unarchived (false)" },
      { name: "archivedAt", label: "Archived At", type: "string", description: "When the action occurred" }
    ]
  },
  {
    type: "trello_action_add_label_to_card",
    title: "Add Label to Card",
    description: "Add an existing label to a card",
    icon: Briefcase,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true,
        tooltip: "Select the board containing the card"
      },
      {
        name: "cardId",
        label: "Card",
        type: "select",
        required: true,
        dynamic: "trello_cards",
        dependsOn: "boardId",
        placeholder: "Select a card",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Select the card to add a label to"
      },
      {
        name: "labelId",
        label: "Label",
        type: "select",
        required: true,
        dynamic: "trello_board_labels",
        dependsOn: "boardId",
        placeholder: "Select a label",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Select the label to add to the card"
      }
    ],
    outputSchema: [
      { name: "id", label: "Card ID", type: "string", description: "The ID of the card" },
      { name: "name", label: "Card Name", type: "string", description: "The name of the card" },
      { name: "idLabels", label: "Label IDs", type: "array", description: "Array of all label IDs on the card" },
      { name: "labels", label: "Labels", type: "array", description: "Array of all labels on the card" }
    ]
  },
  {
    type: "trello_action_add_checklist",
    title: "Add Checklist to Card",
    description: "Add a new checklist to a card",
    icon: List,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true,
        tooltip: "Select the board containing the card"
      },
      {
        name: "cardId",
        label: "Card",
        type: "select",
        required: true,
        dynamic: "trello_cards",
        dependsOn: "boardId",
        placeholder: "Select a card",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Select the card to add a checklist to"
      },
      {
        name: "name",
        label: "Checklist Name",
        type: "text",
        required: true,
        placeholder: "Enter checklist name",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Name of the checklist",
        supportsAI: true
      }
    ],
    outputSchema: [
      { name: "id", label: "Checklist ID", type: "string", description: "The ID of the created checklist" },
      { name: "name", label: "Checklist Name", type: "string", description: "The name of the checklist" },
      { name: "idCard", label: "Card ID", type: "string", description: "The ID of the card" },
      { name: "checkItems", label: "Check Items", type: "array", description: "Array of checklist items" }
    ]
  },
  {
    type: "trello_action_create_checklist_item",
    title: "Create Checklist Item",
    description: "Add a new item to a checklist on a card",
    icon: List,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        required: true,
        dynamic: "trello_boards",
        placeholder: "Select a board",
        loadOnMount: true,
        tooltip: "Select the board containing the card"
      },
      {
        name: "cardId",
        label: "Card",
        type: "select",
        required: true,
        dynamic: "trello_cards",
        dependsOn: "boardId",
        placeholder: "Select a card",
        hidden: { $condition: { boardId: { $exists: false } } },
        tooltip: "Select the card containing the checklist"
      },
      {
        name: "checklistId",
        label: "Checklist",
        type: "select",
        required: true,
        dynamic: "trello_card_checklists",
        dependsOn: "cardId",
        placeholder: "Select a checklist",
        hidden: { $condition: { cardId: { $exists: false } } },
        tooltip: "Select the checklist to add an item to"
      },
      {
        name: "name",
        label: "Item Text",
        type: "text",
        required: true,
        placeholder: "Enter checklist item text",
        hidden: { $condition: { checklistId: { $exists: false } } },
        tooltip: "The text of the checklist item",
        supportsAI: true
      },
      {
        name: "checked",
        label: "Mark as Complete",
        type: "boolean",
        defaultValue: false,
        required: false,
        hidden: { $condition: { checklistId: { $exists: false } } },
        tooltip: "Whether to mark this item as complete immediately"
      },
      {
        name: "pos",
        label: "Position",
        type: "select",
        required: false,
        defaultValue: "bottom",
        options: [
          { value: "top", label: "Top of checklist" },
          { value: "bottom", label: "Bottom of checklist" }
        ],
        hidden: { $condition: { checklistId: { $exists: false } } },
        tooltip: "Where to place the item in the checklist"
      }
    ],
    outputSchema: [
      { name: "id", label: "Item ID", type: "string", description: "The ID of the checklist item" },
      { name: "name", label: "Item Text", type: "string", description: "The text of the item" },
      { name: "state", label: "State", type: "string", description: "Complete or incomplete" },
      { name: "idChecklist", label: "Checklist ID", type: "string", description: "The ID of the checklist" },
      { name: "pos", label: "Position", type: "number", description: "The position in the checklist" }
    ]
  },
]
