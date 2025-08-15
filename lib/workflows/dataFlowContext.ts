/**
 * Data Flow Context System
 * Manages data flow between workflow nodes and provides variable resolution
 */

export interface DataFlowContext {
  // Execution context
  executionId: string
  workflowId: string
  userId: string
  
  // Data storage
  nodeOutputs: Record<string, any> // nodeId -> output data
  variables: Record<string, any>   // custom variables set by users
  globalData: Record<string, any>  // workflow-level data
  
  // Node metadata for variable resolution
  nodeMetadata: Record<string, {
    title: string
    type: string
    outputSchema?: Array<{
      name: string
      label: string
      type: string
    }>
  }>
  
  // Metadata
  executionStartTime: Date
  currentNodeId?: string
  parentNodeId?: string
}

export interface NodeOutput {
  success: boolean
  data: any
  metadata?: {
    timestamp: Date
    nodeType: string
    executionTime: number
    dataSize?: number
  }
}

export class DataFlowManager {
  private context: DataFlowContext

  constructor(executionId: string, workflowId: string, userId: string) {
    this.context = {
      executionId,
      workflowId,
      userId,
      nodeOutputs: {},
      variables: {},
      globalData: {},
      nodeMetadata: {},
      executionStartTime: new Date()
    }
  }

  /**
   * Store node metadata for variable resolution
   */
  setNodeMetadata(nodeId: string, metadata: { title: string, type: string, outputSchema?: any[] }): void {
    this.context.nodeMetadata[nodeId] = metadata
  }

  /**
   * Store output data from a node execution
   */
  setNodeOutput(nodeId: string, output: NodeOutput): void {
    this.context.nodeOutputs[nodeId] = output
  }

  /**
   * Get output data from a specific node
   */
  getNodeOutput(nodeId: string): NodeOutput | null {
    return this.context.nodeOutputs[nodeId] || null
  }

  /**
   * Set a custom variable
   */
  setVariable(name: string, value: any): void {
    this.context.variables[name] = value
  }

  /**
   * Get a custom variable
   */
  getVariable(name: string): any {
    return this.context.variables[name]
  }

  /**
   * Set global workflow data
   */
  setGlobalData(key: string, value: any): void {
    this.context.globalData[key] = value
  }

  /**
   * Get global workflow data
   */
  getGlobalData(key: string): any {
    return this.context.globalData[key]
  }

  /**
   * Set the current node being executed
   */
  setCurrentNode(nodeId: string): void {
    this.context.currentNodeId = nodeId
  }

  /**
   * Resolve a variable reference (e.g., "{{node1.output.subject}}" or "{{var.customField}}")
   */
  resolveVariable(reference: string): any {
    if (!reference || typeof reference !== 'string') {
      return reference
    }

    // Handle human-readable node output references: {{Node Title.Field Label}} or {{Node Title → Field Label}}
    const humanReadableMatch = reference.match(/\{\{([^.→]+)(?:\.|\s*→\s*)([^}]+)\}\}/)
    if (humanReadableMatch) {
      const nodeTitle = humanReadableMatch[1].trim()
      const fieldLabel = humanReadableMatch[2].trim()
      
      // Find the node by title using metadata
      const nodeId = Object.keys(this.context.nodeMetadata).find(id => 
        this.context.nodeMetadata[id].title === nodeTitle
      )
      
      if (nodeId) {
        const output = this.getNodeOutput(nodeId)
        const metadata = this.context.nodeMetadata[nodeId]
        
        if (output && output.success && metadata.outputSchema) {
          // Find the field by label in the output schema
          const field = metadata.outputSchema.find(f => f.label === fieldLabel || f.name === fieldLabel)
          
          if (field) {
            // Use the field name to get the actual value
            return this.getNestedValue(output.data, field.name)
          } else {
            // Fallback: try to get the value directly if it's a simple structure
            if (output.data && typeof output.data === 'object') {
              // For AI Agent with nested output structure
              if (output.data.output !== undefined && (fieldLabel === "AI Agent Output" || fieldLabel === "output")) {
                return output.data.output
              }
              // Try direct property access
              return output.data[fieldLabel] || output.data
            }
            return output.data
          }
        }
      }
    }

    // Handle node output references: {{nodeId.output.field}}
    const nodeOutputMatch = reference.match(/\{\{([^.]+)\.output(?:\.([^}]+))?\}\}/)
    if (nodeOutputMatch) {
      const nodeId = nodeOutputMatch[1]
      const field = nodeOutputMatch[2]
      const output = this.getNodeOutput(nodeId)
      
      if (output && output.success) {
        if (field) {
          return this.getNestedValue(output.data, field)
        }
        return output.data
      }
      return null
    }

    // Handle variable references: {{var.variableName}}
    const varMatch = reference.match(/\{\{var\.([^}]+)\}\}/)
    if (varMatch) {
      const varName = varMatch[1]
      return this.getVariable(varName)
    }

    // Handle global data references: {{global.key}}
    const globalMatch = reference.match(/\{\{global\.([^}]+)\}\}/)
    if (globalMatch) {
      const globalKey = globalMatch[1]
      return this.getGlobalData(globalKey)
    }

    // Handle direct variable references: {{variableName}}
    const directVarMatch = reference.match(/\{\{([^}]+)\}\}/)
    if (directVarMatch) {
      const varName = directVarMatch[1]
      return this.getVariable(varName)
    }

    return reference
  }

  /**
   * Resolve all variable references in an object recursively
   */
  resolveObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.resolveVariable(obj)
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item))
    }
    
    if (obj && typeof obj === 'object') {
      const resolved: any = {}
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveObject(value)
      }
      return resolved
    }
    
    return obj
  }

  /**
   * Get nested value from an object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null
    }, obj)
  }

  /**
   * Get all available variable references for the UI
   */
  getAvailableReferences(): {
    nodeOutputs: Array<{ nodeId: string; fields: string[] }>
    variables: string[]
    globalData: string[]
  } {
    const nodeOutputs = Object.entries(this.context.nodeOutputs).map(([nodeId, output]) => {
      const fields = this.extractFields(output.data)
      return { nodeId, fields }
    })

    const variables = Object.keys(this.context.variables)
    const globalData = Object.keys(this.context.globalData)

    return { nodeOutputs, variables, globalData }
  }

  /**
   * Extract available fields from an object for UI suggestions
   */
  private extractFields(obj: any, prefix = ''): string[] {
    if (!obj || typeof obj !== 'object') {
      return []
    }

    const fields: string[] = []
    
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key
      fields.push(fieldPath)
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        fields.push(...this.extractFields(value, fieldPath))
      }
    }
    
    return fields
  }

  /**
   * Get the current context
   */
  getContext(): DataFlowContext {
    return { ...this.context }
  }

  /**
   * Set the current node being executed
   */
  setCurrentNode(nodeId: string, parentNodeId?: string): void {
    this.context.currentNodeId = nodeId
    this.context.parentNodeId = parentNodeId
  }
}

/**
 * Create a new data flow manager instance
 */
export function createDataFlowManager(executionId: string, workflowId: string, userId: string): DataFlowManager {
  return new DataFlowManager(executionId, workflowId, userId)
} 