"use client"

import { memo } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import CollaborativeWorkflowBuilder from "@/components/workflows/CollaborativeWorkflowBuilder"

const WorkflowBuilderClient = memo(function WorkflowBuilderClient() {
  return (
    <ReactFlowProvider>
      <CollaborativeWorkflowBuilder />
    </ReactFlowProvider>
  )
})

export default WorkflowBuilderClient
