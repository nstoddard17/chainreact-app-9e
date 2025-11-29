import { CheckSquare, Plus, Edit, MessageSquare, LayoutGrid, Trash2, Archive, Move, FolderPlus, Search, List, FileUp, Copy, ColumnsIcon, Download, User, Users } from "lucide-react"
import { NodeComponent } from "../../types"

// Import trigger schemas
import { newItemTriggerSchema } from "./triggers/newItem.schema"
import { columnChangedTriggerSchema } from "./triggers/columnChanged.schema"
import { newBoardTriggerSchema } from "./triggers/newBoard.schema"
import { itemMovedTriggerSchema } from "./triggers/itemMoved.schema"
import { newSubitemTriggerSchema } from "./triggers/newSubitem.schema"
import { newUpdateTriggerSchema } from "./triggers/newUpdate.schema"

// Import action schemas
import { createItemActionSchema } from "./actions/createItem.schema"
import { updateItemActionSchema } from "./actions/updateItem.schema"
import { createUpdateActionSchema } from "./actions/createUpdate.schema"
import { createSubitemActionSchema } from "./actions/createSubitem.schema"
import { deleteItemActionSchema } from "./actions/deleteItem.schema"
import { archiveItemActionSchema } from "./actions/archiveItem.schema"
import { moveItemActionSchema } from "./actions/moveItem.schema"
import { createBoardActionSchema } from "./actions/createBoard.schema"
import { createGroupActionSchema } from "./actions/createGroup.schema"
import { getItemActionSchema } from "./actions/getItem.schema"
import { searchItemsActionSchema } from "./actions/searchItems.schema"
import { listItemsActionSchema } from "./actions/listItems.schema"
import { addFileActionSchema } from "./actions/addFile.schema"
import { duplicateItemActionSchema } from "./actions/duplicateItem.schema"
import { duplicateBoardActionSchema } from "./actions/duplicateBoard.schema"
import { addColumnActionSchema } from "./actions/addColumn.schema"
import { listUpdatesActionSchema } from "./actions/listUpdates.schema"
import { downloadFileActionSchema } from "./actions/downloadFile.schema"
import { getUserActionSchema } from "./actions/getUser.schema"
import { listUsersActionSchema } from "./actions/listUsers.schema"
import { listBoardsActionSchema } from "./actions/listBoards.schema"
import { getBoardActionSchema } from "./actions/getBoard.schema"
import { listGroupsActionSchema } from "./actions/listGroups.schema"
import { listSubitemsActionSchema } from "./actions/listSubitems.schema"

// Apply icons to triggers
const newItemTrigger: NodeComponent = {
  ...newItemTriggerSchema,
  icon: CheckSquare
}

const columnChangedTrigger: NodeComponent = {
  ...columnChangedTriggerSchema,
  icon: Edit
}

const newBoardTrigger: NodeComponent = {
  ...newBoardTriggerSchema,
  icon: LayoutGrid
}

const itemMovedTrigger: NodeComponent = {
  ...itemMovedTriggerSchema,
  icon: Move
}

const newSubitemTrigger: NodeComponent = {
  ...newSubitemTriggerSchema,
  icon: Plus
}

const newUpdateTrigger: NodeComponent = {
  ...newUpdateTriggerSchema,
  icon: MessageSquare
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

const createSubitem: NodeComponent = {
  ...createSubitemActionSchema,
  icon: Plus
}

const deleteItem: NodeComponent = {
  ...deleteItemActionSchema,
  icon: Trash2
}

const archiveItem: NodeComponent = {
  ...archiveItemActionSchema,
  icon: Archive
}

const moveItem: NodeComponent = {
  ...moveItemActionSchema,
  icon: Move
}

const createBoard: NodeComponent = {
  ...createBoardActionSchema,
  icon: LayoutGrid
}

const createGroup: NodeComponent = {
  ...createGroupActionSchema,
  icon: FolderPlus
}

const getItem: NodeComponent = {
  ...getItemActionSchema,
  icon: Search
}

const searchItems: NodeComponent = {
  ...searchItemsActionSchema,
  icon: Search
}

const listItems: NodeComponent = {
  ...listItemsActionSchema,
  icon: List
}

const addFile: NodeComponent = {
  ...addFileActionSchema,
  icon: FileUp
}

const duplicateItem: NodeComponent = {
  ...duplicateItemActionSchema,
  icon: Copy
}

const duplicateBoard: NodeComponent = {
  ...duplicateBoardActionSchema,
  icon: Copy
}

const addColumn: NodeComponent = {
  ...addColumnActionSchema,
  icon: ColumnsIcon
}

const listUpdates: NodeComponent = {
  ...listUpdatesActionSchema,
  icon: MessageSquare
}

const downloadFile: NodeComponent = {
  ...downloadFileActionSchema,
  icon: Download
}

const getUser: NodeComponent = {
  ...getUserActionSchema,
  icon: User
}

const listUsers: NodeComponent = {
  ...listUsersActionSchema,
  icon: Users
}

const listBoards: NodeComponent = {
  ...listBoardsActionSchema,
  icon: LayoutGrid
}

const getBoard: NodeComponent = {
  ...getBoardActionSchema,
  icon: LayoutGrid
}

const listGroups: NodeComponent = {
  ...listGroupsActionSchema,
  icon: FolderPlus
}

const listSubitems: NodeComponent = {
  ...listSubitemsActionSchema,
  icon: List
}

// Export all Monday.com nodes
export const mondayNodes: NodeComponent[] = [
  // Triggers
  newItemTrigger,
  columnChangedTrigger,
  newBoardTrigger,
  itemMovedTrigger,
  newSubitemTrigger,
  newUpdateTrigger,
  // Actions - CRUD Operations
  createItem,
  updateItem,
  createUpdate,
  createSubitem,
  deleteItem,
  archiveItem,
  moveItem,
  duplicateItem,
  // Actions - Board & Group Management
  createBoard,
  createGroup,
  duplicateBoard,
  addColumn,
  // Actions - Search & Retrieval
  getItem,
  searchItems,
  listItems,
  listSubitems,
  listUpdates,
  getBoard,
  listBoards,
  listGroups,
  getUser,
  listUsers,
  // Actions - File Operations
  addFile,
  downloadFile
]

// Export individual nodes for direct access
export {
  // Triggers
  newItemTrigger,
  columnChangedTrigger,
  newBoardTrigger,
  itemMovedTrigger,
  newSubitemTrigger,
  newUpdateTrigger,
  // Actions - CRUD Operations
  createItem,
  updateItem,
  createUpdate,
  createSubitem,
  deleteItem,
  archiveItem,
  moveItem,
  duplicateItem,
  // Actions - Board & Group Management
  createBoard,
  createGroup,
  duplicateBoard,
  addColumn,
  // Actions - Search & Retrieval
  getItem,
  searchItems,
  listItems,
  listSubitems,
  listUpdates,
  getBoard,
  listBoards,
  listGroups,
  getUser,
  listUsers,
  // Actions - File Operations
  addFile,
  downloadFile
}
