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
        className="bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700"
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