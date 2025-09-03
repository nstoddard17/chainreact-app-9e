import React from 'react'
import { Plus } from 'lucide-react'

interface EmptyWorkflowStateProps {
  onAddTrigger: () => void
}

export function EmptyWorkflowState({ onAddTrigger }: EmptyWorkflowStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center max-w-md flex flex-col items-center">
        <div 
          className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-6 cursor-pointer hover:border-muted-foreground hover:shadow-sm transition-all"
          onClick={onAddTrigger}
        >
          <Plus className="h-10 w-10 text-muted-foreground hover:text-foreground" />
        </div>
        <h2 className="text-[32px] font-bold mb-2">Start your Chain</h2>
        <p className="text-muted-foreground mb-8 text-center leading-relaxed text-lg">
          Chains start with a trigger – an event that kicks off<br />
          your workflow
        </p>
        <button 
          onClick={onAddTrigger}
          className="bg-primary text-primary-foreground px-8 py-3 rounded-md hover:bg-primary/90 transition-colors font-medium text-lg shadow-sm hover:shadow"
        >
          Choose a trigger
        </button>
      </div>
    </div>
  )
}