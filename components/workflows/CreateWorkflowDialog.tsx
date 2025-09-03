"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import WorkflowDialog from "./WorkflowDialog"

export default function CreateWorkflowDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button 
        onClick={() => setOpen(true)}
        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
      >
        <Plus className="w-4 h-4 mr-2" />
        Create Workflow
      </Button>
      <WorkflowDialog 
        open={open} 
        onOpenChange={setOpen}
        workflow={null}
      />
    </>
  )
}