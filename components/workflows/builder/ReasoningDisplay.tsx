"use client"

/**
 * ReasoningDisplay Component
 *
 * Displays AI reasoning steps in a collapsible panel, showing users
 * how the planner made decisions about their workflow.
 */

import React from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Brain,
  CheckCircle2,
  Circle,
  ChevronDown,
  Lightbulb,
  GitBranch,
  Settings,
  Link2,
  ShieldCheck,
} from "lucide-react"

// Import types
import type { ReasoningStep, PlanningPhase, ConfigConfidence } from "@/src/lib/workflows/builder/agent/types"

// ============================================================================
// PHASE ICONS & COLORS
// ============================================================================

const PHASE_CONFIG: Record<PlanningPhase, {
  icon: React.ElementType
  label: string
  color: string
  darkColor: string
}> = {
  understanding: {
    icon: Lightbulb,
    label: "Understanding",
    color: "text-amber-600",
    darkColor: "dark:text-amber-400",
  },
  selecting: {
    icon: Brain,
    label: "Selecting",
    color: "text-blue-600",
    darkColor: "dark:text-blue-400",
  },
  ordering: {
    icon: GitBranch,
    label: "Ordering",
    color: "text-purple-600",
    darkColor: "dark:text-purple-400",
  },
  configuring: {
    icon: Settings,
    label: "Configuring",
    color: "text-green-600",
    darkColor: "dark:text-green-400",
  },
  connecting: {
    icon: Link2,
    label: "Connecting",
    color: "text-cyan-600",
    darkColor: "dark:text-cyan-400",
  },
  validating: {
    icon: ShieldCheck,
    label: "Validating",
    color: "text-emerald-600",
    darkColor: "dark:text-emerald-400",
  },
}

const CONFIDENCE_STYLES: Record<ConfigConfidence, {
  bg: string
  text: string
  border: string
}> = {
  high: {
    bg: "bg-green-100 dark:bg-green-500/20",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-300 dark:border-green-500/40",
  },
  medium: {
    bg: "bg-amber-100 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-500/40",
  },
  low: {
    bg: "bg-red-100 dark:bg-red-500/20",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-300 dark:border-red-500/40",
  },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface StepItemProps {
  step: ReasoningStep
  isLast: boolean
}

function StepItem({ step, isLast }: StepItemProps) {
  const phaseConfig = PHASE_CONFIG[step.phase]
  const PhaseIcon = phaseConfig.icon
  const confidenceStyle = step.confidence ? CONFIDENCE_STYLES[step.confidence] : null

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 h-[calc(100%-8px)] w-0.5 bg-border dark:bg-border/50" />
      )}

      {/* Step number circle */}
      <div className={cn(
        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
        step.decision
          ? "border-primary bg-primary/10 dark:bg-primary/20"
          : "border-muted-foreground/30 bg-background"
      )}>
        {step.decision ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Circle className="h-2.5 w-2.5 text-muted-foreground/50" />
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 pb-4">
        {/* Phase badge */}
        <div className="flex items-center gap-2 mb-1">
          <PhaseIcon className={cn("h-3.5 w-3.5", phaseConfig.color, phaseConfig.darkColor)} />
          <span className={cn(
            "text-xs font-medium uppercase tracking-wide",
            phaseConfig.color,
            phaseConfig.darkColor
          )}>
            {phaseConfig.label}
          </span>
          {confidenceStyle && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4",
                confidenceStyle.bg,
                confidenceStyle.text,
                confidenceStyle.border
              )}
            >
              {step.confidence}
            </Badge>
          )}
        </div>

        {/* Thought */}
        <p className="text-sm text-foreground/80 dark:text-foreground/70">
          {step.thought}
        </p>

        {/* Decision */}
        {step.decision && (
          <p className="mt-1 text-sm font-medium text-primary">
            {step.decision}
          </p>
        )}

        {/* Alternatives */}
        {step.alternatives && step.alternatives.length > 0 && (
          <div className="mt-1.5">
            <span className="text-xs text-muted-foreground">
              Also considered:{" "}
            </span>
            <span className="text-xs text-muted-foreground/70">
              {step.alternatives.join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export interface ReasoningDisplayProps {
  steps: ReasoningStep[]
  /** Whether the reasoning panel is expanded by default */
  defaultOpen?: boolean
  /** Overall confidence level to display in header */
  confidence?: ConfigConfidence
  /** Custom class name */
  className?: string
  /** Compact mode for inline display */
  compact?: boolean
}

export function ReasoningDisplay({
  steps,
  defaultOpen = false,
  confidence,
  className,
  compact = false,
}: ReasoningDisplayProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  if (steps.length === 0) {
    return null
  }

  const confidenceStyle = confidence ? CONFIDENCE_STYLES[confidence] : null

  if (compact) {
    // Compact inline display - just show decisions
    const decisions = steps.filter(s => s.decision)
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        {decisions.map((step, i) => (
          <span key={step.step}>
            {i > 0 && <span className="mx-1">&rarr;</span>}
            {step.decision}
          </span>
        ))}
      </div>
    )
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "rounded-lg border bg-card text-card-foreground",
        "dark:bg-card/50 dark:border-border/50",
        className
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3 hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors rounded-t-lg">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            AI Reasoning
          </span>
          <span className="text-xs text-muted-foreground">
            ({steps.length} steps)
          </span>
          {confidenceStyle && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4 ml-1",
                confidenceStyle.bg,
                confidenceStyle.text,
                confidenceStyle.border
              )}
            >
              {confidence} confidence
            </Badge>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t dark:border-border/50">
        <div className="p-4 space-y-0">
          {steps.map((step, index) => (
            <StepItem
              key={step.step}
              step={step}
              isLast={index === steps.length - 1}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ============================================================================
// PARTIAL CONFIG BADGE
// ============================================================================

export interface PartialConfigBadgeProps {
  userRequiredCount: number
  dynamicPendingCount: number
  completeness: number
  className?: string
}

/**
 * Badge showing partial configuration status on a node
 */
export function PartialConfigBadge({
  userRequiredCount,
  dynamicPendingCount,
  completeness,
  className,
}: PartialConfigBadgeProps) {
  if (completeness >= 1 && userRequiredCount === 0 && dynamicPendingCount === 0) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-4",
          "bg-green-100 text-green-700 border-green-300",
          "dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/40",
          className
        )}
      >
        Configured
      </Badge>
    )
  }

  if (userRequiredCount > 0) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-4",
          "bg-amber-100 text-amber-700 border-amber-300",
          "dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40",
          className
        )}
      >
        {userRequiredCount} field{userRequiredCount > 1 ? "s" : ""} needed
      </Badge>
    )
  }

  if (dynamicPendingCount > 0) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-4",
          "bg-blue-100 text-blue-700 border-blue-300",
          "dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40",
          className
        )}
      >
        {dynamicPendingCount} loading
      </Badge>
    )
  }

  // Show completeness percentage
  const percent = Math.round(completeness * 100)
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0 h-4",
        percent >= 80
          ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/40"
          : percent >= 50
            ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40"
            : "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40",
        className
      )}
    >
      {percent}% configured
    </Badge>
  )
}

// ============================================================================
// STREAMING REASONING DISPLAY
// ============================================================================

export interface StreamingReasoningProps {
  steps: ReasoningStep[]
  isStreaming: boolean
  className?: string
}

/**
 * Displays reasoning steps as they stream in
 */
export function StreamingReasoning({
  steps,
  isStreaming,
  className,
}: StreamingReasoningProps) {
  const lastStep = steps[steps.length - 1]

  if (steps.length === 0 && !isStreaming) {
    return null
  }

  return (
    <div className={cn(
      "rounded-lg border bg-muted/30 dark:bg-muted/20 p-3",
      className
    )}>
      {lastStep && (
        <div className="flex items-start gap-2">
          <Brain className={cn(
            "h-4 w-4 mt-0.5",
            isStreaming && "animate-pulse",
            PHASE_CONFIG[lastStep.phase].color,
            PHASE_CONFIG[lastStep.phase].darkColor
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/80">
              {lastStep.thought}
              {isStreaming && (
                <span className="inline-flex ml-1">
                  <span className="animate-[blink_1s_infinite]">.</span>
                  <span className="animate-[blink_1s_infinite_200ms]">.</span>
                  <span className="animate-[blink_1s_infinite_400ms]">.</span>
                </span>
              )}
            </p>
            {lastStep.decision && (
              <p className="text-sm font-medium text-primary mt-0.5">
                {lastStep.decision}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step counter */}
      {steps.length > 1 && (
        <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Step {steps.length} of planning
          </span>
          {!isStreaming && lastStep?.confidence && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4",
                CONFIDENCE_STYLES[lastStep.confidence].bg,
                CONFIDENCE_STYLES[lastStep.confidence].text,
                CONFIDENCE_STYLES[lastStep.confidence].border
              )}
            >
              {lastStep.confidence}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

export default ReasoningDisplay
