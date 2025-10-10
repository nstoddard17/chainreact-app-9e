import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { saveNodeConfig, clearNodeConfig, loadNodeConfig } from '@/lib/workflows/configPersistence'
import type { NodeComponent } from '@/lib/workflows/nodes'
import type { Node } from '@xyflow/react'

interface IntegrationInfo {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

interface ConfiguringNode {
  id: string
  integration: any
  nodeComponent: NodeComponent
  config: Record<string, any>
}

interface PendingNode {
  type: 'trigger' | 'action'
  integration: IntegrationInfo
  nodeComponent: NodeComponent
  sourceNodeInfo?: { 
    id: string
    parentId: string
    insertBefore?: string
  }
}

export function useNodeConfiguration(
  currentWorkflowId: string | undefined,
  nodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>,
  edges?: any[],
  setEdges?: React.Dispatch<React.SetStateAction<any[]>>
) {
  const { toast } = useToast()
  const [configuringNode, setConfiguringNode] = useState<ConfiguringNode | null>(null)
  const [pendingNode, setPendingNodeInternal] = useState<PendingNode | null>(null)

  // Wrapper to log pending node changes
  const setPendingNode = useCallback((node: PendingNode | null) => {
    console.log('🔷 [useNodeConfiguration] Setting pendingNode:', {
      node,
      sourceNodeInfo: node?.sourceNodeInfo,
      sourceNodeInfoKeys: node?.sourceNodeInfo ? Object.keys(node.sourceNodeInfo) : []
    })
    setPendingNodeInternal(node)
  }, [])
  const [aiAgentActionCallback, setAiAgentActionCallback] = useState<((nodeType: string, providerId: string, config?: any) => void) | null>(null)

  const nodeNeedsConfiguration = useCallback((nodeComponent: NodeComponent): boolean => {
    // Check if the node has a configuration schema
    const hasConfigSchema = !!(nodeComponent.configSchema && nodeComponent.configSchema.length > 0)

    // Node needs configuration if it has a config schema
    // This applies to both triggers and actions
    return hasConfigSchema
  }, [])

  const handleSaveConfiguration = useCallback(async (
    context: { id: string },
    newConfig: Record<string, any>,
    onTriggerAdd?: (integration: IntegrationInfo, nodeComponent: NodeComponent, config: Record<string, any>) => void,
    onActionAdd?: (integration: IntegrationInfo, nodeComponent: NodeComponent, config: Record<string, any>, sourceNodeInfo: any) => string | undefined,
    onSave?: () => Promise<void>
  ) => {
    // Extract dynamicOptions and validationState from the config (if included)
    const { __dynamicOptions, __validationState, ...actualConfig } = newConfig
    if (context.id === 'pending-trigger' && pendingNode?.type === 'trigger') {
      // Add trigger to workflow with configuration
      if (onTriggerAdd) {
        onTriggerAdd(pendingNode.integration, pendingNode.nodeComponent, newConfig)
      }
      
      // Auto-save the workflow
      setTimeout(async () => {
        try {
          if (onSave) {
            await onSave()
            console.log('New trigger saved to database automatically')
          }
        } catch (error) {
          console.error(' Failed to save new trigger to database:', error)
          toast({ 
            title: "Save Warning", 
            description: "Trigger added but failed to save to database. Please save manually.", 
            variant: "destructive" 
          })
        }
      }, 0)
      
      setPendingNode(null)
      setConfiguringNode(null)
      toast({ title: "Trigger Added", description: "Your trigger has been configured and added to the workflow." })
    } else if (context.id === 'pending-action' && pendingNode?.type === 'action' && pendingNode.sourceNodeInfo) {
      // Add action to workflow with configuration
      console.log('🔵 [useNodeConfiguration] Processing pending action with sourceNodeInfo:', pendingNode.sourceNodeInfo)
      let newNodeId: string | undefined
      if (onActionAdd) {
        console.log('🔵 [useNodeConfiguration] Calling onActionAdd with:', {
          integration: pendingNode.integration?.name,
          nodeComponent: pendingNode.nodeComponent?.type,
          sourceNodeInfo: pendingNode.sourceNodeInfo
        })
        newNodeId = onActionAdd(pendingNode.integration, pendingNode.nodeComponent, newConfig, pendingNode.sourceNodeInfo)
        console.log('🔵 [useNodeConfiguration] onActionAdd returned newNodeId:', newNodeId)
      } else {
        console.warn('🔵 [useNodeConfiguration] onActionAdd is not defined!')
      }
      
      // Auto-save the workflow after adding any node (regular or inserted)
      // Use a longer delay for inserted nodes to ensure proper state integration
      const isInsertedNode = pendingNode.sourceNodeInfo?.insertBefore !== undefined
      const saveDelay = isInsertedNode ? 500 : 100 // Longer delay for inserted nodes

      setTimeout(async () => {
        try {
          if (onSave) {
            await onSave()
            console.log(isInsertedNode ? ' Inserted action saved to database automatically' : ' New action saved to database automatically')

            // Save node configuration to persistence
            if (newNodeId && currentWorkflowId) {
              try {
                const nodeType = pendingNode.nodeComponent.type || 'unknown'
                await saveNodeConfig(currentWorkflowId, newNodeId, nodeType, newConfig)
                console.log(' Node configuration saved to persistence layer')
              } catch (persistenceError) {
                console.error(' Failed to save node configuration:', persistenceError)
              }
            }
          }
        } catch (error) {
          console.error(' Failed to save action to database:', error)
          toast({
            title: "Save Warning",
            description: "Action added but failed to save to database. Please save manually.",
            variant: "destructive"
          })
        }
      }, saveDelay)
      
      setPendingNode(null)
      setConfiguringNode(null)
      toast({ title: "Action Added", description: "Your action has been configured and added to the workflow." })
    } else {
      // Handle existing node configuration updates
      console.log(' Updating existing node configuration')

      // Update the node configuration without handling chains here
      // Chains will be handled in the CollaborativeWorkflowBuilder
      setNodes((nds) => nds.map((node) => {
        if (node.id === context.id) {
          // Check if this is an AI Agent node with chains
          const isAIAgent = node.data?.type === 'ai_agent'
          const chainsArray = Array.isArray(actualConfig?.chains) ? actualConfig.chains : actualConfig?.chains?.chains
          const hasChains = chainsArray && Array.isArray(chainsArray) && chainsArray.length > 0

          // Build updated node data
          const updatedData = {
            ...node.data,
            config: actualConfig,
            ...((__dynamicOptions && Object.keys(__dynamicOptions).length > 0) ? { savedDynamicOptions: __dynamicOptions } : {}),
            ...((__validationState) ? { validationState: __validationState } : {})
          }

          // Update AI Agent chain metadata but keep onAddChain button for adding more chains
          if (isAIAgent) {
            const updatedDataAny = updatedData as any;
            updatedDataAny.hasChains = hasChains;
            updatedDataAny.chainCount = chainsArray.length;
            // Keep onAddChain so users can add multiple chains
            console.log('AI Agent has', chainsArray.length, 'chains, keeping onAddChain button');
          }

          return { ...node, data: updatedData }
        }
        return node
      }))

      // Don't mark as unsaved since we're auto-saving below
      // setHasUnsavedChanges(true)

      // Show success message
      toast({
        title: "Configuration Updated",
        description: "Node configuration saved automatically."
      })
      
      // Save to persistence layer
      if (currentWorkflowId && context.id) {
        try {
          const currentNode = nodes.find(node => node.id === context.id)
          const nodeType = currentNode?.data?.type || 'unknown'
          
          await saveNodeConfig(currentWorkflowId, context.id, nodeType as string, newConfig)
          console.log(' Node configuration saved to persistence layer')
        } catch (persistenceError) {
          console.error(' Failed to save node configuration:', persistenceError)
        }
      }
      
      // Auto-save to database
      setTimeout(async () => {
        try {
          if (onSave) {
            await onSave()
            console.log(' Updated workflow saved to database')
          }
        } catch (error) {
          console.error(' Failed to save updated workflow:', error)
        }
      }, 100)
      
      setConfiguringNode(null)
    }
  }, [currentWorkflowId, nodes, setNodes, setHasUnsavedChanges, pendingNode, toast])

  const loadNodeConfiguration = useCallback(async (nodeId: string): Promise<Record<string, any> | null> => {
    if (!currentWorkflowId) return null
    
    try {
      const node = nodes.find(n => n.id === nodeId)
      const nodeType = node?.data?.type || 'unknown'
      const config = await loadNodeConfig(currentWorkflowId, nodeId, nodeType as string)
      return config
    } catch (error) {
      console.error('Failed to load node configuration:', error)
      return null
    }
  }, [currentWorkflowId, nodes])

  const clearNodeConfiguration = useCallback(async (nodeId: string) => {
    if (!currentWorkflowId) return
    
    try {
      const node = nodes.find(n => n.id === nodeId)
      const nodeType = node?.data?.type || 'unknown'
      await clearNodeConfig(currentWorkflowId, nodeId, nodeType as string)
    } catch (error) {
      console.error('Failed to clear node configuration:', error)
    }
  }, [currentWorkflowId, nodes])

  return {
    configuringNode,
    setConfiguringNode,
    pendingNode,
    setPendingNode,
    aiAgentActionCallback,
    setAiAgentActionCallback,
    nodeNeedsConfiguration,
    handleSaveConfiguration,
    loadNodeConfiguration,
    clearNodeConfiguration,
  }
}