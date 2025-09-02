/**
 * AI Field Resolver for Workflow Execution
 * 
 * Resolves AI-controlled fields and variables during workflow execution
 */

import { 
  isAIControlledField, 
  parseAIFieldMarker,
  generateAIFieldValue,
  resolveAIVariables,
  processAIFields,
  AIVariableContext,
  AIFieldConfig
} from '../aiFieldAutomation'

interface WorkflowExecutionContext {
  workflowId: string
  executionId: string
  userId: string
  triggerData?: any
  previousResults: Record<string, any>
  currentNode: {
    id: string
    type: string
    config: Record<string, any>
  }
  userApiKey?: string
}

/**
 * Resolves all AI fields and variables in node configuration before execution
 */
export async function resolveNodeAIFields(
  context: WorkflowExecutionContext
): Promise<Record<string, any>> {
  const { currentNode, triggerData, previousResults, userId, userApiKey } = context
  
  // Build AI context from workflow execution
  const aiContext: AIVariableContext = {
    triggerData,
    previousResults,
    currentNodeData: currentNode.config,
    workflowMetadata: {
      workflowId: context.workflowId,
      executionId: context.executionId,
      nodeId: currentNode.id,
      nodeType: currentNode.type
    },
    userProfile: {
      userId
    }
  }

  // Process each field in the configuration
  const resolvedConfig: Record<string, any> = {}
  
  for (const [fieldName, fieldValue] of Object.entries(currentNode.config)) {
    try {
      // Check if field is AI-controlled
      if (isAIControlledField(fieldValue)) {
        console.log(`[AI Field] Resolving AI field: ${fieldName}`)
        
        const { fieldName: targetField, instructions } = parseAIFieldMarker(fieldValue)
        
        // Get field schema from node type (you'd need to implement this lookup)
        const fieldSchema = await getFieldSchema(currentNode.type, fieldName)
        
        const fieldConfig: AIFieldConfig = {
          fieldName: targetField === 'auto' ? fieldName : targetField,
          fieldType: fieldSchema?.type || 'text',
          fieldLabel: fieldSchema?.label || fieldName,
          context: instructions,
          constraints: {
            maxLength: fieldSchema?.maxLength,
            format: fieldSchema?.format,
            options: fieldSchema?.options,
            required: fieldSchema?.required
          }
        }
        
        // Generate AI value
        const generatedValue = await generateAIFieldValue(
          fieldConfig,
          aiContext,
          userApiKey
        )
        
        console.log(`[AI Field] Generated value for ${fieldName}:`, generatedValue)
        resolvedConfig[fieldName] = generatedValue
        
      } else if (typeof fieldValue === 'string' && containsAIVariables(fieldValue)) {
        // Resolve AI variables in text
        console.log(`[AI Variables] Resolving variables in ${fieldName}`)
        
        const resolvedText = await resolveAIVariables(
          fieldValue,
          aiContext,
          userApiKey
        )
        
        console.log(`[AI Variables] Resolved text:`, resolvedText)
        resolvedConfig[fieldName] = resolvedText
        
      } else {
        // Keep original value
        resolvedConfig[fieldName] = fieldValue
      }
      
    } catch (error) {
      console.error(`[AI Field] Error resolving field ${fieldName}:`, error)
      // On error, use original value or empty
      resolvedConfig[fieldName] = fieldValue || ''
    }
  }
  
  return resolvedConfig
}

/**
 * Checks if a string contains AI variables
 */
function containsAIVariables(text: string): boolean {
  // Check for [variable] pattern
  if (/\[[^\]]+\]/.test(text)) return true
  
  // Check for {{AI:instruction}} pattern
  if (/\{\{AI:[^}]+\}\}/.test(text)) return true
  
  return false
}

/**
 * Gets field schema from node configuration
 * This would need to be connected to your actual node definitions
 */
async function getFieldSchema(nodeType: string, fieldName: string): Promise<any> {
  // This should look up the actual schema from your node definitions
  // For now, returning a basic schema
  
  // Example implementation:
  // const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
  // const fieldSchema = nodeComponent?.configSchema?.find(f => f.name === fieldName)
  
  return {
    type: 'text',
    label: fieldName,
    required: false
  }
}

/**
 * Example usage in workflow execution
 */
export async function executeNodeWithAI(
  nodeConfig: Record<string, any>,
  context: WorkflowExecutionContext
): Promise<any> {
  // Resolve AI fields before execution
  const resolvedConfig = await resolveNodeAIFields({
    ...context,
    currentNode: {
      id: context.currentNode.id,
      type: context.currentNode.type,
      config: nodeConfig
    }
  })
  
  // Now execute the node with resolved configuration
  // Your existing node execution logic here
  
  return {
    success: true,
    output: resolvedConfig,
    metadata: {
      aiFieldsResolved: true,
      originalConfig: nodeConfig,
      resolvedConfig
    }
  }
}

/**
 * Batch resolve multiple fields for efficiency
 */
export async function batchResolveAIFields(
  fields: Array<{ name: string; value: any; schema?: any }>,
  context: AIVariableContext,
  apiKey?: string
): Promise<Record<string, any>> {
  const results: Record<string, any> = {}
  
  // Group fields by type for batch processing
  const aiFields: typeof fields = []
  const variableFields: typeof fields = []
  const regularFields: typeof fields = []
  
  for (const field of fields) {
    if (isAIControlledField(field.value)) {
      aiFields.push(field)
    } else if (typeof field.value === 'string' && containsAIVariables(field.value)) {
      variableFields.push(field)
    } else {
      regularFields.push(field)
    }
  }
  
  // Process AI fields in parallel
  const aiPromises = aiFields.map(async (field) => {
    const fieldConfig: AIFieldConfig = {
      fieldName: field.name,
      fieldType: field.schema?.type || 'text',
      fieldLabel: field.schema?.label || field.name,
      constraints: field.schema
    }
    
    const value = await generateAIFieldValue(fieldConfig, context, apiKey)
    return { name: field.name, value }
  })
  
  // Process variable fields in parallel
  const varPromises = variableFields.map(async (field) => {
    const value = await resolveAIVariables(field.value, context, apiKey)
    return { name: field.name, value }
  })
  
  // Wait for all AI processing
  const aiResults = await Promise.all(aiPromises)
  const varResults = await Promise.all(varPromises)
  
  // Combine results
  aiResults.forEach(r => results[r.name] = r.value)
  varResults.forEach(r => results[r.name] = r.value)
  regularFields.forEach(f => results[f.name] = f.value)
  
  return results
}

/**
 * Preview AI field resolution without executing
 */
export async function previewAIFieldResolution(
  fieldValue: string,
  fieldSchema: any,
  sampleContext: AIVariableContext,
  apiKey?: string
): Promise<{
  resolved: any
  explanation: string
  confidence: number
}> {
  try {
    if (isAIControlledField(fieldValue)) {
      const fieldConfig: AIFieldConfig = {
        fieldName: fieldSchema.name,
        fieldType: fieldSchema.type,
        fieldLabel: fieldSchema.label,
        constraints: fieldSchema
      }
      
      const resolved = await generateAIFieldValue(fieldConfig, sampleContext, apiKey)
      
      return {
        resolved,
        explanation: `AI generated value based on ${fieldSchema.type} field requirements`,
        confidence: 0.85
      }
    } else if (typeof fieldValue === 'string' && containsAIVariables(fieldValue)) {
      const resolved = await resolveAIVariables(fieldValue, sampleContext, apiKey)
      
      return {
        resolved,
        explanation: 'AI resolved variables in text',
        confidence: 0.90
      }
    }
    
    return {
      resolved: fieldValue,
      explanation: 'No AI processing needed',
      confidence: 1.0
    }
  } catch (error) {
    return {
      resolved: fieldValue,
      explanation: `AI resolution failed: ${error.message}`,
      confidence: 0
    }
  }
}