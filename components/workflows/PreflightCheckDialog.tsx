"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, AlertTriangle, PlugZap, Settings, RotateCcw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

type PreflightIssueType = "integration" | "configuration" | "ai"

export interface PreflightIssue {
  type: PreflightIssueType
  message: string
  nodeId?: string
  providerId?: string
  missingFields?: string[]
}

export interface PreflightResult {
  issues: PreflightIssue[]
  warnings: PreflightIssue[]
  checkedAt: string
}

interface PreflightCheckDialogProps {
  open: boolean
  onClose: () => void
  result: PreflightResult | null
  onRunAgain: () => void
  onFixNode?: (nodeId: string) => void
  onOpenIntegrations?: () => void
  isRunning?: boolean
}

const issueIconMap: Record<PreflightIssueType, JSX.Element> = {
  integration: <PlugZap className="w-4 h-4 text-amber-500" />,
  configuration: <Settings className="w-4 h-4 text-red-500" />,
  ai: <AlertTriangle className="w-4 h-4 text-indigo-500" />,
}

const issueLabelMap: Record<PreflightIssueType, string> = {
  integration: "Integration",
  configuration: "Configuration",
  ai: "AI Context",
}

export function PreflightCheckDialog({
  open,
  onClose,
  result,
  onRunAgain,
  onFixNode,
  onOpenIntegrations,
  isRunning = false,
}: PreflightCheckDialogProps) {
  const hasIssues = Boolean(result?.issues?.length)
  const hasWarnings = Boolean(result?.warnings?.length)

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Preflight Checklist</DialogTitle>
          <DialogDescription>
            Review integration connections and configuration before launching your workflow.
            {result?.checkedAt && (
              <span className="ml-1 text-xs text-muted-foreground">
                Last checked {formatDistanceToNow(new Date(result.checkedAt), { addSuffix: true })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            {!result && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {result && !hasIssues && !hasWarnings && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle2 className="w-5 h-5" />
                <AlertTitle>All checks passed</AlertTitle>
                <AlertDescription>
                  Every node is configured and all required integrations are connected. You’re ready to run.
                </AlertDescription>
              </Alert>
            )}

            {result?.issues?.length ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mt-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h4 className="text-sm font-semibold text-red-600">Issues to resolve</h4>
                </div>
                {result.issues.map((issue, index) => (
                  <div
                    key={`issue-${index}`}
                    className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-white text-red-600 border-red-200">
                        {issueLabelMap[issue.type]}
                      </Badge>
                      {issueIconMap[issue.type]}
                      <span className="text-sm font-medium text-red-700">{issue.message}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {issue.type === "integration" && onOpenIntegrations && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenIntegrations()}
                        >
                          Open Integrations
                        </Button>
                      )}
                      {issue.nodeId && onFixNode && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onFixNode(issue.nodeId!)}
                        >
                          Configure Node
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {result?.warnings?.length ? (
              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h4 className="text-sm font-semibold text-amber-600">Warnings</h4>
                </div>
                {result.warnings.map((warning, index) => (
                  <div
                    key={`warning-${index}`}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-white text-amber-600 border-amber-200">
                        {issueLabelMap[warning.type]}
                      </Badge>
                      {issueIconMap[warning.type]}
                      <span className="text-sm font-medium text-amber-700">{warning.message}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {warning.nodeId && onFixNode && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onFixNode(warning.nodeId!)}
                        >
                          Review Node
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </ScrollArea>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RotateCcw className="w-4 h-4" />
            {result
              ? `Checked ${formatDistanceToNow(new Date(result.checkedAt), { addSuffix: true })}`
              : "Not checked yet"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onRunAgain} disabled={isRunning}>
              {isRunning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Re-run Check
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
