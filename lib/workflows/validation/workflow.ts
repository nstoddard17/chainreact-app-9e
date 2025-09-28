import { type Workflow, type WorkflowNode } from "@/stores/workflowStore"
import { type NodeComponent } from "@/lib/workflows/nodes"
import { getMissingRequiredFields } from "./fieldVisibility"

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

  const invalidNodeIds: string[] = []

  const validatedNodes = workflow.nodes.map((node) => {
    const nodeInfo = deriveNodeInfo(node, context)
    const values = deriveNodeValues(node)

    if (!nodeInfo.configSchema?.length) {
      const validationState = buildValidationState([])
      return applyValidationToNode(node, validationState)
    }

    const missing = getMissingRequiredFields(nodeInfo, values)
    const validationState = buildValidationState(missing)

    if (!validationState.isValid) {
      invalidNodeIds.push(node.id)
    }

    return applyValidationToNode(node, validationState)
  })

  return {
    nodes: validatedNodes,
    invalidNodeIds,
  }
}

