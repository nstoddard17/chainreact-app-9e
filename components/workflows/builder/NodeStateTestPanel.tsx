/**
 * NodeStateTestPanel.tsx
 *
 * Temporary testing utility for Phase 1 of AI Agent Rebuild
 * Allows easy testing of all node states without console manipulation
 *
 * TO USE:
 * 1. Import this component in WorkflowBuilderV2.tsx
 * 2. Add <NodeStateTestPanel /> somewhere in the JSX
 * 3. Use the buttons to add test nodes with different states
 * 4. Remove this component after Phase 1 testing is complete
 */

'use client'

import React, { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { NodeState, CustomNodeData } from '@/components/workflows/CustomNode'
import { HandleDesignTester } from './HandleDesignTester'

export function NodeStateTestPanel() {
  const { addNodes, getNodes, setNodes } = useReactFlow()
  const [isOpen, setIsOpen] = useState(false)
  const [showHandleDesigns, setShowHandleDesigns] = useState(false)

  const addTestNode = (state: NodeState) => {
    const existingNodes = getNodes()
    const nodeCount = existingNodes.length

    // Position new nodes in a grid
    const col = nodeCount % 3
    const row = Math.floor(nodeCount / 3)

    // Different provider icons for variety
    const providers = ['gmail', 'slack', 'discord', 'notion', 'airtable']
    const provider = providers[nodeCount % providers.length]

    const testData: Record<NodeState, Partial<CustomNodeData>> = {
      skeleton: {
        state: 'skeleton',
        description: 'This node is being built by the AI agent...',
        providerId: provider,
      },
      ready: {
        state: 'ready',
        description: 'Node is configured and ready to run',
        providerId: provider,
      },
      running: {
        state: 'running',
        description: 'Currently executing this workflow step',
        providerId: provider,
        preview: {
          title: 'Processing',
          content: ['Sending request to API...', 'Waiting for response...', 'Parsing results...']
        }
      },
      passed: {
        state: 'passed',
        description: 'Successfully completed execution',
        providerId: provider,
        preview: {
          title: 'Results',
          content: [
            'Found 42 matching records',
            'Total execution time: 1.2s',
            'Memory used: 15.3 MB',
            'API calls: 3 requests'
          ]
        }
      },
      failed: {
        state: 'failed',
        description: 'Execution failed with error',
        providerId: provider,
        preview: {
          title: 'Error Details',
          content: 'API request timed out after 30 seconds. Please check your network connection and try again.'
        }
      }
    }

    const newNode = {
      id: `test-node-${Date.now()}`,
      type: 'custom',
      position: {
        x: 100 + (col * 350),
        y: 100 + (row * 250)
      },
      data: {
        title: `${state.charAt(0).toUpperCase() + state.slice(1)} Node`,
        description: testData[state].description || 'Test node',
        type: 'test',
        icon: null,
        onConfigure: () => {},
        onDelete: () => {},
        ...testData[state]
      } as CustomNodeData
    }

    addNodes([newNode])
  }

  const clearAllNodes = () => {
    setNodes([])
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 20px',
          background: 'hsl(217 91% 60%)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}
      >
        🧪 Test Node States
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '16px',
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        zIndex: 1000,
        minWidth: '280px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Node State Tester</h3>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: '0 0 12px 0' }}>
        Click to add test nodes with different states:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={() => addTestNode('skeleton')}
          style={{
            padding: '8px 12px',
            background: 'hsl(var(--muted))',
            color: 'hsl(var(--muted-foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Add Skeleton Node
        </button>

        <button
          onClick={() => addTestNode('ready')}
          style={{
            padding: '8px 12px',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Add Ready Node
        </button>

        <button
          onClick={() => addTestNode('running')}
          style={{
            padding: '8px 12px',
            background: 'hsl(217 91% 60% / 0.1)',
            color: 'hsl(217 91% 60%)',
            border: '1px solid hsl(217 91% 60% / 0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Add Running Node
        </button>

        <button
          onClick={() => addTestNode('passed')}
          style={{
            padding: '8px 12px',
            background: 'hsl(142 76% 36% / 0.1)',
            color: 'hsl(142 76% 36%)',
            border: '1px solid hsl(142 76% 36% / 0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Add Passed Node
        </button>

        <button
          onClick={() => addTestNode('failed')}
          style={{
            padding: '8px 12px',
            background: 'hsl(var(--destructive) / 0.1)',
            color: 'hsl(var(--destructive))',
            border: '1px solid hsl(var(--destructive) / 0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Add Failed Node
        </button>

        <div style={{ height: '8px', borderTop: '1px solid hsl(var(--border))', margin: '8px 0' }} />

        <button
          onClick={clearAllNodes}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            color: 'hsl(var(--muted-foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Clear All Test Nodes
        </button>

        <button
          onClick={() => setShowHandleDesigns(true)}
          style={{
            padding: '8px 12px',
            background: 'hsl(var(--primary) / 0.1)',
            color: 'hsl(var(--primary))',
            border: '1px solid hsl(var(--primary) / 0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          🎨 View Handle Designs
        </button>
      </div>

      <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', margin: '12px 0 0 0', fontStyle: 'italic' }}>
        Remove this component after testing Phase 1
      </p>

      {/* Handle Design Tester Modal */}
      {showHandleDesigns && (
        <HandleDesignTester onClose={() => setShowHandleDesigns(false)} />
      )}
    </div>
  )
}
