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
  context: Record<string, any>
): T {
  // For string templates with {{variable}} syntax
  if (typeof template === 'string') {
    return resolveStringTemplate(template, context) as T
  }
  
  // For objects with nested templates
  if (template && typeof template === 'object') {
    if (Array.isArray(template)) {
      // Handle arrays
      return template.map(item => resolveValue(item, context)) as T
    } else {
      // Handle objects
      const result: Record<string, any> = {}
      for (const [key, value] of Object.entries(template)) {
        result[key] = resolveValue(value, context)
      }
      return result as T
    }
  }
  
  // For primitives, just return as is
  return template
}

/**
 * Resolves variables in a string template
 * 
 * @param template - String with {{variable}} placeholders
 * @param context - Context object with values to inject
 * @returns Resolved string
 */
function resolveStringTemplate(
  template: string, 
  context: Record<string, any>
): string {
  // Regular expression to match {{variable}} pattern
  const regex = /\{\{([^}]+)\}\}/g
  
  return template.replace(regex, (match, path) => {
    // Get the value from the context using the dot path
    const value = getValueByPath(context, path.trim())
    
    // Return the value or the original placeholder if not found
    if (value === undefined) {
      return match // Keep original placeholder
    }
    
    // Convert to string if needed
    return typeof value === 'object' 
      ? JSON.stringify(value) 
      : String(value)
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