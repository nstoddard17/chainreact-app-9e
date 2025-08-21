import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import { TriggerNodeHandlers } from "./executionHandlers/triggerHandlers"
import { ActionNodeHandlers } from "./executionHandlers/actionHandlers"
import { IntegrationNodeHandlers } from "./executionHandlers/integrationHandlers"
import { ExecutionContext } from "./workflowExecutionService"

export class NodeExecutionService {
  private triggerHandlers: TriggerNodeHandlers
  private actionHandlers: ActionNodeHandlers
  private integrationHandlers: IntegrationNodeHandlers

  constructor() {
    this.triggerHandlers = new TriggerNodeHandlers()
    this.actionHandlers = new ActionNodeHandlers()
    this.integrationHandlers = new IntegrationNodeHandlers()
  }

  async executeNode(
    node: any, 
    allNodes: any[], 
    connections: any[], 
    context: ExecutionContext
  ): Promise<any> {
    const startTime = Date.now()
    console.log(`🔧 Executing node: ${node.id} (${node.data.type})`)

    try {
      // Set current node in data flow manager and store metadata
      if (context.dataFlowManager) {
        context.dataFlowManager.setCurrentNode(node.id)
        
        // Get the outputSchema from availableNodes definition
        const nodeDefinition = ALL_NODE_COMPONENTS.find(def => def.type === node.data.type)
        const outputSchema = nodeDefinition?.outputSchema || []
        
        context.dataFlowManager.setNodeMetadata(node.id, {
          title: node.data.title || node.data.type || 'Unknown Node',
          type: node.data.type,
          outputSchema: outputSchema
        })
      }
      
      let nodeResult = await this.executeNodeByType(node, allNodes, connections, context)

      // Store result in data flow manager
      if (context.dataFlowManager && nodeResult) {
        context.dataFlowManager.setNodeData(node.id, nodeResult)
      }

      // Execute connected nodes
      await this.executeConnectedNodes(node, allNodes, connections, context, nodeResult)

      const executionTime = Date.now() - startTime
      console.log(`✅ Node ${node.id} completed in ${executionTime}ms`)

      return nodeResult

    } catch (error: any) {
      const executionTime = Date.now() - startTime
      console.error(`❌ Node ${node.id} failed after ${executionTime}ms:`, error.message)
      
      // Store error in context
      if (!context.results.errors) {
        context.results.errors = []
      }
      context.results.errors.push({
        nodeId: node.id,
        nodeType: node.data.type,
        error: error.message,
        timestamp: new Date().toISOString()
      })

      throw error
    }
  }

  private async executeNodeByType(
    node: any, 
    allNodes: any[], 
    connections: any[], 
    context: ExecutionContext
  ): Promise<any> {
    const nodeType = node.data.type

    // Route to appropriate handler based on node type
    if (this.isTriggerNode(nodeType)) {
      return await this.triggerHandlers.execute(node, context)
    }

    if (this.isActionNode(nodeType)) {
      return await this.actionHandlers.execute(node, allNodes, connections, context)
    }

    if (this.isIntegrationNode(nodeType)) {
      return await this.integrationHandlers.execute(node, context)
    }

    throw new Error(`Unknown node type: ${nodeType}`)
  }

  private async executeConnectedNodes(
    sourceNode: any, 
    allNodes: any[], 
    connections: any[], 
    context: ExecutionContext, 
    result: any
  ) {
    // Find all nodes connected to this node's output
    const connectedNodes = connections
      .filter((conn: any) => conn.source === sourceNode.id)
      .map((conn: any) => allNodes.find((node: any) => node.id === conn.target))
      .filter(Boolean)

    console.log(`🔗 Node ${sourceNode.id} has ${connectedNodes.length} connected nodes`)

    // Execute each connected node
    for (const connectedNode of connectedNodes) {
      if (connectedNode) {
        // Update context with data from previous node
        const updatedContext = {
          ...context,
          data: { ...context.data, ...result }
        }

        await this.executeNode(connectedNode, allNodes, connections, updatedContext)
      }
    }
  }

  private isTriggerNode(nodeType: string): boolean {
    const triggerTypes = [
      'webhook', 'schedule', 'manual', 'gmail_trigger_new_email', 
      'gmail_trigger_new_attachment', 'gmail_trigger_new_label',
      'google_calendar_trigger_new_event', 'google_calendar_trigger_event_updated',
      'google_calendar_trigger_event_canceled', 'google-drive:new_file_in_folder',
      'google-drive:new_folder_in_folder', 'google-drive:file_updated'
    ]
    return triggerTypes.includes(nodeType)
  }

  private isActionNode(nodeType: string): boolean {
    const actionTypes = [
      'filter', 'delay', 'conditional', 'custom_script', 'loop', 
      'ai_action_summarize', 'ai_action_extract', 'ai_action_sentiment',
      'ai_action_translate', 'ai_action_generate', 'ai_action_classify',
      'ai_agent', 'variable_set', 'variable_get', 'if_condition',
      'switch_case', 'data_transform', 'template', 'javascript',
      'try_catch', 'retry'
    ]
    return actionTypes.includes(nodeType)
  }

  private isIntegrationNode(nodeType: string): boolean {
    const integrationTypes = [
      'gmail_action_send_email', 'gmail_action_add_label',
      'slack_send_message', 'webhook_call', 'calendar_create_event',
      'sheets_append', 'sheets_read', 'sheets_update', 'send_email',
      'google_drive_create_file', 'google_drive_upload_file',
      'onedrive_upload_file', 'dropbox_upload_file',
      'google_sheets_unified', 'sheets_create_spreadsheet',
      'google_docs_create', 'google_docs_read', 'google_docs_update'
    ]
    return integrationTypes.includes(nodeType)
  }
}