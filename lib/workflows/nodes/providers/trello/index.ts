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
    description: "Triggers when a card's properties change (name, desc, due, fields, labels, etc.)",
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
      { name: "changedFields", label: "Changed Fields", type: "object", description: "The fields that were changed" },
      { name: "previousValues", label: "Previous Values", type: "object", description: "The previous values of changed fields" },
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
        required: false,
        loadOnMount: true,
        placeholder: "Select a board"
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
        required: false,
        loadOnMount: true,
        placeholder: "Select a board"
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
        hidden: { $deps: ["boardId", "idCardSource"], $condition: { $or: [{ boardId: { $exists: false } }, { idCardSource: { $exists: false } }] } },
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
        type: "datetime",
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
        hidden: { $deps: ["boardId", "due"], $condition: { $or: [{ boardId: { $exists: false } }, { due: { $exists: false } }] } },
        tooltip: "Whether to mark the due date as already completed"
      },
      {
        name: "start",
        label: "Start Date & Time",
        type: "datetime",
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
]
