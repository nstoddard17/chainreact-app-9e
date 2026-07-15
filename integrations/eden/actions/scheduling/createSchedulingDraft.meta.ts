import type { ActionMeta } from "@/contracts/actionMeta";
import { edenContentFields, edenPostOutputs, edenScheduleField, edenWorkspaceField } from "./_fields";

/** Builder metadata for `eden:create_scheduling_draft` (EDEN-6). Reversible write; not published. */
export const edenCreateSchedulingDraftMeta: ActionMeta = {
  key: "eden:create_scheduling_draft",
  provider: "eden",
  type: "create_scheduling_draft",
  displayName: "Create Scheduling Draft",
  description:
    "Save a social post as a draft in Eden's scheduler. Does not publish or queue — the draft waits for review. Reversible (cancel to delete).",
  category: "scheduling",
  requiresIntegration: true,
  fields: [edenWorkspaceField, edenScheduleField, ...edenContentFields()],
  outputs: edenPostOutputs,
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 40,
  riskLevel: "medium",
  riskDescription: "Writes a draft to your Eden scheduler. Nothing is published until you schedule or publish it.",
};
