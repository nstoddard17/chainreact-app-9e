import { type Workflow, type WorkflowNode } from "@/stores/workflowStore"
import { type NodeComponent } from "@/lib/workflows/nodes"
import { getMissingRequiredFields } from "./fieldVisibility"

import { logger } from '@/lib/utils/logger'

export interface WorkflowValidationResult {
  nodes: WorkflowNode[]
  invalidNodeIds: string[]
}

interface ValidationContext {
  workflow: Workflow
  nodeComponents: NodeComponent[]
}

const findNodeComponent = (components: NodeComponent[], type?: string) =>
  components.find((component) => component.type === type)

const deriveNodeValues = (node: WorkflowNode): Record<string, unknown> => {
  return node.data?.config ?? {}
}

const deriveNodeInfo = (node: WorkflowNode, context: ValidationContext) => {
  const component = findNodeComponent(context.nodeComponents, node.data?.type)

  return {
    type: node.data?.type,
    providerId: node.data?.providerId ?? component?.providerId,
    configSchema: component?.configSchema,
  }
}

const buildValidationState = (missing: string[]) => {
  if (!missing.length) {
    return {
      missingRequired: [],
      isValid: true,
      lastValidatedAt: new Date().toISOString(),
    }
  }

  return {
    missingRequired: missing,
    isValid: false,
    lastValidatedAt: new Date().toISOString(),
  }
}

const applyValidationToNode = (node: WorkflowNode, validationState: any): WorkflowNode => {
  return {
    ...node,
    data: {
      ...node.data,
      validationState,
    },
  }
}

export const validateWorkflowNodes = (
  workflow: Workflow,
  nodeComponents: NodeComponent[],
): WorkflowValidationResult => {
  if (!workflow?.nodes?.length) {
    return { nodes: workflow?.nodes ?? [], invalidNodeIds: [] }
  }

  const context: ValidationContext = {
    workflow,
    nodeComponents,
  }

  // Check if there's an AI Agent-style node in the workflow
  const hasAIAgent = workflow.nodes.some((node) =>
    node.data?.type === 'ai_agent' || node.data?.type === 'ai_message'
  )

  const invalidNodeIds: string[] = []

  const validatedNodes = workflow.nodes.map((node) => {
    const nodeInfo = deriveNodeInfo(node, context)
    const values = deriveNodeValues(node)

    logger.debug(`🔍 [Validation] Validating node: ${node.id} (${node.data?.type})`, {
      hasAIAgent,
      isAIAgent: node.data?.type === 'ai_agent',
      isChainChild: !!node.data?.parentAIAgentId,
      hasConfigSchema: !!nodeInfo.configSchema?.length,
      values
    })

    // Skip validation only for AI Agent nodes themselves
    // Chain children in the main workflow should still be validated!
    if (node.data?.type === 'ai_agent') {
      logger.debug(`🔍 [Validation] Skipping validation for ${node.id} (AI Agent node)`)
      const validationState = buildValidationState([])
      return applyValidationToNode(node, validationState)
    }

    if (!nodeInfo.configSchema?.length) {
      logger.debug(`🔍 [Validation] No config schema for ${node.id}, skipping`)
      const validationState = buildValidationState([])
      return applyValidationToNode(node, validationState)
    }

    let missing = getMissingRequiredFields(nodeInfo, values)
    logger.debug(`🔍 [Validation] Missing fields for ${node.id}:`, missing)

    // If AI Agent is present, check if missing fields are set to AI mode
    if (hasAIAgent && missing.length > 0) {
      const originalMissing = [...missing]
      missing = missing.filter((fieldName) => {
        const fieldValue = values[fieldName]
        // Field is valid if it's set to AI mode
        const hasAIPlaceholder = typeof fieldValue === 'string' && fieldValue.includes('{{AI_FIELD:')
        if (hasAIPlaceholder) {
          logger.debug(`🔍 [Validation] Field ${fieldName} has AI placeholder, considering valid`)
        }
        return !hasAIPlaceholder
      })
      logger.debug(`🔍 [Validation] After AI filter: ${originalMissing.length} -> ${missing.length} missing fields`)
    }

    const validationState = buildValidationState(missing)

    if (!validationState.isValid) {
      logger.debug(`❌ [Validation] Node ${node.id} is INVALID, adding to invalidNodeIds`)
      invalidNodeIds.push(node.id)
    } else {
      logger.debug(`✅ [Validation] Node ${node.id} is valid`)
    }

    return applyValidationToNode(node, validationState)
  })

  return {
    nodes: validatedNodes,
    invalidNodeIds,
  }
}

