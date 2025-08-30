// This file contains the updates needed for the CollaborativeWorkflowBuilder.tsx
// These changes implement:
// 1. Change "Listen" button to "Test"
// 2. Change "Execute" button to "Enable"
// 3. Add test functionality with input/output panels
// 4. Visual node status indicators during testing
// 5. Enable workflow and redirect functionality

export const WORKFLOW_BUILDER_UPDATES = {
  // Button updates
  buttons: {
    test: {
      label: "Test",
      icon: "TestTube",
      tooltip: "Test the workflow",
      variant: "outline",
      onClick: "handleTestWorkflow"
    },
    enable: {
      label: "Enable",
      icon: "Zap",
      tooltip: "Enable workflow and return to dashboard",
      variant: "default",
      onClick: "handleEnableWorkflow"
    }
  },

  // New handler functions to add
  handlers: `
  // Test workflow handler
  const handleTestWorkflow = async () => {
    if (isTestMode) {
      // Stop test mode
      setIsTestMode(false)
      setTestingNodeId(null)
      setNodeExecutionStatus({})
      toast({
        title: "Test Mode Stopped",
        description: "Workflow testing has been stopped."
      })
      return
    }

    try {
      setIsTestMode(true)
      
      // Find trigger node
      const triggerNode = nodes.find(n => n.data?.isTrigger)
      if (!triggerNode) {
        throw new Error("No trigger found in workflow")
      }

      // Set trigger to listening state
      setNodeExecutionStatus({
        [triggerNode.id]: 'listening'
      })

      // For user-activated triggers, start immediately
      if (triggerNode.data.type === 'user_activated_trigger') {
        // Execute workflow immediately
        await executeTestWorkflow(triggerNode.id)
      } else {
        // Wait for webhook/trigger activation
        toast({
          title: "Waiting for Trigger",
          description: getWaitingMessage(triggerNode.data.type)
        })
        
        // Setup webhook listener
        await setupWebhookListener(triggerNode)
      }
    } catch (error) {
      console.error("Test failed:", error)
      toast({
        title: "Test Failed",
        description: error.message,
        variant: "destructive"
      })
      setIsTestMode(false)
    }
  }

  // Enable workflow and redirect
  const handleEnableWorkflow = async () => {
    try {
      setIsEnabling(true)
      
      // Save workflow first
      await handleSave()
      
      // Update workflow status to active
      const { error } = await supabase
        .from('workflows')
        .update({ 
          status: 'active',
          is_enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', workflowId)
      
      if (error) throw error
      
      toast({
        title: "Workflow Enabled",
        description: "Your workflow is now active and running."
      })
      
      // Redirect to workflows page
      setTimeout(() => {
        router.push('/workflows')
      }, 1000)
      
    } catch (error) {
      console.error("Failed to enable workflow:", error)
      toast({
        title: "Failed to Enable",
        description: "Could not enable the workflow. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsEnabling(false)
    }
  }

  // Execute test workflow from a specific node
  const executeTestWorkflow = async (startNodeId: string, inputData?: any) => {
    try {
      const executionPath = []
      let currentNodeId = startNodeId
      let currentData = inputData
      
      while (currentNodeId) {
        // Update node status to running
        setNodeExecutionStatus(prev => ({
          ...prev,
          [currentNodeId]: 'running'
        }))
        
        // Get node configuration
        const node = nodes.find(n => n.id === currentNodeId)
        if (!node) break
        
        // Execute node (simulate or real execution)
        const result = await executeNode(node, currentData)
        
        // Store result for display
        setNodeTestResults(prev => ({
          ...prev,
          [currentNodeId]: {
            input: currentData,
            output: result.output,
            executionTime: result.executionTime,
            logs: result.logs
          }
        }))
        
        // Update node status
        setNodeExecutionStatus(prev => ({
          ...prev,
          [currentNodeId]: result.success ? 'completed' : 'error'
        }))
        
        if (!result.success) {
          throw new Error(result.error || 'Node execution failed')
        }
        
        // Special handling for AI Router - multiple outputs
        if (node.data.type === 'ai_router' && result.selectedPaths) {
          // Execute each selected path
          for (const pathId of result.selectedPaths) {
            const edge = edges.find(e => e.source === currentNodeId && e.sourceHandle === \`output-\${pathId}\`)
            if (edge) {
              await executeTestWorkflow(edge.target, result.output)
            }
          }
          break // AI Router handles its own branching
        }
        
        // Find next node
        const nextEdge = edges.find(e => e.source === currentNodeId)
        currentNodeId = nextEdge?.target || null
        currentData = result.output
      }
      
    } catch (error) {
      console.error("Workflow execution error:", error)
      toast({
        title: "Execution Error",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Get waiting message based on trigger type
  const getWaitingMessage = (triggerType: string) => {
    if (triggerType.includes('discord')) {
      return "Send a message in your Discord channel to trigger the workflow"
    }
    if (triggerType.includes('email') || triggerType.includes('gmail')) {
      return "Send an email to trigger the workflow"
    }
    if (triggerType.includes('webhook')) {
      return "Send a request to your webhook URL to trigger the workflow"
    }
    if (triggerType.includes('slack')) {
      return "Send a message in your Slack channel to trigger the workflow"
    }
    return "Activate the trigger to start the test"
  }
  `,

  // New state variables to add
  state: `
  const [isTestMode, setIsTestMode] = useState(false)
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null)
  const [nodeExecutionStatus, setNodeExecutionStatus] = useState<Record<string, 'listening' | 'running' | 'completed' | 'error'>>({})
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, any>>({})
  const [isEnabling, setIsEnabling] = useState(false)
  const [testPanelNode, setTestPanelNode] = useState<string | null>(null)
  `,

  // Custom node updates for visual status
  customNodeUpdates: `
  // In the custom node data preparation
  executionStatus: nodeExecutionStatus[node.id] || null,
  isListening: isTestMode && nodeExecutionStatus[node.id] === 'listening',
  isRunning: nodeExecutionStatus[node.id] === 'running',
  isCompleted: nodeExecutionStatus[node.id] === 'completed',
  hasError: nodeExecutionStatus[node.id] === 'error',
  testData: nodeTestResults[node.id],
  onTest: (nodeId) => {
    setTestPanelNode(nodeId)
    if (!isTestMode) {
      handleTestWorkflow()
    } else {
      // Execute up to this node
      executeTestToNode(nodeId)
    }
  }
  `,

  // Test panel component to add
  testPanel: `
  {testPanelNode && nodeTestResults[testPanelNode] && (
    <TestPanel
      nodeId={testPanelNode}
      nodeType={nodes.find(n => n.id === testPanelNode)?.data?.type || ''}
      nodeTitle={nodes.find(n => n.id === testPanelNode)?.data?.title || ''}
      isVisible={true}
      onClose={() => setTestPanelNode(null)}
      onTest={() => executeTestToNode(testPanelNode)}
      testStatus={nodeExecutionStatus[testPanelNode] || 'idle'}
      inputData={nodeTestResults[testPanelNode]?.input}
      outputData={nodeTestResults[testPanelNode]?.output}
      error={nodeTestResults[testPanelNode]?.error}
      executionTime={nodeTestResults[testPanelNode]?.executionTime}
      logs={nodeTestResults[testPanelNode]?.logs}
    />
  )}
  `
}