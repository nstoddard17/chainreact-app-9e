"use client"

import { memo } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { NewWorkflowBuilderContent } from "./NewWorkflowBuilderContent"
import { TooltipProvider } from "@/components/ui/tooltip"

export const NewWorkflowBuilderClient = memo(function NewWorkflowBuilderClient() {
  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <NewWorkflowBuilderContent />
      </ReactFlowProvider>
    </TooltipProvider>
  )
})
