import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `get_board` ActionMeta — Slice 3.MONDAY-6. Pure read.
 */
export const mondayGetBoardMeta: ActionMeta = {
  key: "monday:get_board",
  provider: "monday",
  type: "get_board",
  displayName: "Get Board",
  description: "Fetch a Monday board's metadata plus its columns and groups.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
  ],
  outputs: [
    { name: "boardId", type: "string", description: "Board id." },
    { name: "boardName", type: "string", description: "Board name.", sensitive: true },
    {
      name: "description",
      type: "string",
      description: "Board description.",
      sensitive: true,
    },
    { name: "boardKind", type: "string", description: "public / private / share." },
    { name: "state", type: "string", description: "Board state." },
    { name: "updatedAt", type: "string", description: "Last-update timestamp." },
    { name: "creatorId", type: "string", description: "Creator user id." },
    { name: "creatorName", type: "string", description: "Creator name.", sensitive: true },
    {
      name: "columns",
      type: "array",
      description: "Board columns ({columnId,title,type}).",
      sensitive: true,
    },
    {
      name: "groups",
      type: "array",
      description: "Board groups ({groupId,title,color}).",
      sensitive: true,
    },
    { name: "columnCount", type: "number", description: "Number of columns." },
    { name: "groupCount", type: "number", description: "Number of groups." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 150,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
