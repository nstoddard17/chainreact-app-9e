"use client"

import { ReactFlowProvider } from "@xyflow/react"
import CollaborativeWorkflowBuilder from "@/components/workflows/CollaborativeWorkflowBuilder"

export default function WorkflowBuilderClient() {
  return (
    <ReactFlowProvider>
      <CollaborativeWorkflowBuilder />
    </ReactFlowProvider>
  )
}
