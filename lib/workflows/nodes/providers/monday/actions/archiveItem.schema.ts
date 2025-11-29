import { NodeComponent } from "../../../types"

export const archiveItemActionSchema: NodeComponent = {
  type: "monday_action_archive_item",
  title: "Archive Item",
  description: "Archive an item in a Monday.com board (can be restored later)",
  icon: "Archive" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "itemId",
      label: "Archived Item ID",
      type: "string",
      description: "The ID of the archived item",
      example: "1234567890"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the item",
      example: "9876543210"
    },
    {
      name: "archivedAt",
      label: "Archived At",
      type: "string",
      description: "Timestamp when the item was archived",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the archival was successful",
      example: "true"
    }
  ],
  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select a board...",
      description: "The Monday.com board containing the item to archive"
    },
    {
      name: "itemId",
      label: "Item",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select an item to archive...",
      description: "The item to archive (can be restored later)",
      supportsAI: true
    }
  ],
}
