/**
 * Resolves a value from input data using template syntax
 * Supports {{data.field}}, {{trigger.field}}, {{NodeTitle.output}}, and {{variableName}} syntax for accessing nested properties
 * If a trigger variable is referenced and not present in input, uses mockTriggerOutputs if provided
 */
export function resolveValue(
  value: any,
  input: Record<string, any>,
  mockTriggerOutputs?: Record<string, any>
): any {
  if (typeof value !== "string") return value
  
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    const parts = key.split(".")
    
    // Handle node output references: {{NodeTitle.output}}
    if (parts.length === 2 && parts[1] === "output") {
      const nodeTitle = parts[0]
      
      // Look for the node output in the input data
      if (input && input.nodeOutputs) {
        // Find the node by title in nodeOutputs
        for (const [nodeId, nodeResult] of Object.entries(input.nodeOutputs)) {
          if (nodeResult && nodeResult.output && nodeResult.output.output !== undefined) {
            return nodeResult.output.output
          }
        }
      }
      
      // Also check in the main input data for direct node outputs
      if (input && input.output && input.output.output !== undefined) {
        return input.output.output
      }
      
      // Check if the input itself contains the node output
      if (input && input.output !== undefined) {
        return input.output
      }
    }
    
    // Handle trigger output references: {{trigger.field}}
    if (parts[0] === "trigger" && mockTriggerOutputs) {
      const triggerKey = parts[1]
      if (
        mockTriggerOutputs[triggerKey] &&
        (mockTriggerOutputs[triggerKey].example !== undefined || mockTriggerOutputs[triggerKey].value !== undefined)
      ) {
        // Prefer .value if present, else .example
        return mockTriggerOutputs[triggerKey].value ?? mockTriggerOutputs[triggerKey].example
      }
    }
    
    // Handle data field references: {{data.field}}
    if (parts[0] === "data") {
      const dataKey = parts.slice(1).join(".")
      return dataKey.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
    }
    
    // Handle direct variable references for single-part keys like {{variableName}}
    // This is especially important for AI agent variable resolution
    if (parts.length === 1) {
      const variableName = parts[0]
      
      // First check if the variable exists directly in input
      if (input && input[variableName] !== undefined) {
        return input[variableName]
      }
      
      // Check in input.input for nested structure
      if (input && input.input && input.input[variableName] !== undefined) {
        return input.input[variableName]
      }
      
      // Check in mockTriggerOutputs if available
      if (mockTriggerOutputs && mockTriggerOutputs[variableName]) {
        return mockTriggerOutputs[variableName].value ?? mockTriggerOutputs[variableName].example ?? mockTriggerOutputs[variableName]
      }
    }
    
    // Fallback to direct input access using dot notation
    return parts.reduce((acc: any, part: any) => acc && acc[part], input)
  }
  
  return value
} 