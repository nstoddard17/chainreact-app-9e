import { evaluateCondition } from './evaluateCondition'
import { resolveValue } from './resolveValue'
import { ActionResult } from './executeWait'

/**
 * Executes an if-then condition node in a workflow
 * Supports complex conditions with AND/OR logic
 */
export async function executeIfThenCondition(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const conditionGroups = config.conditionGroups || []
    const conditionType = config.conditionType || "all" // "all" (AND) or "any" (OR)
    
    if (conditionGroups.length === 0) {
      console.log("No condition groups defined, defaulting to true")
      return {
        success: true,
        output: {
          ...input,
          conditionResult: true,
          conditionPath: "true",
          evaluatedAt: new Date().toISOString()
        },
        message: "Condition evaluated to true (no conditions defined)"
      }
    }
    
    // Evaluate each condition group
    const groupResults = conditionGroups.map((group: any) => {
      const conditions = group.conditions || []
      
      if (conditions.length === 0) return true
      
      // For each condition in the group, all must be true (AND)
      return conditions.every((condition: any) => {
        const { field, operator, value } = condition
        
        // Resolve field and value from input data if they use template syntax
        const resolvedField = resolveValue(field, input)
        const resolvedValue = resolveValue(value, input)
        
        // Evaluate the condition
        const result = evaluateCondition(resolvedField, operator, resolvedValue)
        
        console.log(`Condition evaluated: ${field} ${operator} ${value} => ${result}`, {
          resolvedField,
          resolvedValue
        })
        
        return result
      })
    })
    
    // Determine final result based on condition type
    const finalResult = conditionType === "all"
      ? groupResults.every((result: boolean) => result) // All groups must be true (AND)
      : groupResults.some((result: boolean) => result)  // Any group can be true (OR)
    
    console.log(`Final condition result: ${finalResult} (${conditionType})`)
    
    return {
      success: true,
      output: {
        ...input,
        conditionResult: finalResult,
        conditionPath: finalResult ? "true" : "false",
        evaluatedAt: new Date().toISOString()
      },
      message: `Condition evaluated to ${finalResult}`
    }
  } catch (error: any) {
    console.error("If-then condition execution error:", error)
    return {
      success: false,
      message: `Condition evaluation failed: ${error.message}`,
      error: error.message
    }
  }
} 