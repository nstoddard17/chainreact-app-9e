import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import type { NodeComponent } from "@/lib/workflows/nodes/types"

export interface ActivationSummaryItem {
  nodeId: string
  nodeType: string
  title: string
  description: string
  providerId?: string
  isTrigger: boolean
  category?: string
}

export interface ActivationSummary {
  triggers: ActivationSummaryItem[]
  actions: ActivationSummaryItem[]
  integrations: string[]
  hasWriteActions: boolean
  hasDeleteActions: boolean
}

/**
 * Keywords in node types/titles that indicate destructive or write operations.
 */
const WRITE_KEYWORDS = [
  "send", "create", "post", "update", "add", "set", "upload",
  "reply", "invite", "rename", "move", "copy", "mark",
  "pin", "unpin", "star", "unstar", "schedule",
]

const DELETE_KEYWORDS = [
  "delete", "remove", "archive", "trash", "leave", "kick",
]

function isWriteAction(nodeType: string, title: string): boolean {
  const combined = `${nodeType} ${title}`.toLowerCase()
  return WRITE_KEYWORDS.some((kw) => combined.includes(kw))
}

function isDeleteAction(nodeType: string, title: string): boolean {
  const combined = `${nodeType} ${title}`.toLowerCase()
  return DELETE_KEYWORDS.some((kw) => combined.includes(kw))
}

/**
 * Extracts a human-readable provider name from a providerId.
 * e.g. "google-sheets" → "Google Sheets", "microsoft-teams" → "Microsoft Teams"
 */
function formatProviderName(providerId: string): string {
  return providerId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/** Placeholder node types that should be excluded from summary */
const PLACEHOLDER_TYPES = new Set([
  "addAction",
  "insertAction",
  "chainPlaceholder",
])

/**
 * Generates a structured summary of what a workflow will do when activated.
 * Used by the ActivationReviewDialog to show users what side effects to expect.
 */
export function generateActivationSummary(
  nodes: Array<{
    id: string
    type?: string
    data?: {
      type?: string
      title?: string
      config?: Record<string, any>
      isTrigger?: boolean
      providerId?: string
    }
  }>
): ActivationSummary {
  const triggers: ActivationSummaryItem[] = []
  const actions: ActivationSummaryItem[] = []
  const integrationSet = new Set<string>()
  let hasWriteActions = false
  let hasDeleteActions = false

  for (const node of nodes) {
    const nodeType = node.data?.type || node.type || ""

    if (PLACEHOLDER_TYPES.has(nodeType)) continue

    // Look up node definition in catalog for rich metadata
    const catalogEntry: NodeComponent | undefined = ALL_NODE_COMPONENTS.find(
      (c) => c.type === nodeType
    )

    const title =
      node.data?.title || catalogEntry?.title || nodeType
    const description =
      catalogEntry?.description || ""
    const providerId =
      node.data?.providerId || catalogEntry?.providerId
    const isTrigger =
      node.data?.isTrigger ??
      catalogEntry?.isTrigger ??
      nodeType.includes("trigger")
    const category = catalogEntry?.category

    if (providerId) {
      integrationSet.add(formatProviderName(providerId))
    }

    const item: ActivationSummaryItem = {
      nodeId: node.id,
      nodeType,
      title,
      description,
      providerId,
      isTrigger,
      category,
    }

    if (isTrigger) {
      triggers.push(item)
    } else {
      actions.push(item)

      if (isWriteAction(nodeType, title)) {
        hasWriteActions = true
      }
      if (isDeleteAction(nodeType, title)) {
        hasDeleteActions = true
      }
    }
  }

  return {
    triggers,
    actions,
    integrations: Array.from(integrationSet).sort(),
    hasWriteActions,
    hasDeleteActions,
  }
}
