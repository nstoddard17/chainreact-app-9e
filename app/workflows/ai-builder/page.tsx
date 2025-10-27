/**
 * AI Workflow Builder Page
 *
 * Kadabra-style workflow creation with natural language prompts
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KadabraStyleWorkflowBuilder } from '@/components/workflows/ai/KadabraStyleWorkflowBuilder'
import { useAuthStore } from '@/stores/authStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { Node, Edge } from '@xyflow/react'
import { Loader2 } from 'lucide-react'

export default function AIWorkflowBuilderPage() {
  const router = useRouter()
  const { user, organization, initialized } = useAuthStore()
  const { createWorkflow } = useWorkflowStore()
  const [isCreating, setIsCreating] = useState(false)

  // Wait for auth to initialize
  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    router.push('/login')
    return null
  }

  // Handle workflow completion
  const handleWorkflowComplete = async (nodes: Node[], edges: Edge[]) => {
    try {
      setIsCreating(true)

      // Create the workflow in the database
      const workflow = await createWorkflow({
        name: 'AI Generated Workflow', // Will be updated by the AI plan name
        description: 'Created with AI Workflow Builder',
        nodes,
        edges,
        is_active: false, // User can activate it after review
        user_id: user.id,
        organization_id: organization?.id || user.id
      })

      // Navigate to the workflow builder to review and activate
      router.push(`/workflows/builder?id=${workflow.id}`)
    } catch (error) {
      console.error('Error creating workflow:', error)
      alert('Failed to create workflow. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    router.push('/workflows')
  }

  if (isCreating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Saving your workflow...</p>
        </div>
      </div>
    )
  }

  return (
    <KadabraStyleWorkflowBuilder
      userId={user.id}
      organizationId={organization?.id || user.id}
      onWorkflowComplete={handleWorkflowComplete}
      onCancel={handleCancel}
    />
  )
}
