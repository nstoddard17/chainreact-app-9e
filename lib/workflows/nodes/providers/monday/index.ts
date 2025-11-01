import { CheckSquare, Plus, Edit, MessageSquare } from "lucide-react"
import { NodeComponent } from "../../types"

// Import trigger schemas
import { newItemTriggerSchema } from "./triggers/newItem.schema"
import { columnChangedTriggerSchema } from "./triggers/columnChanged.schema"

// Import action schemas
import { createItemActionSchema } from "./actions/createItem.schema"
import { updateItemActionSchema } from "./actions/updateItem.schema"
import { createUpdateActionSchema } from "./actions/createUpdate.schema"

// Apply icons to triggers
const newItemTrigger: NodeComponent = {
  ...newItemTriggerSchema,
  icon: CheckSquare
}

const columnChangedTrigger: NodeComponent = {
  ...columnChangedTriggerSchema,
  icon: Edit
}

// Apply icons to actions
const createItem: NodeComponent = {
  ...createItemActionSchema,
  icon: Plus
}

const updateItem: NodeComponent = {
  ...updateItemActionSchema,
  icon: Edit
}

const createUpdate: NodeComponent = {
  ...createUpdateActionSchema,
  icon: MessageSquare
}

// Export all Monday.com nodes
export const mondayNodes: NodeComponent[] = [
  newItemTrigger,
  columnChangedTrigger,
  createItem,
  updateItem,
  createUpdate
]

// Export individual nodes for direct access
export {
  newItemTrigger,
  columnChangedTrigger,
  createItem,
  updateItem,
  createUpdate
}
