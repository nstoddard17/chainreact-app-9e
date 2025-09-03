import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Save, Play, ArrowLeft, Ear, RefreshCw } from 'lucide-react'

interface WorkflowToolbarProps {
  workflowName: string
  setWorkflowName: (name: string) => void
  hasUnsavedChanges: boolean
  isSaving: boolean
  isExecuting: boolean
  listeningMode: boolean
  getWorkflowStatus: () => { text: string; variant: "default" | "secondary" | "outline" | "destructive" }
  handleSave: () => Promise<void>
  handleExecute: () => void
  handleResetLoadingStates: () => void
  handleNavigation: (href: string) => void
}

export function WorkflowToolbar({
  workflowName,
  setWorkflowName,
  hasUnsavedChanges,
  isSaving,
  isExecuting,
  listeningMode,
  getWorkflowStatus,
  handleSave,
  handleExecute,
  handleResetLoadingStates,
  handleNavigation,
}: WorkflowToolbarProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      <div className="flex justify-between items-start p-4 pointer-events-auto">
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleNavigation("/workflows")} 
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col space-y-1 flex-1 min-w-0">
            <Input 
              value={workflowName} 
              onChange={(e) => setWorkflowName(e.target.value)} 
              onBlur={handleSave} 
              className="text-xl font-semibold !border-none !outline-none !ring-0 p-0 bg-transparent w-auto min-w-[200px] max-w-full" 
              style={{ 
                boxShadow: "none",
                width: `${Math.max(200, (workflowName?.length || 0) * 10 + 20)}px`
              }}
              placeholder="Untitled Workflow"
              title={workflowName || "Untitled Workflow"}
            />
          </div>
        </div>
        
        <div className="flex items-center space-x-2 flex-shrink-0">
          <Badge variant={getWorkflowStatus().variant}>{getWorkflowStatus().text}</Badge>
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Unsaved Changes
            </Badge>
          )}
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleSave} disabled={isSaving || isExecuting} variant="secondary">
                  {isSaving ? <LightningLoader size="md" className="mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                  Save
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save your workflow</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={listeningMode ? "destructive" : "outline"} 
                  onClick={handleExecute} 
                  disabled={(isExecuting && !listeningMode) || isSaving}
                  size="sm"
                >
                  {isExecuting && !listeningMode ? (
                    <LightningLoader size="sm" className="mr-1" />
                  ) : listeningMode ? (
                    <Ear className="w-4 h-4 mr-1" />
                  ) : (
                    <Play className="w-4 h-4 mr-1" />
                  )}
                  {listeningMode ? "Stop Listening" : "Listen"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{listeningMode ? "Stop listening for webhook triggers" : "Listen for webhook triggers in real-time"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleExecute} disabled={isSaving || isExecuting} variant="default">
                  {isExecuting ? <LightningLoader size="md" className="mr-2" /> : <Play className="w-5 h-5 mr-2" />}
                  Execute
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Execute the workflow</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Emergency reset button */}
          {(isSaving || isExecuting) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleResetLoadingStates}
                    variant="outline" 
                    size="sm"
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset stuck loading states</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  )
}