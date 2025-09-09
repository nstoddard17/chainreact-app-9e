import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { TriggerNodeHandlers } from "./executionHandlers/triggerHandlers"
import { ActionNodeHandlers } from "./executionHandlers/actionHandlers"
import { IntegrationNodeHandlers } from "./executionHandlers/integrationHandlers"
import { ExecutionContext } from "./workflowExecutionService"

export class NodeExecutionService {
  // Force recompilation - Gmail actions added
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
      
      console.log(`🔄 [NodeExecution] Raw result from ${node.id} (${node.data.type}):`, {
        hasResult: !!nodeResult,
        resultKeys: nodeResult ? Object.keys(nodeResult) : [],
        hasOutput: !!nodeResult?.output,
        outputKeys: nodeResult?.output ? Object.keys(nodeResult.output) : []
      })

      // If in test mode and this is an action that would send data externally,
      // wrap the result with intercepted metadata
      if (context.testMode && this.isExternalAction(node.data.type) && nodeResult) {
        nodeResult = {
          ...nodeResult,
          intercepted: {
            type: node.data.type,
            config: node.data.config || {},
            wouldHaveSent: nodeResult,
            nodeId: node.id,
            nodeName: node.data.title || node.data.type
          }
        }
      }

      // Store result in data flow manager
      if (context.dataFlowManager && nodeResult) {
        context.dataFlowManager.setNodeOutput(node.id, nodeResult)
      }
      
      // For integration nodes that return an output object, pass the output directly
      // This ensures the next node receives the actual data, not the wrapper
      const dataToPass = nodeResult?.output || nodeResult

      // Execute connected nodes
      await this.executeConnectedNodes(node, allNodes, connections, context, dataToPass)

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
    // Validate node structure
    if (!node || !node.data) {
      console.error('Invalid node structure:', node)
      throw new Error(`Invalid node structure: missing data property`)
    }

    const nodeType = node.data.type

    // Check if node type is defined
    if (!nodeType) {
      console.error('Node missing type:', {
        nodeId: node.id,
        nodeData: node.data
      })
      throw new Error(`Node ${node.id} is missing a type. Please configure the node properly.`)
    }

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
    console.log(`📌 Original context userId: ${context.userId}`)
    
    // Debug log the result being passed
    console.log(`📊 [Data Flow] Result from ${sourceNode.id} (${sourceNode.data.type}):`, {
      hasResult: !!result,
      resultKeys: result ? Object.keys(result) : [],
      hasEmails: result?.emails ? result.emails.length : 0,
      hasMessages: result?.messages ? result.messages.length : 0,
      firstEmail: result?.emails?.[0] ? {
        from: result.emails[0].from,
        subject: result.emails[0].subject,
        hasBody: !!result.emails[0].body
      } : null
    })

    // Execute each connected node
    for (const connectedNode of connectedNodes) {
      if (connectedNode) {
        // Update context with data from previous node
        const updatedContext: ExecutionContext = {
          ...context,
          data: { ...context.data, ...result }
        }
        
        console.log(`📌 Updated context userId for node ${connectedNode.id}: ${updatedContext.userId}`)
        console.log(`📊 [Data Flow] Context data for ${connectedNode.id} (${connectedNode.data.type}):`, {
          dataKeys: Object.keys(updatedContext.data),
          hasEmails: !!updatedContext.data.emails,
          hasMessages: !!updatedContext.data.messages,
          emailCount: updatedContext.data.emails?.length || 0
        })
        
        if (!updatedContext.userId) {
          console.error('❌ userId lost when creating updatedContext!')
          console.error('Original context userId:', context.userId)
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
      'gmail_action_send_email', 'gmail_action_search_email', 'gmail_action_fetch_message',
      'gmail_action_add_label', 'gmail_send',
      'slack_send_message', 'webhook_call', 'calendar_create_event',
      'sheets_append', 'sheets_read', 'sheets_update', 'send_email',
      'google_drive_create_file', 'google_drive_upload_file',
      'onedrive_upload_file', 'dropbox_upload_file',
      'google_sheets_unified', 'sheets_create_spreadsheet',
      'google_docs_create', 'google_docs_read', 'google_docs_update',
      'google_docs_action_create_document', 'google_docs_action_update_document',
      'google_docs_action_share_document', 'google_docs_action_get_document',
      'google_docs_action_export_document',
      'google_calendar_action_create_event', 'google_calendar_action_update_event',
      'google_calendar_action_delete_event',
      'google_sheets_action_create_spreadsheet', 'google_sheets_unified_action',
      'google_sheets_action_create_row', 'google_sheets_action_update_row',
      'google_sheets_action_delete_row', 'google_sheets_action_list_rows'
    ]
    return integrationTypes.includes(nodeType)
  }

  private isExternalAction(nodeType: string): boolean {
    // Actions that would send data externally (should be intercepted in sandbox mode)
    const externalActions = [
      'gmail_action_send_email', 'gmail_action_add_label', 'gmail_action_remove_label',
      'gmail_action_mark_read', 'gmail_action_mark_unread', 'gmail_action_archive',
      'gmail_action_delete', 'gmail_send',
      'slack_send_message', 'discord_send_message', 'teams_send_message',
      'webhook_call', 'calendar_create_event',
      'sheets_append', 'sheets_update', 'sheets_create_spreadsheet',
      'google_drive_create_file', 'google_drive_upload_file',
      'onedrive_upload_file', 'dropbox_upload_file',
      'google_docs_create', 'google_docs_update',
      'google_calendar_action_create_event', 'google_calendar_action_update_event',
      'google_calendar_action_delete_event',
      'google_sheets_action_create_spreadsheet', 'google_sheets_unified_action',
      'google_sheets_action_create_row', 'google_sheets_action_update_row',
      'google_sheets_action_delete_row',
      'notion_create_page', 'notion_update_page', 'airtable_create_record',
      'airtable_update_record', 'hubspot_create_contact', 'stripe_create_charge'
    ]
    return externalActions.includes(nodeType)
  }
}