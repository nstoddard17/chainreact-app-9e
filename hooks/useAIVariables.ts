/**
 * Hook for AI variables in workflow builder
 * 
 * Provides trigger-based variables and AI-generated variables
 * for use in the variable menu when AI agent is present
 */

import { useMemo } from 'react'
import { TRIGGER_VARIABLES, TriggerVariableCategory } from '@/lib/workflows/variables/triggerVariables'
import { ACTION_METADATA } from '@/lib/workflows/ai/actionMetadata'

export interface AIVariable {
  id: string
  label: string
  value: string
  description?: string
  category: 'trigger' | 'node' | 'ai' | 'system'
  icon?: string
}

export interface AIVariableGroup {
  id: string
  name: string
  icon?: string
  variables: AIVariable[]
}

/**
 * Hook to get AI variables for the current workflow context
 */
export function useAIVariables(params: {
  nodes: any[]
  currentNodeId?: string
  hasAIAgent?: boolean
}) {
  const { nodes, currentNodeId, hasAIAgent } = params

  const variableGroups = useMemo(() => {
    const groups: AIVariableGroup[] = []

    // Only show AI variables if AI agent is in workflow
    if (!hasAIAgent) {
      return groups
    }

    // Find trigger node
    const triggerNode = nodes.find(n => n.type === 'trigger' || n.data?.type?.includes('trigger'))
    
    // Add trigger variables
    if (triggerNode && TRIGGER_VARIABLES[triggerNode.data?.type]) {
      const triggerVars = TRIGGER_VARIABLES[triggerNode.data.type]
      groups.push({
        id: 'trigger',
        name: `${triggerVars.name} Trigger`,
        icon: triggerVars.icon,
        variables: triggerVars.variables.map(v => ({
          id: v.id,
          label: v.label,
          value: `{{${v.path}}}`,
          description: v.description,
          category: 'trigger' as const,
          icon: '📥'
        }))
      })
    }

    // Add previous node outputs
    const previousNodes = getPreviousNodes(nodes, currentNodeId)
    for (const node of previousNodes) {
      const nodeVariables = getNodeOutputVariables(node)
      if (nodeVariables.length > 0) {
        groups.push({
          id: `node_${node.id}`,
          name: node.data?.title || node.data?.type || 'Previous Node',
          icon: '⚙️',
          variables: nodeVariables.map(v => ({
            ...v,
            value: `{{${v.value}}}`,
            category: 'node' as const
          }))
        })
      }
    }

    // Add AI instruction variables
    groups.push({
      id: 'ai_instructions',
      name: 'AI Instructions',
      icon: '🤖',
      variables: [
        {
          id: 'ai_summarize',
          label: 'Summarize',
          value: '{{AI:summarize}}',
          description: 'Summarize the content',
          category: 'ai',
          icon: '📝'
        },
        {
          id: 'ai_extract',
          label: 'Extract Key Points',
          value: '{{AI:extract_key_points}}',
          description: 'Extract key points from content',
          category: 'ai',
          icon: '🔍'
        },
        {
          id: 'ai_generate',
          label: 'Generate Response',
          value: '{{AI:generate_response}}',
          description: 'Generate an appropriate response',
          category: 'ai',
          icon: '💬'
        },
        {
          id: 'ai_priority',
          label: 'Assess Priority',
          value: '{{AI:assess_priority}}',
          description: 'Determine priority level',
          category: 'ai',
          icon: '⚡'
        },
        {
          id: 'ai_categorize',
          label: 'Categorize',
          value: '{{AI:categorize}}',
          description: 'Categorize the content',
          category: 'ai',
          icon: '🏷️'
        },
        {
          id: 'ai_professional',
          label: 'Professional Tone',
          value: '{{AI:format_professionally}}',
          description: 'Reformat in professional tone',
          category: 'ai',
          icon: '👔'
        },
        {
          id: 'ai_casual',
          label: 'Casual Greeting',
          value: '{{AI:casual_greeting}}',
          description: 'Generate casual greeting',
          category: 'ai',
          icon: '👋'
        },
        {
          id: 'ai_next_steps',
          label: 'Next Steps',
          value: '{{AI:next_steps}}',
          description: 'Suggest next steps',
          category: 'ai',
          icon: '➡️'
        }
      ]
    })

    // Add common simple variables
    groups.push({
      id: 'simple_vars',
      name: 'Simple Variables',
      icon: '📌',
      variables: [
        {
          id: 'name',
          label: 'Name',
          value: '[name]',
          description: 'Sender/user name',
          category: 'system',
          icon: '👤'
        },
        {
          id: 'email',
          label: 'Email',
          value: '[email]',
          description: 'Email address',
          category: 'system',
          icon: '✉️'
        },
        {
          id: 'subject',
          label: 'Subject',
          value: '[subject]',
          description: 'Email/form subject',
          category: 'system',
          icon: '📋'
        },
        {
          id: 'message',
          label: 'Message',
          value: '[message]',
          description: 'Message content',
          category: 'system',
          icon: '💭'
        },
        {
          id: 'date',
          label: 'Date',
          value: '[date]',
          description: 'Current date',
          category: 'system',
          icon: '📅'
        },
        {
          id: 'time',
          label: 'Time',
          value: '[time]',
          description: 'Current time',
          category: 'system',
          icon: '🕐'
        }
      ]
    })

    return groups
  }, [nodes, currentNodeId, hasAIAgent])

  // Function to insert variable at cursor position
  const insertVariable = (
    variable: AIVariable,
    inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!inputRef.current) return

    const input = inputRef.current
    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const currentValue = input.value

    const newValue = 
      currentValue.substring(0, start) +
      variable.value +
      currentValue.substring(end)

    input.value = newValue
    
    // Trigger change event
    const event = new Event('input', { bubbles: true })
    input.dispatchEvent(event)

    // Set cursor position after inserted variable
    const newPosition = start + variable.value.length
    input.setSelectionRange(newPosition, newPosition)
    input.focus()
  }

  // Function to check if AI agent is in workflow
  const checkHasAIAgent = (nodes: any[]): boolean => {
    return nodes.some(n => 
      n.data?.type === 'ai_agent' || 
      n.data?.type === 'ai_router' ||
      n.type === 'ai_agent' ||
      n.type === 'ai_router'
    )
  }

  return {
    variableGroups,
    insertVariable,
    hasAIAgent: checkHasAIAgent(nodes)
  }
}

/**
 * Get nodes that come before the current node in the workflow
 */
function getPreviousNodes(nodes: any[], currentNodeId?: string): any[] {
  if (!currentNodeId) return []
  
  // Simple implementation - in production would need proper graph traversal
  const currentIndex = nodes.findIndex(n => n.id === currentNodeId)
  if (currentIndex === -1) return []
  
  return nodes.slice(0, currentIndex).filter(n => 
    n.data?.type && !n.data.type.includes('trigger')
  )
}

/**
 * Get output variables from a node
 */
function getNodeOutputVariables(node: any): AIVariable[] {
  const nodeType = node.data?.type
  const nodeId = node.id
  
  if (!nodeType) return []

  // Common output patterns
  const outputPatterns: Record<string, AIVariable[]> = {
    'gmail_action_send_email': [
      { id: 'message_id', label: 'Message ID', value: `node.${nodeId}.output.id` },
      { id: 'thread_id', label: 'Thread ID', value: `node.${nodeId}.output.threadId` }
    ],
    'airtable_action_create_record': [
      { id: 'record_id', label: 'Record ID', value: `node.${nodeId}.output.id` },
      { id: 'created_time', label: 'Created Time', value: `node.${nodeId}.output.createdTime` }
    ],
    'slack_action_post_message': [
      { id: 'timestamp', label: 'Message Timestamp', value: `node.${nodeId}.output.ts` },
      { id: 'channel', label: 'Channel', value: `node.${nodeId}.output.channel` }
    ],
    'ai_action_summarize': [
      { id: 'summary', label: 'Summary', value: `node.${nodeId}.output.text` }
    ],
    'ai_action_generate': [
      { id: 'generated', label: 'Generated Text', value: `node.${nodeId}.output.text` }
    ]
  }

  return outputPatterns[nodeType] || [
    { id: 'output', label: 'Output', value: `node.${nodeId}.output` }
  ]
}

/**
 * Format variable for display
 */
export function formatVariableDisplay(variable: AIVariable): string {
  const icons: Record<string, string> = {
    trigger: '📥',
    node: '⚙️',
    ai: '🤖',
    system: '📌'
  }
  
  return `${icons[variable.category] || ''} ${variable.label}`
}

/**
 * Parse variables from text
 */
export function parseVariablesFromText(text: string): string[] {
  const variables: string[] = []
  
  // Match {{variable}} pattern
  const doubleBracePattern = /\{\{([^}]+)\}\}/g
  let match
  while ((match = doubleBracePattern.exec(text)) !== null) {
    variables.push(match[0])
  }
  
  // Match [variable] pattern
  const singleBracketPattern = /\[([^\]]+)\]/g
  while ((match = singleBracketPattern.exec(text)) !== null) {
    variables.push(match[0])
  }
  
  return variables
}