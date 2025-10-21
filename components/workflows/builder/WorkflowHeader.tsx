"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Undo2,
  Redo2,
  MoreVertical,
  History,
  GitBranch,
  Play,
  TestTube,
  Power,
  PowerOff,
  Loader2,
  Eye,
  Download,
  Upload,
  Trash2,
  Copy,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { OrganizationSwitcher } from "@/components/new-design/OrganizationSwitcher"

interface WorkflowHeaderProps {
  workflowName: string
  onWorkflowNameChange: (name: string) => void
  isActive: boolean
  onToggleActive: () => void
  isUpdatingStatus: boolean
  onTestSandbox: () => void
  onTestLive: () => void
  onShowVersions: () => void
  onShowHistory: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  isSaving?: boolean
  onViewExecutionHistory?: () => void
  onExportWorkflow?: () => void
  onImportWorkflow?: () => void
  onDuplicateWorkflow?: () => void
  onDeleteWorkflow?: () => void
}

export function WorkflowHeader({
  workflowName,
  onWorkflowNameChange,
  isActive,
  onToggleActive,
  isUpdatingStatus,
  onTestSandbox,
  onTestLive,
  onShowVersions,
  onShowHistory,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isSaving = false,
  onViewExecutionHistory,
  onExportWorkflow,
  onImportWorkflow,
  onDuplicateWorkflow,
  onDeleteWorkflow,
}: WorkflowHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false)

  return (
    <div className="h-14 border-b bg-background flex items-center justify-between px-6 shrink-0">
      {/* Left Side - Workflow Name */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        {isEditingName ? (
          <Input
            value={workflowName}
            onChange={(e) => onWorkflowNameChange(e.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsEditingName(false)
              if (e.key === 'Escape') setIsEditingName(false)
            }}
            autoFocus
            className="h-8 max-w-xs"
          />
        ) : (
          <div
            onClick={() => setIsEditingName(true)}
            className="cursor-pointer hover:bg-accent px-2 py-1 rounded-md transition-colors"
          >
            <h1 className="text-xl font-semibold truncate">{workflowName || "Untitled Workflow"}</h1>
          </div>
        )}

        {/* Auto-save indicator */}
        {isSaving && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="hidden sm:inline">Saving...</span>
          </div>
        )}

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onUndo}
            disabled={!canUndo || !onUndo}
            title="Undo (Cmd+Z)"
            className="h-8 w-8"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRedo}
            disabled={!canRedo || !onRedo}
            title="Redo (Cmd+Shift+Z)"
            className="h-8 w-8"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Right Side - Actions */}
      <div className="flex items-center gap-3">
        {/* Organization Switcher */}
        <OrganizationSwitcher />

        {/* Versions Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onShowVersions}
          className="hidden sm:flex items-center gap-2"
        >
          <GitBranch className="w-4 h-4" />
          <span>Versions</span>
        </Button>

        {/* History Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onShowHistory}
          className="hidden sm:flex items-center gap-2"
        >
          <History className="w-4 h-4" />
          <span>History</span>
        </Button>

        {/* Test Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onTestSandbox}
            className="flex items-center gap-2"
          >
            <TestTube className="w-4 h-4" />
            <span className="hidden sm:inline">Sandbox</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onTestLive}
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            <span className="hidden sm:inline">Live Test</span>
          </Button>
        </div>

        {/* Publish/Activate Toggle */}
        <Button
          variant={isActive ? "default" : "outline"}
          size="sm"
          onClick={onToggleActive}
          disabled={isUpdatingStatus}
          className={cn(
            "flex items-center gap-2",
            isActive && "bg-green-600 hover:bg-green-700 text-white"
          )}
        >
          {isUpdatingStatus ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isActive ? (
            <Power className="w-4 h-4" />
          ) : (
            <PowerOff className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{isActive ? "Active" : "Inactive"}</span>
        </Button>

        {/* More Options Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {onViewExecutionHistory && (
              <>
                <DropdownMenuItem onClick={onViewExecutionHistory}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Execution History
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {onExportWorkflow && (
              <DropdownMenuItem onClick={onExportWorkflow}>
                <Download className="w-4 h-4 mr-2" />
                Export Workflow
              </DropdownMenuItem>
            )}

            {onImportWorkflow && (
              <DropdownMenuItem onClick={onImportWorkflow}>
                <Upload className="w-4 h-4 mr-2" />
                Import Workflow
              </DropdownMenuItem>
            )}

            {onDuplicateWorkflow && (
              <DropdownMenuItem onClick={onDuplicateWorkflow}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate Workflow
              </DropdownMenuItem>
            )}

            {(onExportWorkflow || onImportWorkflow || onDuplicateWorkflow) && <DropdownMenuSeparator />}

            {/* Mobile-only items */}
            <DropdownMenuItem onClick={onShowVersions} className="sm:hidden">
              <GitBranch className="w-4 h-4 mr-2" />
              Versions
            </DropdownMenuItem>

            <DropdownMenuItem onClick={onShowHistory} className="sm:hidden">
              <History className="w-4 h-4 mr-2" />
              Execution History
            </DropdownMenuItem>

            {onDeleteWorkflow && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDeleteWorkflow} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Workflow
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
