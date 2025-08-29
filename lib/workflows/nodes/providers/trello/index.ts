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
      { name: "boardId", label: "Board", type: "select", dynamic: "trello_boards", required: false },
      { name: "listId", label: "List", type: "select", dynamic: "trello_lists", dependsOn: "boardId", required: false }
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
      { name: "boardId", label: "Board", type: "select", dynamic: "trello_boards", required: false },
      { name: "listId", label: "List", type: "select", dynamic: "trello_lists", dependsOn: "boardId", required: false }
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
      { name: "boardId", label: "Board", type: "select", dynamic: "trello_boards", required: false }
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
      { name: "boardId", label: "Board", type: "select", dynamic: "trello_boards", required: false }
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
      { name: "boardId", label: "Board", type: "select", dynamic: "trello_boards", required: false }
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
    description: "Creates a new card on a Trello board.",
    icon: Plus,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello_boards", placeholder: "Select a board" },
      { name: "template", label: "Card Template", type: "select", required: false, dynamic: "trello_card_templates", dependsOn: "boardId", placeholder: "Select a card template (optional)" },
      { name: "listId", label: "List", type: "select", required: true, dynamic: "trello_lists", dependsOn: "boardId", placeholder: "Select a list" },
      { name: "name", label: "Card Name", type: "text", required: true, dependsOn: "boardId", placeholder: "Enter card name" },
      { name: "desc", label: "Description", type: "textarea", required: false, dependsOn: "boardId", placeholder: "Enter card description (optional)" }
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
      { name: "name", label: "Board Name", type: "text", required: true, placeholder: "Enter board name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Board description" },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "private", options: [
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
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello_boards", placeholder: "Select a board" },
      { name: "name", label: "List Name", type: "text", required: true, placeholder: "Enter list name" }
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
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello_boards", placeholder: "Select a board" },
      { name: "cardId", label: "Card", type: "select", required: true, dynamic: "trello_cards", dependsOn: "boardId", placeholder: "Select a card to move" },
      { name: "listId", label: "Target List", type: "select", required: true, dynamic: "trello_lists", dependsOn: "boardId", placeholder: "Select target list" },
      { name: "position", label: "Position", type: "select", required: false, defaultValue: "bottom", options: [
        { value: "top", label: "Top" },
        { value: "bottom", label: "Bottom" }
      ] }
    ]
  },
]