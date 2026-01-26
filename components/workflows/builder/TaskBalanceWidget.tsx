"use client"

import React from "react"
import { Zap, AlertTriangle, ChevronDown } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import { useWorkflowCostStore } from "@/stores/workflowCostStore"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface TaskBalanceWidgetProps {
  className?: string
}

export function TaskBalanceWidget({ className }: TaskBalanceWidgetProps) {
  const { profile } = useAuthStore()
  const { estimatedTasks } = useWorkflowCostStore()

  const tasksUsed = profile?.tasks_used ?? 0
  const tasksLimit = profile?.tasks_limit ?? 100
  const tasksRemaining = Math.max(0, tasksLimit - tasksUsed)
  const usagePercent = Math.min((tasksUsed / tasksLimit) * 100, 100)

  // Check if workflow would exceed budget
  const wouldExceedBudget = estimatedTasks > tasksRemaining

  // Determine status color based on usage
  const getStatusColor = () => {
    if (usagePercent >= 90) return "text-red-600 dark:text-red-400"
    if (usagePercent >= 75) return "text-amber-600 dark:text-amber-400"
    return "text-emerald-600 dark:text-emerald-400"
  }

  const getProgressColor = () => {
    if (usagePercent >= 90) return "bg-red-500"
    if (usagePercent >= 75) return "bg-amber-500"
    return "bg-emerald-500"
  }

  const getBgColor = () => {
    if (usagePercent >= 90) return "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800"
    if (usagePercent >= 75) return "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
    return "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex flex-col gap-2 px-4 py-3 rounded-xl border shadow-lg cursor-pointer hover:shadow-xl transition-all",
            getBgColor(),
            className
          )}
        >
          {/* Your Balance */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full",
                usagePercent >= 90 ? "bg-red-100 dark:bg-red-900/50" :
                usagePercent >= 75 ? "bg-amber-100 dark:bg-amber-900/50" :
                "bg-emerald-100 dark:bg-emerald-900/50"
              )}>
                <Zap className={cn("w-3.5 h-3.5", getStatusColor())} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Your Balance</span>
            </div>
            <span className={cn("text-sm font-bold tabular-nums", getStatusColor())}>
              {tasksRemaining} tasks
            </span>
          </div>

          {/* Workflow Cost */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full",
                wouldExceedBudget
                  ? "bg-red-100 dark:bg-red-900/50"
                  : "bg-blue-100 dark:bg-blue-900/50"
              )}>
                {wouldExceedBudget ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                ) : (
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">⚡</span>
                )}
              </div>
              <span className="text-xs font-medium text-muted-foreground">Workflow Cost</span>
            </div>
            <span className={cn(
              "text-sm font-bold tabular-nums",
              wouldExceedBudget ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}>
              {estimatedTasks} task{estimatedTasks !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Expand indicator */}
          <div className="flex items-center justify-center pt-1 border-t border-gray-100 dark:border-gray-800">
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          {/* Header */}
          <div>
            <h3 className="font-semibold text-base">Task Usage</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tasks are used each time your workflow runs
            </p>
          </div>

          {/* Progress Section */}
          <div className="space-y-3 p-3 rounded-lg bg-muted/50">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-medium">Monthly Balance</span>
              <span className={cn("text-lg font-bold tabular-nums", getStatusColor())}>
                {tasksRemaining}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  / {tasksLimit}
                </span>
              </span>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className={cn("rounded-full h-2.5 transition-all", getProgressColor())}
                  style={{ width: `${100 - usagePercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{tasksUsed} used this month</span>
                <span>{Math.round(100 - usagePercent)}% remaining</span>
              </div>
            </div>
          </div>

          {/* Workflow Estimate */}
          <div className={cn(
            "p-3 rounded-lg border",
            wouldExceedBudget
              ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
              : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
          )}>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">This Workflow</div>
                <div className="text-xs text-muted-foreground">Cost per run</div>
              </div>
              <span className={cn(
                "text-xl font-bold tabular-nums",
                wouldExceedBudget ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
              )}>
                {estimatedTasks}
                <span className="text-sm font-normal ml-1">
                  task{estimatedTasks !== 1 ? "s" : ""}
                </span>
              </span>
            </div>
            {wouldExceedBudget && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Exceeds your remaining balance</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p>• Tasks reset at the start of each billing cycle</p>
            <p>• <span className="font-medium text-emerald-600 dark:text-emerald-400">Testing is free</span> and doesn&apos;t use tasks</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
