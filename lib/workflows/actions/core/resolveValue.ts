import { logger } from '@/lib/utils/logger'

/**
 * Format all input data into a readable string
 */
function formatAllInputData(input: any): string {
  if (!input) {
    return 'No data available.'
  }

  // If it's a simple string or number, return directly
  if (typeof input === 'string' || typeof input === 'number') {
    return String(input)
  }

  // If it's an array, format each item
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return 'No items available.'
    }

    return input.map((item, index) => {
      if (typeof item === 'object' && item !== null) {
        return `**Item ${index + 1}:**\n${formatObject(item)}`
      }
      return `**Item ${index + 1}:** ${item}`
    }).join('\n\n')
  }

  // If it's an object, format key-value pairs
  if (typeof input === 'object' && input !== null) {
    return formatObject(input)
  }

  return String(input)
}

/**
 * Format an object into readable key-value pairs
 */
function formatObject(obj: Record<string, any>, indent = 0): string {
  const spaces = '  '.repeat(indent)

  return Object.entries(obj)
    .filter(([key, value]) => {
      // Filter out internal/metadata fields
      return value !== undefined &&
             value !== null &&
             !key.startsWith('_') &&
             key !== 'dataFlowManager' &&
             key !== 'nodeOutputs'
    })
    .map(([key, value]) => {
      // Format the key nicely (convert camelCase to Title Case)
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim()

      // Handle different value types
      if (Array.isArray(value)) {
        if (value.length === 0) return `${spaces}**${formattedKey}:** (empty list)`
        if (value.length === 1 && typeof value[0] !== 'object') {
          return `${spaces}**${formattedKey}:** ${value[0]}`
        }
        return `${spaces}**${formattedKey}:**\n${value.map((item, idx) => {
          if (typeof item === 'object') {
            return `${spaces}  ${idx + 1}. ${formatObject(item, indent + 2)}`
          }
          return `${spaces}  ${idx + 1}. ${item}`
        }).join('\n')}`
      }

      if (typeof value === 'object' && value !== null) {
        return `${spaces}**${formattedKey}:**\n${formatObject(value, indent + 1)}`
      }

      if (typeof value === 'boolean') {
        return `${spaces}**${formattedKey}:** ${value ? 'Yes' : 'No'}`
      }

      // For strings, truncate if too long
      let displayValue = String(value)
      if (displayValue.length > 500) {
        displayValue = displayValue.substring(0, 500) + '...'
      }

      return `${spaces}**${formattedKey}:** ${displayValue}`
    })
    .join('\n')
}

/**
 * Resolves a value from input data using template syntax
 * Supports {{*}}, {{data.field}}, {{trigger.field}}, {{NodeTitle.output}}, and {{variableName}} syntax for accessing nested properties
 * If a trigger variable is referenced and not present in input, uses mockTriggerOutputs if provided
 */
export function resolveValue(
  value: any,
  input: Record<string, any>,
  mockTriggerOutputs?: Record<string, any>
): any {
  // Handle arrays - recursively resolve each element
  if (Array.isArray(value)) {
    return value.map(item => resolveValue(item, input, mockTriggerOutputs))
  }

  // Handle objects - recursively resolve each property value
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const resolved: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val, input, mockTriggerOutputs)
    }
    return resolved
  }

  if (typeof value !== "string") return value

  // Debug logging for variable resolution
  if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
    logger.debug('🔍 Resolving variable:', value)
    logger.debug('🔍 Available input keys:', Object.keys(input || {}).join(', '))
  }
  
  // First check if the entire value is a single template
  const singleMatch = value.match(/^{{(.*)}}$/)
  if (singleMatch) {
    const key = singleMatch[1].trim()

    // Handle {{NOW}} - return current timestamp as ISO string
    if (key === 'NOW' || key === 'now') {
      return new Date().toISOString()
    }

    // Handle wildcard {{*}} - return all input data formatted nicely
    if (key === '*') {
      return formatAllInputData(input)
    }

    // Handle "Action: Provider: Action Name.Field" format
    // e.g., "Action: Gmail: Get Email.Body"
    if (key.includes(': ')) {
      const colonParts = key.split(': ')
      if (colonParts[0] === 'Action' && colonParts.length >= 3) {
        // Extract the field from the last part (e.g., "Get Email.Body" -> "Body")
        const lastPart = colonParts[colonParts.length - 1]
        const fieldMatch = lastPart.match(/\.(\w+)$/)
        const fieldName = fieldMatch ? fieldMatch[1] : null
        
        if (fieldName) {
          // Look for Gmail search results in the input data - check both 'messages' and 'emails'
          const emailArray = input.messages || input.emails
          
          if (emailArray && Array.isArray(emailArray) && emailArray.length > 0) {
            const firstMessage = emailArray[0]
            
            // Map common field names to actual message properties
            const fieldMap: Record<string, string> = {
              'Body': 'body', // Changed from 'snippet' to 'body'
              'body': 'body',
              'Subject': 'subject',
              'subject': 'subject',
              'From': 'from',
              'from': 'from',
              'To': 'to',
              'to': 'to',
              'Date': 'date',
              'date': 'date',
              'Snippet': 'snippet',
              'snippet': 'snippet'
            }
            
            const actualField = fieldMap[fieldName] || fieldName.toLowerCase()
            
            if (firstMessage[actualField] !== undefined) {
              return firstMessage[actualField]
            }
          }
        }
      }
    }
    
    const parts = key.split(".")

    // Handle node output references: {{NodeTitle.output}} or {{node-id.field}}
    if (parts.length >= 2) {
      const nodeIdOrTitle = parts[0]
      const outputField = parts.slice(1).join(".")

      // First, try direct node ID access (e.g., {{action-1760677115194.email}})
      if (input && input[nodeIdOrTitle]) {
        const nodeData = input[nodeIdOrTitle]

        // Navigate through the nested structure
        const fieldValue = outputField.split(".").reduce((acc: any, part: any) => {
          return acc && acc[part]
        }, nodeData)

        if (fieldValue !== undefined) {
          return fieldValue
        }

        // Also check if the field exists in the node's output property
        if (nodeData.output) {
          const outputFieldValue = outputField.split(".").reduce((acc: any, part: any) => {
            return acc && acc[part]
          }, nodeData.output)

          if (outputFieldValue !== undefined) {
            return outputFieldValue
          }
        }

        // Also check inside output.output for double-nested structures
        // This handles cases where nodeData = { success, output: { output: { field } } }
        if (nodeData.output?.output) {
          const doubleNestedValue = outputField.split(".").reduce((acc: any, part: any) => {
            return acc && acc[part]
          }, nodeData.output.output)

          if (doubleNestedValue !== undefined) {
            logger.debug(`🔍 Resolved ${key} from double-nested output:`, doubleNestedValue)
            return doubleNestedValue
          }
        }

        logger.debug(`❌ [RESOLVE_VALUE] Could not resolve "${key}" - field "${outputField}" not found in node data, output, or nested output`)
      } else {
        logger.debug(`❌ [RESOLVE_VALUE] Node ID "${nodeIdOrTitle}" NOT FOUND in input keys:`, Object.keys(input || {}))

        // PREFIX MATCHING: Try to find node by prefix (e.g., {{ai_agent.output}} -> ai_agent-xxxxx.output)
        if (input) {
          const inputKeys = Object.keys(input)
          const prefixMatchKey = inputKeys.find(k => k.startsWith(nodeIdOrTitle + '-'))
          if (prefixMatchKey) {
            logger.debug(`🔍 [RESOLVE_VALUE] PREFIX MATCH for dotted path: "${nodeIdOrTitle}" -> "${prefixMatchKey}"`)
            const nodeData = input[prefixMatchKey]

            if (nodeData && typeof nodeData === 'object') {
              // Navigate to the field
              const fieldValue = outputField.split(".").reduce((acc: any, part: any) => {
                return acc && acc[part]
              }, nodeData)

              if (fieldValue !== undefined) {
                logger.debug(`✅ [RESOLVE_VALUE] Resolved "${key}" via prefix match`)
                return fieldValue
              }

              // Try nodeData.output
              if (nodeData.output) {
                const outputFieldValue = outputField.split(".").reduce((acc: any, part: any) => {
                  return acc && acc[part]
                }, nodeData.output)
                if (outputFieldValue !== undefined) {
                  logger.debug(`✅ [RESOLVE_VALUE] Resolved "${key}" via prefix match from output`)
                  return outputFieldValue
                }
              }
            }
          }
        }

        logger.debug(`❌ [RESOLVE_VALUE] This is likely a data flow issue - the previous node output is not keyed correctly`)
      }

      const nodeTitle = nodeIdOrTitle
      const outputFieldOrig = outputField
      
      // First try to use the dataFlowManager if available for proper node title matching
      if (input && input.dataFlowManager && typeof input.dataFlowManager.resolveVariable === 'function') {
        try {
          const resolvedValue = input.dataFlowManager.resolveVariable(value)
          if (resolvedValue !== value) {
            return resolvedValue
          }
        } catch (error) {
          logger.warn('DataFlowManager resolution failed')
        }
      }
      
      // Fallback: Look for the node output in the input data
      if (input && input.nodeOutputs) {
        // Find the node by title in nodeOutputs - try to match with available metadata
        for (const [nodeId, nodeResult] of Object.entries(input.nodeOutputs)) {
          // Check if this node matches our title (simple heuristic)
          const couldMatch = nodeTitle === "AI Agent" || nodeTitle.includes("AI") || nodeTitle.includes("Agent")
          const typedNodeResult = nodeResult as any

          if (typedNodeResult && typedNodeResult.output && couldMatch) {
            // Handle AI agent nested output structure: { output: { output: "actual value" } }
            if (typedNodeResult.output.output !== undefined && (outputField === "output" || outputField === "AI Agent Output")) {
              return typedNodeResult.output.output
            }
            // Handle regular output structure: { output: { fieldName: "value" } }
            if (typedNodeResult.output[outputField] !== undefined) {
              return typedNodeResult.output[outputField]
            }
          }
        }
      }
      
      // Also check in the main input data for direct node outputs
      if (input && input.output) {
        // Handle AI agent nested output structure
        if (input.output.output !== undefined && (outputField === "output" || outputField === "AI Agent Output")) {
          return input.output.output
        }
        // Handle regular output structure
        if (input.output[outputField] !== undefined) {
          return input.output[outputField]
        }
      }
      
      // Check if the input itself contains the node output
      if (input && input[outputField] !== undefined) {
        return input[outputField]
      }
    }
    
    // Handle trigger output references: {{trigger.field}}
    if (parts[0] === "trigger") {
      const triggerPath = parts.slice(1)

      // First, check if trigger data exists in input.trigger (from actual workflow execution)
      if (input && input.trigger) {
        const triggerValue = triggerPath.reduce((acc: any, part: any) => acc && acc[part], input.trigger)
        if (triggerValue !== undefined) {
          logger.debug(`✅ [RESOLVE_VALUE] Found trigger.${triggerPath.join('.')} from input.trigger:`, triggerValue)
          return triggerValue
        }
      }

      // Fallback to mockTriggerOutputs for testing
      if (mockTriggerOutputs && triggerPath.length > 0) {
        const triggerKey = triggerPath[0]
        if (
          mockTriggerOutputs[triggerKey] &&
          (mockTriggerOutputs[triggerKey].example !== undefined || mockTriggerOutputs[triggerKey].value !== undefined)
        ) {
          // Prefer .value if present, else .example
          return mockTriggerOutputs[triggerKey].value ?? mockTriggerOutputs[triggerKey].example
        }
        // Also support direct values in mockTriggerOutputs
        if (mockTriggerOutputs[triggerKey] !== undefined &&
            typeof mockTriggerOutputs[triggerKey] !== 'object') {
          return mockTriggerOutputs[triggerKey]
        }
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

      // PREFIX MATCHING: Try to find node by prefix (e.g., {{ai_agent}} -> ai_agent-xxxxx)
      // This handles cases where the node ID has a UUID suffix but user uses short name
      if (input) {
        const inputKeys = Object.keys(input)
        const prefixMatchKey = inputKeys.find(k => k.startsWith(variableName + '-'))
        if (prefixMatchKey) {
          logger.debug(`🔍 [RESOLVE_VALUE] PREFIX MATCH: "${variableName}" -> "${prefixMatchKey}"`)
          const nodeData = input[prefixMatchKey]

          // For AI agent and similar nodes, extract the actual output value
          // The structure is typically { success: true, data: { output: "actual value" }, output: "...", message: "..." }
          // NOTE: safeClone() may replace output with "[Circular Reference]" so check data.output first
          if (nodeData && typeof nodeData === 'object') {
            // First check data.output (AI agent stores actual text here)
            if (nodeData.data?.output !== undefined && nodeData.data.output !== '[Circular Reference]') {
              logger.debug(`✅ [RESOLVE_VALUE] Found output from data.output via prefix match: "${prefixMatchKey}"`)
              return nodeData.data.output
            }
            // Fall back to top-level output if it's not a circular reference marker
            if (nodeData.output !== undefined && nodeData.output !== '[Circular Reference]') {
              logger.debug(`✅ [RESOLVE_VALUE] Found output from prefix match: "${prefixMatchKey}"`)
              return nodeData.output
            }
            // Otherwise return the whole node data
            return nodeData
          }
          return nodeData
        }
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
  
  // Check if there are any templates embedded in the string
  const embeddedTemplateRegex = /{{([^}]+)}}/g
  if (embeddedTemplateRegex.test(value)) {
    // Replace all embedded templates
    let resolvedValue = value
    resolvedValue = resolvedValue.replace(/{{([^}]+)}}/g, (match, key) => {
      const trimmedKey = key.trim()

      // Handle {{NOW}} - replace with current timestamp as ISO string
      if (trimmedKey === 'NOW' || trimmedKey === 'now') {
        return new Date().toISOString()
      }

      // Handle wildcard {{*}} - replace with formatted input data
      if (trimmedKey === '*') {
        return formatAllInputData(input)
      }

      // Handle "Action: Provider: Action Name.Field" format
      if (key.includes(': ')) {
        const colonParts = key.split(': ')
        if (colonParts[0] === 'Action' && colonParts.length >= 3) {
          // Extract the field from the last part
          const lastPart = colonParts[colonParts.length - 1]
          const fieldMatch = lastPart.match(/\.(\w+)$/)
          const fieldName = fieldMatch ? fieldMatch[1] : null
          
          if (fieldName) {
            // Look for Gmail search results in the input data
            const emailArray = input.messages || input.emails
            
            if (emailArray && Array.isArray(emailArray) && emailArray.length > 0) {
              const firstMessage = emailArray[0]
              
              // Map common field names to actual message properties
              const fieldMap: Record<string, string> = {
                'Body': 'body',
                'body': 'body',
                'Subject': 'subject',
                'subject': 'subject',
                'From': 'from',
                'from': 'from',
                'To': 'to',
                'to': 'to',
                'Date': 'date',
                'date': 'date',
                'Snippet': 'snippet',
                'snippet': 'snippet'
              }
              
              const actualField = fieldMap[fieldName] || fieldName.toLowerCase()
              
              if (firstMessage[actualField] !== undefined) {
                return firstMessage[actualField]
              }
            }
          }
        }
      }
      
      // Handle other template formats (data.field, trigger.field, node.field, etc.)
      const parts = key.split(".")

      if (parts[0] === "data") {
        const dataKey = parts.slice(1).join(".")
        const resolvedData = dataKey.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
        if (resolvedData !== undefined) {
          return resolvedData
        }
      }

      if (parts[0] === "trigger") {
        const triggerPath = parts.slice(1)

        // First, check if trigger data exists in input.trigger (from actual workflow execution)
        if (input && input.trigger) {
          const triggerValue = triggerPath.reduce((acc: any, part: any) => acc && acc[part], input.trigger)
          if (triggerValue !== undefined) {
            return triggerValue
          }
        }

        // Fallback to mockTriggerOutputs for testing
        if (mockTriggerOutputs && triggerPath.length > 0) {
          const triggerKey = triggerPath[0]
          if (mockTriggerOutputs[triggerKey]) {
            return mockTriggerOutputs[triggerKey].value ?? mockTriggerOutputs[triggerKey].example ?? mockTriggerOutputs[triggerKey]
          }
        }
      }

      // Handle node output references (e.g., {{action-123.user.name}})
      if (parts.length >= 2) {
        const nodeIdOrTitle = parts[0]
        const outputField = parts.slice(1).join(".")

        // Try direct node ID access
        if (input && input[nodeIdOrTitle]) {
          const nodeData = input[nodeIdOrTitle]

          // Navigate through the nested structure
          const fieldValue = outputField.split(".").reduce((acc: any, part: any) => {
            return acc && acc[part]
          }, nodeData)

          if (fieldValue !== undefined) {
            return fieldValue
          }

          // Also check if the field exists in the node's output property
          if (nodeData.output) {
            const outputFieldValue = outputField.split(".").reduce((acc: any, part: any) => {
              return acc && acc[part]
            }, nodeData.output)

            if (outputFieldValue !== undefined) {
              return outputFieldValue
            }
          }

          // Also check inside output.output for double-nested structures
          if (nodeData.output?.output) {
            const doubleNestedValue = outputField.split(".").reduce((acc: any, part: any) => {
              return acc && acc[part]
            }, nodeData.output.output)

            if (doubleNestedValue !== undefined) {
              return doubleNestedValue
            }
          }
        } else {
          // Node not found by exact ID - try prefix matching for dotted paths
          // e.g., {{ai_agent.output}} -> find ai_agent-xxxxx in keys
          if (input) {
            const inputKeys = Object.keys(input)
            const prefixMatchKey = inputKeys.find(k => k.startsWith(nodeIdOrTitle + '-'))
            if (prefixMatchKey) {
              logger.debug(`🔍 [EMBEDDED] PREFIX MATCH for dotted path: "${nodeIdOrTitle}" -> "${prefixMatchKey}"`)
              const nodeData = input[prefixMatchKey]

              if (nodeData && typeof nodeData === 'object') {
                // Navigate to the field
                const fieldValue = outputField.split(".").reduce((acc: any, part: any) => {
                  return acc && acc[part]
                }, nodeData)

                if (fieldValue !== undefined) {
                  logger.debug(`✅ [EMBEDDED] Resolved "${nodeIdOrTitle}.${outputField}" via prefix match`)
                  return fieldValue
                }

                // Try nodeData.output
                if (nodeData.output) {
                  const outputFieldValue = outputField.split(".").reduce((acc: any, part: any) => {
                    return acc && acc[part]
                  }, nodeData.output)
                  if (outputFieldValue !== undefined) {
                    logger.debug(`✅ [EMBEDDED] Resolved "${nodeIdOrTitle}.${outputField}" via prefix match from output`)
                    return outputFieldValue
                  }
                }
              }
            }
          }
        }
      }

      // Try direct field access as fallback
      const directValue = parts.reduce((acc: any, part: any) => acc && acc[part], input)
      if (directValue !== undefined) {
        return directValue
      }

      // PREFIX MATCHING for single-part keys (e.g., {{ai_agent}} -> ai_agent-xxxxx)
      // This handles cases where the node ID has a UUID suffix but user uses short name
      if (parts.length === 1 && input) {
        const variableName = parts[0]
        const inputKeys = Object.keys(input)
        const prefixMatchKey = inputKeys.find(k => k.startsWith(variableName + '-'))
        if (prefixMatchKey) {
          logger.debug(`🔍 [EMBEDDED] PREFIX MATCH: "${variableName}" -> "${prefixMatchKey}"`)
          const nodeData = input[prefixMatchKey]

          // For AI agent and similar nodes, extract the actual output value
          // The structure is typically { success: true, data: { output: "actual value" }, output: "...", message: "..." }
          // NOTE: safeClone() may replace output with "[Circular Reference]" so check data.output first
          if (nodeData && typeof nodeData === 'object') {
            // First check data.output (AI agent stores actual text here)
            if (nodeData.data?.output !== undefined && nodeData.data.output !== '[Circular Reference]') {
              logger.debug(`✅ [EMBEDDED] Found output from data.output via prefix match: "${prefixMatchKey}"`)
              return nodeData.data.output
            }
            // Fall back to top-level output if it's not a circular reference marker
            if (nodeData.output !== undefined && nodeData.output !== '[Circular Reference]') {
              logger.debug(`✅ [EMBEDDED] Found output from prefix match: "${prefixMatchKey}"`)
              return nodeData.output
            }
            return nodeData
          }
          return nodeData
        }
      }

      // If we can't resolve it, return the original template
      return match
    })
    
    return resolvedValue
  }
  
  return value
} 