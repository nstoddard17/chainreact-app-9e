/**
 * Data Flow Context System
 * Manages data flow between workflow nodes and provides variable resolution
 */

import { parseVariableReference, normalizeVariableReference } from './variableReferences'

export interface DataFlowContext {
  // Execution context
  executionId: string
  workflowId: string
  userId: string
  
  // Data storage
  nodeOutputs: Record<string, any> // nodeId -> output data
  variables: Record<string, any> // custom variables set by users
  globalData: Record<string, any> // workflow-level data
  
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
   * Resolve a variable reference (e.g., "{{node1.subject}}" or "{{var.customField}}")
   */
  resolveVariable(reference: string): any {
    console.log(`🔧 DataFlowManager resolving variable: "${reference}"`)
    
    if (!reference || typeof reference !== 'string') {
      return reference
    }

    // Handle human-readable node output references: {{Node Title.Field Label}} or {{Node Title → Field Label}}
    // But skip if it looks like a node ID (node-timestamp-random format)
    const humanReadableMatch = reference.match(/\{\{([^.→]+)(?:\.|\s*→\s*)([^}]+)\}\}/)
    const isNodeId = humanReadableMatch && /^(node|trigger|add-action)-\d+(-[a-z0-9]+)?/.test(humanReadableMatch[1].trim())
    
    if (humanReadableMatch && !isNodeId) {
      const nodeTitle = humanReadableMatch[1].trim()
      const fieldLabel = humanReadableMatch[2].trim()
      
      console.log(`🔍 Human-readable format detected: nodeTitle="${nodeTitle}", fieldLabel="${fieldLabel}"`)
      console.log(`📝 Available node metadata:`, Object.keys(this.context.nodeMetadata).map(id => ({
        id,
        title: this.context.nodeMetadata[id].title,
        type: this.context.nodeMetadata[id].type
      })))
      console.log(`📦 Available node outputs:`, Object.keys(this.context.nodeOutputs).map(id => ({
        id,
        success: this.context.nodeOutputs[id]?.success,
        dataKeys: this.context.nodeOutputs[id]?.data ? Object.keys(this.context.nodeOutputs[id].data) : []
      })))
      
      // Find the node by title using metadata
      const nodeId = Object.keys(this.context.nodeMetadata).find(id => {
        const metadata = this.context.nodeMetadata[id]
        const titleMatch = metadata.title === nodeTitle
        console.log(`🔍 Checking node ${id}: title="${metadata.title}" vs looking for="${nodeTitle}" match=${titleMatch}`)
        return titleMatch
      })
      
      console.log(`🎯 Found nodeId for title "${nodeTitle}": ${nodeId}`)
      
      // If no exact title match, try multiple fallback strategies
      let fallbackNodeId = nodeId
      if (!nodeId) {
        // Strategy 1: Look for AI agent by type
        if (nodeTitle === "AI Agent" || nodeTitle.includes("AI") || nodeTitle.includes("Agent")) {
          fallbackNodeId = Object.keys(this.context.nodeMetadata).find(id => 
            this.context.nodeMetadata[id].type === "ai_agent"
          )
          console.log(`🔄 Fallback 1: Looking for ai_agent type, found: ${fallbackNodeId}`)
        }
        
        // Strategy 2: Look for partial title matches (case-insensitive)
        if (!fallbackNodeId) {
          fallbackNodeId = Object.keys(this.context.nodeMetadata).find(id => {
            const metadata = this.context.nodeMetadata[id]
            return metadata.title.toLowerCase().includes(nodeTitle.toLowerCase()) || 
                   nodeTitle.toLowerCase().includes(metadata.title.toLowerCase())
          })
          console.log(`🔄 Fallback 2: Looking for partial title match, found: ${fallbackNodeId}`)
        }
        
        // Strategy 3: If looking for AI-related fields, find any AI agent node
        if (!fallbackNodeId && (fieldLabel === "AI Agent Output" || fieldLabel === "output")) {
          fallbackNodeId = Object.keys(this.context.nodeMetadata).find(id => 
            this.context.nodeMetadata[id].type === "ai_agent"
          )
          console.log(`🔄 Fallback 3: Looking for any ai_agent for AI output, found: ${fallbackNodeId}`)
        }
      }
      
      if (fallbackNodeId) {
        const output = this.getNodeOutput(fallbackNodeId)
        const metadata = this.context.nodeMetadata[fallbackNodeId]
        
        if (output && output.success && metadata.outputSchema) {
          console.log(`📋 Output schema for ${fallbackNodeId}:`, metadata.outputSchema)
          console.log(`💾 Actual output data:`, output.data)
          
          // Find the field by label in the output schema
          const field = metadata.outputSchema.find(f => {
            const labelMatch = f.label === fieldLabel
            const nameMatch = f.name === fieldLabel
            console.log(`🔍 Checking field: name="${f.name}" label="${f.label}" vs looking for="${fieldLabel}" labelMatch=${labelMatch} nameMatch=${nameMatch}`)
            return labelMatch || nameMatch
          })
          
          console.log(`🎯 Found field for label "${fieldLabel}":`, field)
          
          if (field) {
            // Use the field name to get the actual value
            const result = this.getNestedValue(output.data, field.name)
            console.log(`✅ Resolved value:`, result)
            return result
          } 
            console.log(`⚠️ Field not found in schema, trying fallback approaches...`)
            // Fallback: try to get the value directly if it's a simple structure
            if (output.data && typeof output.data === 'object') {
              // For AI Agent with nested output structure
              if (output.data.output !== undefined && (fieldLabel === "AI Agent Output" || fieldLabel === "output")) {
                console.log(`✅ Found AI Agent output using fallback:`, output.data.output)
                return output.data.output
              }
              // Try direct property access
              const fallbackResult = output.data[fieldLabel] || output.data
              console.log(`✅ Fallback result:`, fallbackResult)
              return fallbackResult
            }
            console.log(`✅ Returning raw output data:`, output.data)
            return output.data
          
        } 
          console.log(`❌ No valid output or metadata found for nodeId: ${fallbackNodeId}`)
        
      }
    }

    // Handle node output references using normalized variable reference parser
    const normalizedReference = normalizeVariableReference(reference)
    const parsedReference = parseVariableReference(normalizedReference)
    if (parsedReference && parsedReference.kind === 'node' && parsedReference.nodeId) {
      const output = this.getNodeOutput(parsedReference.nodeId)
      console.log(`📎 Resolving node output reference: nodeId="${parsedReference.nodeId}", field="${parsedReference.fieldPath.join('.') || '(all)'}"`)
      console.log(`📎 Node output found:`, output ? 'yes' : 'no')
      if (output) {
        console.log(`📎 Output success:`, output.success)
        console.log(`📎 Output data keys:`, output.data ? Object.keys(output.data) : 'no data')
      }

      if (output && output.success) {
        if (parsedReference.fieldPath.length > 0) {
          const fieldValue = this.getNestedValue(output.data, parsedReference.fieldPath.join('.'))
          console.log(`📎 Field value for "${parsedReference.fieldPath.join('.')}":`, fieldValue ? 'found' : 'not found')
          return fieldValue
        }
        return output.data
      }
      if (output) {
        console.log(`📎 Returning null - output not successful`)
      }
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
