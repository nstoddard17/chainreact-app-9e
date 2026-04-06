"use client"

import React, { useMemo, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Rocket,
  Loader2,
  Radio,
  Zap,
  AlertTriangle,
  Link2,
  Trash2,
} from "lucide-react"
import {
  generateActivationSummary,
  type ActivationSummary,
} from "@/lib/workflows/validation/activationSummary"
import {
  validateDataFlow,
  type DataFlowValidation,
} from "@/lib/workflows/validation/validateDataFlow"
import { agentEvalTracker } from '@/lib/eval/agentEvalTracker'
import { AGENT_EVAL_EVENTS } from '@/lib/eval/agentEvalTypes'

interface ActivationReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isActivating: boolean
  nodes: Array<{
    id: string
    type?: string
    data?: {
      type?: string
      title?: string
      label?: string
      config?: Record<string, any>
      isTrigger?: boolean
      providerId?: string
    }
  }>
  edges?: Array<{ source: string; target: string }>
}

export function ActivationReviewDialog({
  open,
  onOpenChange,
  onConfirm,
  isActivating,
  nodes,
  edges = [],
}: ActivationReviewDialogProps) {
  const summary: ActivationSummary = useMemo(
    () => generateActivationSummary(nodes),
    [nodes]
  )

  const dataFlowResult: DataFlowValidation = useMemo(
    () => validateDataFlow(nodes, edges),
    [nodes, edges]
  )

  // Agent eval: track invalid variable references when dialog opens
  useEffect(() => {
    if (open && dataFlowResult.unresolvedReferences.length > 0) {
      for (const ref of dataFlowResult.unresolvedReferences) {
        agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.INVALID_VARIABLE_REF, {
          node_id: ref.nodeId,
          field_name: ref.fieldName,
          variable_ref: ref.reference,
          failure_labels: ['mapping_failure'],
        })
      }
    }
  }, [open, dataFlowResult.unresolvedReferences])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Review Before Activating
          </DialogTitle>
          <DialogDescription>
            Once activated, this workflow will run automatically when its triggers fire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          {/* Triggers */}
          {summary.triggers.length > 0 && (
            <section>
              <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2 text-muted-foreground">
                <Radio className="w-4 h-4" />
                Triggers - what this workflow listens for
              </h4>
              <ul className="space-y-1.5">
                {summary.triggers.map((t) => (
                  <li
                    key={t.nodeId}
                    className="text-sm rounded-md border px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30"
                  >
                    <span className="font-medium">{t.title}</span>
                    {t.description && (
                      <span className="text-muted-foreground ml-1">
                        - {t.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Actions */}
          {summary.actions.length > 0 && (
            <section>
              <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2 text-muted-foreground">
                <Zap className="w-4 h-4" />
                Actions - what this workflow will do
              </h4>
              <ul className="space-y-1.5">
                {summary.actions.map((a) => (
                  <li
                    key={a.nodeId}
                    className="text-sm rounded-md border px-3 py-2 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  >
                    <span className="font-medium">{a.title}</span>
                    {a.description && (
                      <span className="text-muted-foreground ml-1">
                        - {a.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Integrations */}
          {summary.integrations.length > 0 && (
            <section>
              <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2 text-muted-foreground">
                <Link2 className="w-4 h-4" />
                Connected integrations
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {summary.integrations.map((name) => (
                  <Badge key={name} variant="outline">
                    {name}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Data-flow issues */}
          {dataFlowResult.unresolvedReferences.length > 0 && (
            <section className="rounded-md border px-3 py-2.5 bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div className="text-sm space-y-1">
                  <p className="text-red-600 dark:text-red-400 font-medium">
                    Unresolved variable references
                  </p>
                  <ul className="text-red-600/80 dark:text-red-400/80 text-xs space-y-0.5">
                    {dataFlowResult.unresolvedReferences.map((ref, i) => (
                      <li key={i}>
                        <span className="font-medium">{ref.nodeTitle}</span>:{" "}
                        <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded text-[11px]">
                          {ref.reference}
                        </code>{" "}
                        - {ref.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {dataFlowResult.warnings.length > 0 && (
            <section className="rounded-md border px-3 py-2.5 bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div className="text-sm space-y-0.5">
                  <p className="text-yellow-700 dark:text-yellow-300 font-medium text-xs">
                    Data-flow warnings
                  </p>
                  {dataFlowResult.warnings.map((w, i) => (
                    <p key={i} className="text-yellow-600/80 dark:text-yellow-400/80 text-xs">
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Warnings */}
          {(summary.hasWriteActions || summary.hasDeleteActions) && (
            <section className="rounded-md border px-3 py-2.5 bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30">
              <div className="flex items-start gap-2">
                {summary.hasDeleteActions ? (
                  <Trash2 className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  {summary.hasDeleteActions && (
                    <p className="text-red-600 dark:text-red-400 font-medium">
                      This workflow contains delete/remove actions that will modify external data.
                    </p>
                  )}
                  {summary.hasWriteActions && !summary.hasDeleteActions && (
                    <p className="text-amber-700 dark:text-amber-300">
                      This workflow will create or modify data in connected services each time it runs.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isActivating}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isActivating}
            className={
              summary.hasDeleteActions
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }
          >
            {isActivating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 mr-1.5" />
                Activate Workflow
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
