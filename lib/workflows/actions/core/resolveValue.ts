import { logger } from '@/lib/utils/logger'

/**
 * Navigate through an object using a path that may contain array notation
 * Handles paths like "events[].description" or "items[0].name"
 *
 * For [] notation without index:
 * - Returns the first item's field value for single-value contexts
 * - Returns array of all values when appropriate
 */
export function navigateArrayPath(obj: any, path: string): any {
  if (!obj || !path) {
    logger.debug(`[navigateArrayPath] Early return - obj: ${!!obj}, path: "${path}"`)
    return undefined
  }

  // Split path into segments, handling array notation
  const segments: Array<{ key: string; arrayAccess?: 'all' | number | 'first' | 'last' }> = []

  // Parse path like "events[].description" or "items[0].name"
  const pathParts = path.split('.')
  logger.debug(`[navigateArrayPath] START - Navigating path "${path}", pathParts: ${JSON.stringify(pathParts)}, objKeys: ${Object.keys(obj).slice(0, 10).join(', ')}`)

  for (const part of pathParts) {
    // Check for array notation: field[], field[0], field[*]
    const arrayMatch = part.match(/^([^\[]+)\[(\d+|last|first|\*)?]$/)
    if (arrayMatch) {
      const key = arrayMatch[1]
      const indexStr = arrayMatch[2]

      // When the path uses bare [] (no explicit matcher) the regex captures
      // undefined for the second group, so treat that the same as an empty
      // string to ensure we still record the array access segment.
      if (indexStr === undefined || indexStr === '' || indexStr === '*') {
        // [] or [*] means access all items (or first for single-value context)
        segments.push({ key, arrayAccess: 'all' })
      } else if (indexStr === 'first') {
        segments.push({ key, arrayAccess: 'first' })
      } else if (indexStr === 'last') {
        segments.push({ key, arrayAccess: 'last' })
      } else if (indexStr !== undefined) {
        // [0], [1], etc. - specific index
        segments.push({ key, arrayAccess: parseInt(indexStr, 10) })
      }
    } else {
      segments.push({ key: part })
    }
  }

  logger.debug(`[navigateArrayPath] Parsed segments: ${JSON.stringify(segments)}`)

  // Navigate through the segments
  let current: any = obj

  for (let i = 0; i < segments.length; i++) {
    if (current === undefined || current === null) {
      logger.debug(`[navigateArrayPath] Early exit: current is ${current} at segment ${i}`)
      return undefined
    }

    const segment = segments[i]
    logger.debug(`[navigateArrayPath] Processing segment ${i}: key="${segment.key}", arrayAccess=${segment.arrayAccess}`)

    // Access the key
    const prevCurrent = current
    current = current[segment.key]
    logger.debug(`[navigateArrayPath] Accessed key "${segment.key}": ${current === undefined ? 'undefined' : (Array.isArray(current) ? `array[${current.length}]` : typeof current)}`)

    if (current === undefined || current === null) {
      logger.debug(`[navigateArrayPath] Key "${segment.key}" not found in object with keys: ${Object.keys(prevCurrent || {}).join(', ')}`)
      return undefined
    }

    // Handle array access
    if (segment.arrayAccess !== undefined) {
      if (!Array.isArray(current)) {
        logger.debug(`[navigateArrayPath] Expected array at ${segment.key} but got ${typeof current}`)
        return undefined
      }

      logger.debug(`[navigateArrayPath] Array at "${segment.key}" has ${current.length} items`)

      if (segment.arrayAccess === 'all') {
        // For [] notation, get remaining path and map over array
        const remainingPath = segments.slice(i + 1).map(s => {
          if (s.arrayAccess === 'all') return `${s.key}[]`
          if (s.arrayAccess !== undefined) return `${s.key}[${s.arrayAccess}]`
          return s.key
        }).join('.')

        if (remainingPath) {
          // Map over array and get nested value from each item
          logger.debug(`[navigateArrayPath] ARRAY MAPPING - array length: ${current.length}, remaining path: "${remainingPath}"`)

          // Log first few items' keys to help debug missing fields
          if (current.length > 0) {
            const firstItemKeys = Object.keys(current[0] || {}).join(', ')
            logger.debug(`[navigateArrayPath] First item keys: ${firstItemKeys}`)
          }

          const rawValues = current.map((item: any, idx: number) => {
            const val = navigateArrayPath(item, remainingPath)
            if (idx < 3) {  // Log first 3 items for debugging
              logger.debug(`[navigateArrayPath] Item ${idx} resolved "${remainingPath}" to: ${val === undefined ? 'undefined' : (typeof val === 'string' ? `"${val.slice(0, 50)}"` : val)}`)
            }
            return val
          })

          // Filter out undefined, null, and empty strings
          const values = rawValues.filter((v: any) => v !== undefined && v !== null && v !== '')

          logger.debug(`[navigateArrayPath] ARRAY RESULT - raw count: ${rawValues.length}, filtered count: ${values.length}, undefinedCount: ${rawValues.filter(v => v === undefined).length}`)

          // For single-value contexts (like text fields), return first value
          // For array contexts, return all values joined with proper formatting
          // IMPORTANT: Return empty string for empty arrays to signal "resolved but empty" vs "not found"
          // This allows downstream code to distinguish between "field exists but all values are empty"
          // vs "field doesn't exist at all"
          if (values.length === 0) {
            logger.debug(`[navigateArrayPath] ⚠️ All array items had undefined/null/empty for "${remainingPath}" - returning empty string`)
            return ''  // Return empty string instead of undefined for empty results
          }
          if (values.length === 1) {
            logger.debug(`[navigateArrayPath] ✅ Single value result:`, values[0])
            return values[0]
          }

          const allPrimitive = values.every((v: any) => (
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean'
          ))

          if (!allPrimitive) {
            logger.debug(`[navigateArrayPath] ✅ Returning array of ${values.length} non-primitive values`)
            return values
          }

          const joinedResult = values.join(', ')
          logger.debug(`[navigateArrayPath] ✅ Multiple primitive values joined: "${joinedResult.slice(0, 100)}..."`)
          return joinedResult
        } else {
          // No remaining path, return first item for single-value context
          // Return empty string if array is empty
          return current.length > 0 ? current[0] : ''
        }
      } else if (segment.arrayAccess === 'first') {
        if (current.length === 0) {
          logger.debug('[navigateArrayPath] Requested [first] on empty array, returning empty string')
          return ''
        }
        current = current[0]
      } else if (segment.arrayAccess === 'last') {
        if (current.length === 0) {
          logger.debug('[navigateArrayPath] Requested [last] on empty array, returning empty string')
          return ''
        }
        current = current[current.length - 1]
      } else {
        // Specific index
        current = current[segment.arrayAccess]
      }
    }
  }

  return current
}

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
    logger.debug('🔍 [RESOLVE_VALUE] Attempting to resolve variable:', value)
    logger.debug('🔍 [RESOLVE_VALUE] Available input keys:', Object.keys(input || {}).join(', '))
    logger.debug('🔍 [RESOLVE_VALUE] Input keys count:', Object.keys(input || {}).length)

    // Log structure of each input key for debugging (enhanced for array debugging)
    Object.keys(input || {}).forEach(key => {
      const val = input[key]
      logger.debug(`🔍 [RESOLVE_VALUE] Key "${key}":`, {
        type: typeof val,
        isArray: Array.isArray(val),
        isObject: val && typeof val === 'object' && !Array.isArray(val),
        hasOutput: val?.output !== undefined,
        hasEvents: val?.events !== undefined,
        eventsLength: Array.isArray(val?.events) ? val.events.length : 'n/a',
        firstEventKeys: Array.isArray(val?.events) && val.events.length > 0
          ? Object.keys(val.events[0] || {}).slice(0, 8).join(', ')
          : 'n/a',
        topLevelKeys: val && typeof val === 'object' ? Object.keys(val).slice(0, 10) : 'n/a'
      })
    })
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
      logger.debug(`🔍 [RESOLVE_VALUE] Looking for node ID "${nodeIdOrTitle}" in input keys:`, Object.keys(input || {}))
      if (input && input[nodeIdOrTitle]) {
        const nodeData = input[nodeIdOrTitle]
        logger.debug(`✅ [RESOLVE_VALUE] FOUND node data for "${nodeIdOrTitle}":`, {
          nodeDataType: typeof nodeData,
          hasOutput: !!nodeData?.output,
          hasSuccess: typeof nodeData?.success !== 'undefined',
          hasEvents: !!nodeData?.events,
          outputField,
          topLevelKeys: nodeData && typeof nodeData === 'object' ? Object.keys(nodeData) : []
        })

        // Check if outputField contains array notation (e.g., events[].description)
        const hasArrayNotation = outputField.includes('[]') || /\[\d+\]/.test(outputField)

        // Navigate through the nested structure
        // Use navigateArrayPath for paths with array notation, otherwise use simple reduce
        let fieldValue: any
        if (hasArrayNotation) {
          fieldValue = navigateArrayPath(nodeData, outputField)
        } else {
          fieldValue = outputField.split(".").reduce((acc: any, part: any) => {
            return acc && acc[part]
          }, nodeData)
        }

        if (fieldValue !== undefined) {
          logger.debug(`🔍 Resolved ${key} from direct field access:`, fieldValue)
          return fieldValue
        }

        // Check if the field exists in the node's output property
        // This handles cached ActionResult format: { success: true, output: { field: value } }
        if (nodeData.output) {
          let outputFieldValue: any
          if (hasArrayNotation) {
            outputFieldValue = navigateArrayPath(nodeData.output, outputField)
          } else {
            outputFieldValue = outputField.split(".").reduce((acc: any, part: any) => {
              return acc && acc[part]
            }, nodeData.output)
          }

          if (outputFieldValue !== undefined) {
            logger.debug(`🔍 Resolved ${key} from output property:`, outputFieldValue)
            return outputFieldValue
          }
        }

        // Also check inside output.output for double-nested structures
        // This handles cases where nodeData = { success, output: { output: { field } } }
        if (nodeData.output?.output) {
          let doubleNestedValue: any
          if (hasArrayNotation) {
            doubleNestedValue = navigateArrayPath(nodeData.output.output, outputField)
          } else {
            doubleNestedValue = outputField.split(".").reduce((acc: any, part: any) => {
              return acc && acc[part]
            }, nodeData.output.output)
          }

          if (doubleNestedValue !== undefined) {
            logger.debug(`🔍 Resolved ${key} from double-nested output:`, doubleNestedValue)
            return doubleNestedValue
          }
        }

        logger.debug(`❌ [RESOLVE_VALUE] Could not resolve "${key}" - field "${outputField}" not found in node data, output, or nested output`)
      } else {
        logger.debug(`❌ [RESOLVE_VALUE] Node ID "${nodeIdOrTitle}" NOT FOUND in input keys:`, Object.keys(input || {}))
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
          
          if (nodeResult && nodeResult.output && couldMatch) {
            // Handle AI agent nested output structure: { output: { output: "actual value" } }
            if (nodeResult.output.output !== undefined && (outputField === "output" || outputField === "AI Agent Output")) {
              return nodeResult.output.output
            }
            // Handle regular output structure: { output: { fieldName: "value" } }
            if (nodeResult.output[outputField] !== undefined) {
              return nodeResult.output[outputField]
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

      if (parts[0] === "trigger" && mockTriggerOutputs) {
        const triggerKey = parts[1]
        if (mockTriggerOutputs[triggerKey]) {
          return mockTriggerOutputs[triggerKey].value ?? mockTriggerOutputs[triggerKey].example ?? mockTriggerOutputs[triggerKey]
        }
      }

      // Handle node output references (e.g., {{action-123.user.name}} or {{action-123.events[].description}})
      if (parts.length >= 2) {
        const nodeIdOrTitle = parts[0]
        const outputField = parts.slice(1).join(".")

        logger.debug(`[EMBEDDED] Resolving node reference: nodeId="${nodeIdOrTitle}", field="${outputField}"`)

        // Check if outputField contains array notation
        const hasArrayNotation = outputField.includes('[]') || /\[\d+\]/.test(outputField)
        logger.debug(`[EMBEDDED] Has array notation: ${hasArrayNotation}`)

        // Try direct node ID access
        if (input && input[nodeIdOrTitle]) {
          const nodeData = input[nodeIdOrTitle]
          const nodeDataKeys = Object.keys(nodeData || {}).slice(0, 15)
          logger.debug(`[EMBEDDED] ✅ Found node data for "${nodeIdOrTitle}", keys: ${nodeDataKeys.join(', ')}`)

          // For array paths, verify the array exists before calling navigateArrayPath
          if (hasArrayNotation) {
            const arrayFieldName = outputField.split('[')[0]  // e.g., "events" from "events[].description"
            const arrayField = nodeData[arrayFieldName]
            logger.debug(`[EMBEDDED] Array field "${arrayFieldName}": exists=${arrayField !== undefined}, isArray=${Array.isArray(arrayField)}, length=${Array.isArray(arrayField) ? arrayField.length : 'N/A'}`)
          }

          // Navigate through the nested structure
          let fieldValue: any
          if (hasArrayNotation) {
            logger.debug(`[EMBEDDED] Calling navigateArrayPath with outputField: "${outputField}"`)
            fieldValue = navigateArrayPath(nodeData, outputField)
            logger.debug(`[EMBEDDED] navigateArrayPath returned: ${fieldValue === undefined ? 'undefined' : (fieldValue === '' ? '""(empty string)' : (typeof fieldValue === 'string' ? `"${fieldValue.slice(0, 100)}"` : fieldValue))}`)
          } else {
            fieldValue = outputField.split(".").reduce((acc: any, part: any) => {
              return acc && acc[part]
            }, nodeData)
          }

          // Check for both undefined AND empty string (empty string is valid resolution)
          // Empty string means "field was found but all values were empty/missing" - still resolved!
          if (fieldValue !== undefined) {
            logger.debug(`[EMBEDDED] ✅ Resolved to: ${fieldValue === '' ? '""(empty string - valid resolution)' : (typeof fieldValue === 'string' ? `"${fieldValue.slice(0, 100)}"` : fieldValue)}`)
            return fieldValue
          }
          logger.debug(`[EMBEDDED] ❌ fieldValue is undefined (not resolved), trying nodeData.output...`)

          // Check if the field exists in the node's output property
          // This handles cached ActionResult format: { success: true, output: { field: value } }
          if (nodeData.output) {
            let outputFieldValue: any
            if (hasArrayNotation) {
              outputFieldValue = navigateArrayPath(nodeData.output, outputField)
            } else {
              outputFieldValue = outputField.split(".").reduce((acc: any, part: any) => {
                return acc && acc[part]
              }, nodeData.output)
            }

            if (outputFieldValue !== undefined) {
              return outputFieldValue
            }
          }

          // Also check inside output.output for double-nested structures
          if (nodeData.output?.output) {
            let doubleNestedValue: any
            if (hasArrayNotation) {
              doubleNestedValue = navigateArrayPath(nodeData.output.output, outputField)
            } else {
              doubleNestedValue = outputField.split(".").reduce((acc: any, part: any) => {
                return acc && acc[part]
              }, nodeData.output.output)
            }

            if (doubleNestedValue !== undefined) {
              return doubleNestedValue
            }
          }
        }
      }

      // Try direct field access as fallback
      const directValue = parts.reduce((acc: any, part: any) => acc && acc[part], input)
      if (directValue !== undefined) {
        return directValue
      }

      // If we can't resolve it, return the original template
      logger.debug(`[EMBEDDED] ❌ FAILED to resolve variable "${key}", returning original: "${match}"`)
      logger.debug(`[EMBEDDED] Available input keys: ${Object.keys(input || {}).join(', ')}`)
      return match
    })
    
    return resolvedValue
  }
  
  return value
} 
