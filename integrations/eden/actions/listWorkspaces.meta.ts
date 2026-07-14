import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_workspaces` (EDEN-4). Read action, no inputs. */
export const edenListWorkspacesMeta: ActionMeta = {
  key: "eden:list_workspaces",
  provider: "eden",
  type: "list_workspaces",
  displayName: "List Workspaces",
  description: "List the Eden workspaces your connected account can access.",
  category: "data",
  requiresIntegration: true,
  fields: [],
  outputs: [
    {
      name: "workspaces",
      type: "array",
      description: "Workspaces the account can access. Each item: { id, name, slug, role }.",
    },
    { name: "defaultWorkspaceId", type: "string", description: "The account's default workspace id, or null.", nullable: true },
    { name: "count", type: "number", description: "Number of workspaces returned." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "low",
};
