import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `list_groups` ActionMeta — Slice 3.MONDAY-6. Pure read.
 */
export const mondayListGroupsMeta: ActionMeta = {
  key: "monday:list_groups",
  provider: "monday",
  type: "list_groups",
  displayName: "List Groups",
  description: "List the groups on a Monday board (with color, position, archived status).",
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
    { name: "boardId", type: "string", description: "Board id (echo)." },
    {
      name: "groups",
      type: "array",
      description: "Groups ({groupId,title,color,position,archived}).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of groups." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 190,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
