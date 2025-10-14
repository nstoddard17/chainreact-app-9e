import { logger } from '@/lib/utils/logger'

/**
 * Resolves templated values in a string or object
 * 
 * Examples:
 * - "Hello {{user.name}}" -> "Hello John"
 * - { subject: "{{input.subject}}" } -> { subject: "Meeting tomorrow" }
 * 
 * @param template - String or object containing templated values
 * @param context - Object containing values to inject
 * @returns The resolved value
 */
export function resolveValue<T>(
  template: T, 
  context: Record<string, any>,
  dataFlowManager?: any
): T {
  // For string templates with {{variable}} syntax
  if (typeof template === 'string') {
    return resolveStringTemplate(template, context, dataFlowManager) as T
  }
  
  // For objects with nested templates
  if (template && typeof template === 'object') {
    if (Array.isArray(template)) {
      // Handle arrays
      return template.map(item => resolveValue(item, context, dataFlowManager)) as T
    } 
      // Handle objects
      const result: Record<string, any> = {}
      for (const [key, value] of Object.entries(template)) {
        result[key] = resolveValue(value, context, dataFlowManager)
      }
      return result as T
    
  }
  
  // For primitives, just return as is
  return template
}

/**
 * Resolves variables in a string template
 * 
 * @param template - String with {{variable}} placeholders
 * @param context - Context object with values to inject
 * @param dataFlowManager - Optional DataFlowManager for node output resolution
 * @returns Resolved string
 */
function resolveStringTemplate(
  template: string, 
  context: Record<string, any>,
  dataFlowManager?: any
): string {
  // Regular expression to match {{variable}} pattern
  const regex = /\{\{([^}]+)\}\}/g
  
  return template.replace(regex, (match, path) => {
    const trimmedPath = path.trim()
    logger.debug(`🔧 Legacy resolveValue attempting to resolve: "${match}"`)
    
    // First try to get the value from the context using the dot path
    const value = getValueByPath(context, trimmedPath)
    
    if (value !== undefined) {
      logger.debug(`✅ Found in context:`, value)
      return typeof value === 'object' 
        ? JSON.stringify(value) 
        : String(value)
    }
    
    // If not found in context and we have a DataFlowManager, try that
    if (dataFlowManager && dataFlowManager.resolveVariable) {
      logger.debug(`🔧 Trying DataFlowManager for: "${match}"`)
      try {
        const dataFlowValue = dataFlowManager.resolveVariable(match)
        
        if (dataFlowValue !== match) { // If it resolved to something different
          logger.debug(`✅ DataFlowManager resolved:`, dataFlowValue)
          return typeof dataFlowValue === 'object' 
            ? JSON.stringify(dataFlowValue) 
            : String(dataFlowValue)
        } 
          logger.debug(`⚠️ DataFlowManager could not resolve: "${match}"`)
        
      } catch (error) {
        logger.error(`❌ DataFlowManager error for "${match}":`, error)
      }
    } else {
      logger.debug(`⚠️ No DataFlowManager available for: "${match}"`)
    }
    
    logger.debug(`❌ Could not resolve: "${match}"`)
    // Return the original placeholder if not found
    return match
  })
}

/**
 * Gets a value from a nested object using a dot-notation path
 * 
 * @param obj - The object to extract from
 * @param path - Dot notation path (e.g., "user.address.city")
 * @returns The value or undefined if not found
 */
function getValueByPath(
  obj: Record<string, any>, 
  path: string
): any {
  // Split the path by dots
  const parts = path.split('.')
  let value = obj
  
  for (const part of parts) {
    // Handle array access with [] notation
    if (part.includes('[') && part.includes(']')) {
      const [arrayName, indexStr] = part.split(/[\[\]]/)
      const index = parseInt(indexStr, 10)
      
      // Get the array
      value = value[arrayName]
      
      // Check if the array exists and index is valid
      if (!Array.isArray(value) || isNaN(index)) {
        return undefined
      }
      
      // Get the value at the index
      value = value[index]
    } else {
      // Regular property access
      value = value?.[part]
    }
    
    if (value === undefined) {
      return undefined
    }
  }
  
  return value
} 