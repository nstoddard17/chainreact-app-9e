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
        // Convert the result to the format expected by DataFlowManager
        // Actions return { success, output, message } but DataFlowManager expects { success, data }
        const nodeOutput = {
          success: nodeResult.success !== undefined ? nodeResult.success : true,
          data: nodeResult.output || nodeResult.data || nodeResult,
          metadata: {
            timestamp: new Date(),
            nodeType: node.data.type,
            executionTime: Date.now() - startTime
          }
        }
        context.dataFlowManager.setNodeOutput(node.id, nodeOutput)
        console.log(`💾 Stored output for node ${node.id}:`, {
          success: nodeOutput.success,
          dataKeys: nodeOutput.data ? Object.keys(nodeOutput.data) : 'no data'
        })
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

    // Execute each connected node
    for (const connectedNode of connectedNodes) {
      if (connectedNode) {
        // Update context with data from previous node
        const updatedContext: ExecutionContext = {
          ...context,
          data: { ...context.data, ...result }
        }
        
        console.log(`📌 Updated context userId for node ${connectedNode.id}: ${updatedContext.userId}`)
        
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
    // Check for integration prefixes (more flexible than exact matches)
    const integrationPrefixes = [
      'gmail_', 'slack_', 'discord_', 'teams_', 
      'google_', 'google-', // Handle both google_ and google- formats
      'sheets_', 'calendar_', 'docs_',
      'onedrive_', 'dropbox_', 'notion_',
      'airtable_', 'hubspot_', 'stripe_',
      'twitter_', 'facebook_', 'linkedin_',
      'instagram_', 'youtube_', 'trello_',
      'microsoft_', 'outlook_', 'onenote_'
    ]
    
    // Check if node type starts with any integration prefix
    if (integrationPrefixes.some(prefix => nodeType.startsWith(prefix))) {
      return true
    }
    
    // Also check for specific integration types that don't follow prefix pattern
    const specificTypes = [
      'webhook_call', 'send_email', 'webhook', 'email'
    ]
    
    return specificTypes.includes(nodeType)
  }

  private isExternalAction(nodeType: string): boolean {
    // Actions that would send data externally (should be intercepted in sandbox mode)
    
    // Check for action keywords that indicate external operations
    const externalKeywords = [
      'send', 'create', 'upload', 'update', 'delete', 'append',
      'write', 'post', 'publish', 'share', 'export', 'archive'
    ]
    
    // Check if the node type contains any external action keyword
    const hasExternalKeyword = externalKeywords.some(keyword => 
      nodeType.toLowerCase().includes(keyword)
    )
    
    // Also check specific prefixes that are always external
    const externalPrefixes = [
      'gmail_action_', 'slack_', 'discord_', 'teams_',
      'google-drive:', 'google_drive_', 'google-docs:', 'google_docs_',
      'google-calendar:', 'google_calendar_', 'google-sheets:', 'google_sheets_',
      'onedrive_', 'dropbox_', 'webhook'
    ]
    
    const hasExternalPrefix = externalPrefixes.some(prefix => 
      nodeType.startsWith(prefix)
    )
    
    // Exclude certain read-only operations
    const readOnlyKeywords = ['fetch', 'get', 'read', 'list', 'search', 'find']
    const isReadOnly = readOnlyKeywords.some(keyword => 
      nodeType.toLowerCase().includes(keyword)
    )
    
    return (hasExternalKeyword || hasExternalPrefix) && !isReadOnly
  }
}