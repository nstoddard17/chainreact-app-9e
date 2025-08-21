import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { ExecutionContext } from "../workflowExecutionService"
import { AIActionsService } from "../aiActionsService"

export class ActionNodeHandlers {
  private aiActionsService: AIActionsService

  constructor() {
    this.aiActionsService = new AIActionsService()
  }

  async execute(
    node: any, 
    allNodes: any[], 
    connections: any[], 
    context: ExecutionContext
  ): Promise<any> {
    const nodeType = node.data.type

    switch (nodeType) {
      case "filter":
        return await this.executeFilter(node, context)
      case "delay":
        return await this.executeDelay(node, context)
      case "conditional":
        return await this.executeConditional(node, context)
      case "custom_script":
        return await this.executeCustomScript(node, context)
      case "loop":
        return await this.executeLoop(node, allNodes, connections, context)
      case "variable_set":
        return await this.executeVariableSet(node, context)
      case "variable_get":
        return await this.executeVariableGet(node, context)
      case "if_condition":
        return await this.executeIfCondition(node, context)
      case "switch_case":
        return await this.executeSwitchCase(node, context)
      case "data_transform":
        return await this.executeDataTransform(node, context)
      case "template":
        return await this.executeTemplate(node, context)
      case "javascript":
        return await this.executeJavaScript(node, context)
      case "try_catch":
        return await this.executeTryCatch(node, allNodes, connections, context)
      case "retry":
        return await this.executeRetry(node, allNodes, connections, context)
      
      // AI Actions
      case "ai_action_summarize":
      case "ai_action_extract":
      case "ai_action_sentiment":
      case "ai_action_translate":
      case "ai_action_generate":
      case "ai_action_classify":
        return await this.aiActionsService.executeAIAction(node, context)
      case "ai_agent":
        return await this.aiActionsService.executeAIAgent(node, context)
      
      default:
        throw new Error(`Unknown action node type: ${nodeType}`)
    }
  }

  private async executeFilter(node: any, context: ExecutionContext) {
    console.log("🔍 Executing filter node")
    
    const condition = node.data.config?.condition || "true"
    const result = this.evaluateExpression(condition, context)
    
    return {
      type: "filter",
      condition,
      passed: !!result,
      data: result ? context.data : null
    }
  }

  private async executeDelay(node: any, context: ExecutionContext) {
    console.log("⏳ Executing delay node")
    
    const delayMs = Number(node.data.config?.delay || 1000)
    
    if (!context.testMode) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    
    return {
      type: "delay",
      delayMs,
      timestamp: new Date().toISOString()
    }
  }

  private async executeConditional(node: any, context: ExecutionContext) {
    console.log("❓ Executing conditional node")
    
    // TODO: Implement conditional logic
    return {
      type: "conditional",
      executed: true,
      data: context.data
    }
  }

  private async executeCustomScript(node: any, context: ExecutionContext) {
    console.log("📜 Executing custom script node")
    
    // TODO: Implement custom script logic
    return {
      type: "custom_script",
      executed: true,
      data: context.data
    }
  }

  private async executeLoop(
    node: any, 
    allNodes: any[], 
    connections: any[], 
    context: ExecutionContext
  ) {
    console.log("🔄 Executing loop node")
    
    const arrayPath = node.data.config?.array_path || "data.items"
    const itemVariable = node.data.config?.item_variable || "item"
    const maxIterations = Number.parseInt(node.data.config?.max_iterations || "100")

    const array = this.evaluateExpression(arrayPath, context)

    if (!Array.isArray(array)) {
      throw new Error("Loop target is not an array")
    }

    const results = []
    const loopConnections = connections.filter((conn: any) => conn.source === node.id)

    for (let i = 0; i < Math.min(array.length, maxIterations); i++) {
      const loopContext = {
        ...context,
        data: {
          ...context.data,
          [itemVariable]: array[i],
          index: i,
          total: array.length,
        },
      }

      // Execute connected nodes for each iteration
      for (const connection of loopConnections) {
        const targetNode = allNodes.find((n: any) => n.id === connection.target)
        if (targetNode) {
          // Note: This creates a circular dependency - would need to inject NodeExecutionService
          // For now, keeping minimal implementation
          results.push({ iteration: i, nodeId: targetNode.id })
        }
      }
    }

    return {
      type: "loop",
      array_path: arrayPath,
      item_variable: itemVariable,
      iterations: results.length,
      results,
    }
  }

  private async executeVariableSet(node: any, context: ExecutionContext) {
    console.log("📝 Executing variable set node")
    
    const variableName = node.data.config?.variable_name
    const value = this.evaluateExpression(node.data.config?.value || "", context)
    const scope = node.data.config?.scope || "workflow"

    if (!variableName) {
      throw new Error("Variable name is required")
    }

    // Store in context
    context.variables[variableName] = value

    // Store in database if workflow scope
    if (scope === "workflow") {
      const supabase = await createSupabaseRouteHandlerClient()
      await supabase.from("workflow_variables").upsert({
        workflow_id: context.workflowId,
        name: variableName,
        value,
        type: typeof value,
      })
    }

    return {
      type: "variable_set",
      variable_name: variableName,
      value,
      scope,
    }
  }

  private async executeVariableGet(node: any, context: ExecutionContext) {
    console.log("📖 Executing variable get node")
    
    const variableName = node.data.config?.variable_name
    const defaultValue = node.data.config?.default_value

    if (!variableName) {
      throw new Error("Variable name is required")
    }

    const value = context.variables[variableName] || defaultValue

    return {
      type: "variable_get",
      variable_name: variableName,
      value,
      default_value: defaultValue,
    }
  }

  private async executeIfCondition(node: any, context: ExecutionContext) {
    console.log("🤔 Executing if condition node")
    
    const condition = node.data.config?.condition || "true"
    const result = this.evaluateExpression(condition, context)
    
    return {
      type: "if_condition",
      condition,
      result: !!result,
      data: context.data
    }
  }

  private async executeSwitchCase(node: any, context: ExecutionContext) {
    console.log("🔀 Executing switch case node")
    
    const switchValue = this.evaluateExpression(node.data.config?.switch_value || "", context)
    const cases = node.data.config?.cases || []
    
    return {
      type: "switch_case",
      switch_value: switchValue,
      cases,
      data: context.data
    }
  }

  private async executeDataTransform(node: any, context: ExecutionContext) {
    console.log("🔄 Executing data transform node")
    
    const transformType = node.data.config?.transform_type || "map"
    const transformConfig = node.data.config?.transform_config || {}
    
    return {
      type: "data_transform",
      transform_type: transformType,
      transform_config: transformConfig,
      data: context.data
    }
  }

  private async executeTemplate(node: any, context: ExecutionContext) {
    console.log("📄 Executing template node")
    
    const template = node.data.config?.template || ""
    const rendered = this.renderTemplate(template, context)
    
    return {
      type: "template",
      template,
      rendered,
      data: context.data
    }
  }

  private async executeJavaScript(node: any, context: ExecutionContext) {
    console.log("⚡ Executing JavaScript node")
    
    const script = node.data.config?.script || ""
    
    try {
      // Note: In production, this should use a secure sandbox
      const result = eval(`(function(data, variables) { ${script} })`)(context.data, context.variables)
      
      return {
        type: "javascript",
        script,
        result,
        data: context.data
      }
    } catch (error: any) {
      throw new Error(`JavaScript execution error: ${error.message}`)
    }
  }

  private async executeTryCatch(
    node: any, 
    allNodes: any[], 
    connections: any[], 
    context: ExecutionContext
  ) {
    console.log("🛡️ Executing try-catch node")
    
    // TODO: Implement try-catch logic with proper error handling
    return {
      type: "try_catch",
      executed: true,
      data: context.data
    }
  }

  private async executeRetry(
    node: any, 
    allNodes: any[], 
    connections: any[], 
    context: ExecutionContext
  ) {
    console.log("🔄 Executing retry node")
    
    const maxRetries = Number(node.data.config?.max_retries || 3)
    const retryDelay = Number(node.data.config?.retry_delay || 1000)
    
    return {
      type: "retry",
      max_retries: maxRetries,
      retry_delay: retryDelay,
      data: context.data
    }
  }


  // Helper methods
  private evaluateExpression(expression: string, context: ExecutionContext): any {
    try {
      // Simple expression evaluation - in production, use a proper expression parser
      return eval(`(function(data, variables) { return ${expression}; })`)(context.data, context.variables)
    } catch (error) {
      console.warn(`Expression evaluation failed: ${expression}`, error)
      return null
    }
  }

  private renderTemplate(template: string, context: ExecutionContext): string {
    try {
      // Simple template rendering - replace {{variable}} patterns
      return template.replace(/\{\{(.+?)\}\}/g, (match, variable) => {
        const value = this.evaluateExpression(variable.trim(), context)
        return value !== null ? String(value) : match
      })
    } catch (error) {
      console.warn(`Template rendering failed: ${template}`, error)
      return template
    }
  }
}