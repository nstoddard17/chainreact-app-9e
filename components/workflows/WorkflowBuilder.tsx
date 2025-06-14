"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { v4 as uuidv4 } from "uuid"
import { useSupabaseClient } from "@supabase/auth-helpers-react"
import type { Database } from "@/lib/database.types"

interface WorkflowStep {
  id: string
  name: string
  description: string
}

const WorkflowBuilder: React.FC = () => {
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [newStepName, setNewStepName] = useState("")
  const [newStepDescription, setNewStepDescription] = useState("")
  const supabase = useSupabaseClient<Database>()

  useEffect(() => {
    // Load existing workflow steps from database (if any)
    const loadWorkflowSteps = async () => {
      try {
        // Assuming you have a table named 'workflow_steps'
        const { data, error } = await supabase.from("workflow_steps").select("*")

        if (error) {
          console.error("Error fetching workflow steps:", error)
        } else if (data) {
          setSteps(data as WorkflowStep[]) // Cast data to WorkflowStep[]
        }
      } catch (error) {
        console.error("Unexpected error fetching workflow steps:", error)
      }
    }

    loadWorkflowSteps()
  }, [supabase])

  const addStep = () => {
    if (newStepName.trim() === "") {
      alert("Step name cannot be empty.")
      return
    }

    const newStep: WorkflowStep = {
      id: uuidv4(),
      name: newStepName,
      description: newStepDescription,
    }

    setSteps([...steps, newStep])
    setNewStepName("")
    setNewStepDescription("")

    // Save the new step to the database
    const saveWorkflowStep = async () => {
      try {
        const { error } = await supabase.from("workflow_steps").insert([newStep])

        if (error) {
          console.error("Error saving workflow step:", error)
        }
      } catch (error) {
        console.error("Unexpected error saving workflow step:", error)
      }
    }

    saveWorkflowStep()
  }

  const deleteStep = (id: string) => {
    setSteps(steps.filter((step) => step.id !== id))

    // Delete the step from the database
    const deleteWorkflowStep = async () => {
      try {
        const { error } = await supabase.from("workflow_steps").delete().eq("id", id)

        if (error) {
          console.error("Error deleting workflow step:", error)
        }
      } catch (error) {
        console.error("Unexpected error deleting workflow step:", error)
      }
    }

    deleteWorkflowStep()
  }

  return (
    <div>
      <h2>Workflow Builder</h2>
      <div>
        <label htmlFor="stepName">Step Name:</label>
        <input type="text" id="stepName" value={newStepName} onChange={(e) => setNewStepName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="stepDescription">Step Description:</label>
        <textarea
          id="stepDescription"
          value={newStepDescription}
          onChange={(e) => setNewStepDescription(e.target.value)}
        />
      </div>
      <button onClick={addStep}>Add Step</button>

      <h3>Workflow Steps:</h3>
      <ul>
        {steps.map((step) => (
          <li key={step.id}>
            {step.name} - {step.description}
            <button onClick={() => deleteStep(step.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default WorkflowBuilder
