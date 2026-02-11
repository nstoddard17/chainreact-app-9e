"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useToast } from "@/hooks/use-toast"
import confetti from "canvas-confetti"

/**
 * Milestone types that trigger celebrations
 */
export type MilestoneType =
  | "first_workflow_created"
  | "first_workflow_activated"
  | "first_app_connected"
  | "first_workflow_executed"
  | "five_workflows_created"
  | "ten_workflows_created"
  | "first_template_used"
  | "first_team_joined"

interface MilestoneConfig {
  title: string
  description: string
  confetti?: boolean
}

const MILESTONE_CONFIGS: Record<MilestoneType, MilestoneConfig> = {
  first_workflow_created: {
    title: "First Workflow Created!",
    description: "You've taken the first step toward automation. Now configure your trigger and actions!",
    confetti: true,
  },
  first_workflow_activated: {
    title: "Your First Workflow is Live!",
    description: "Congratulations! Your automation is now running. Sit back and let it work for you.",
    confetti: true,
  },
  first_app_connected: {
    title: "App Connected!",
    description: "Great start! You can now use this app in your workflows.",
    confetti: false,
  },
  first_workflow_executed: {
    title: "First Successful Execution!",
    description: "Your workflow just ran successfully. Automation magic is happening!",
    confetti: true,
  },
  five_workflows_created: {
    title: "5 Workflows!",
    description: "You're becoming an automation pro! Keep building.",
    confetti: false,
  },
  ten_workflows_created: {
    title: "10 Workflows!",
    description: "Impressive! You've built 10 workflows. You're a true automation master.",
    confetti: true,
  },
  first_template_used: {
    title: "Template Applied!",
    description: "Smart choice using a template. Customize it to fit your needs.",
    confetti: false,
  },
  first_team_joined: {
    title: "Welcome to the Team!",
    description: "You're now part of a team. Collaborate and share workflows together.",
    confetti: false,
  },
}

const STORAGE_KEY = "chainreact_milestones"

/**
 * Get achieved milestones from localStorage
 */
function getAchievedMilestones(userId: string): Set<MilestoneType> {
  if (typeof window === "undefined") return new Set()

  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`)
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch (e) {
    // Invalid JSON, start fresh
  }
  return new Set()
}

/**
 * Save achieved milestone to localStorage
 */
function saveAchievedMilestone(userId: string, milestone: MilestoneType): void {
  if (typeof window === "undefined") return

  const achieved = getAchievedMilestones(userId)
  achieved.add(milestone)
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify([...achieved]))
}

/**
 * Check if a milestone has been achieved
 */
function hasMilestoneBeenAchieved(userId: string, milestone: MilestoneType): boolean {
  return getAchievedMilestones(userId).has(milestone)
}

/**
 * Fire confetti animation
 */
function fireConfetti(): void {
  if (typeof window === "undefined") return

  // Check if confetti is available (it's dynamically imported)
  if (typeof confetti === "function") {
    // Fire from the center
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"],
    })

    // Fire from both sides after a delay
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#f97316", "#22c55e", "#3b82f6"],
      })
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#a855f7", "#ec4899", "#f97316"],
      })
    }, 150)
  }
}

/**
 * Hook for triggering milestone celebrations
 */
export function useCelebrations() {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const celebratedRef = useRef<Set<MilestoneType>>(new Set())

  /**
   * Celebrate a milestone if it hasn't been celebrated before
   */
  const celebrate = useCallback((milestone: MilestoneType) => {
    if (!user?.id) return

    // Don't celebrate if already achieved
    if (hasMilestoneBeenAchieved(user.id, milestone)) return

    // Don't celebrate twice in the same session
    if (celebratedRef.current.has(milestone)) return

    const config = MILESTONE_CONFIGS[milestone]
    if (!config) return

    // Mark as celebrated
    celebratedRef.current.add(milestone)
    saveAchievedMilestone(user.id, milestone)

    // Fire confetti if configured
    if (config.confetti) {
      fireConfetti()
    }

    // Show toast with celebration styling
    toast({
      title: `🎉 ${config.title}`,
      description: config.description,
      duration: 6000,
    })
  }, [user?.id, toast])

  /**
   * Check and celebrate workflow count milestones
   */
  const checkWorkflowCountMilestones = useCallback((count: number) => {
    if (count >= 1) celebrate("first_workflow_created")
    if (count >= 5) celebrate("five_workflows_created")
    if (count >= 10) celebrate("ten_workflows_created")
  }, [celebrate])

  /**
   * Get list of achieved milestones
   */
  const getAchieved = useCallback((): MilestoneType[] => {
    if (!user?.id) return []
    return [...getAchievedMilestones(user.id)]
  }, [user?.id])

  /**
   * Check if a specific milestone has been achieved
   */
  const hasAchieved = useCallback((milestone: MilestoneType): boolean => {
    if (!user?.id) return false
    return hasMilestoneBeenAchieved(user.id, milestone)
  }, [user?.id])

  return {
    celebrate,
    checkWorkflowCountMilestones,
    getAchieved,
    hasAchieved,
  }
}

/**
 * Hook to automatically check and celebrate milestones based on current state
 */
export function useMilestoneTracker(
  workflowCount: number,
  activeWorkflowCount: number,
  connectedAppCount: number,
  executionCount: number
) {
  const { celebrate } = useCelebrations()
  const trackedRef = useRef({
    workflows: 0,
    active: 0,
    apps: 0,
    executions: 0,
  })

  useEffect(() => {
    // First workflow created
    if (workflowCount >= 1 && trackedRef.current.workflows === 0) {
      celebrate("first_workflow_created")
    }

    // Five workflows
    if (workflowCount >= 5 && trackedRef.current.workflows < 5) {
      celebrate("five_workflows_created")
    }

    // Ten workflows
    if (workflowCount >= 10 && trackedRef.current.workflows < 10) {
      celebrate("ten_workflows_created")
    }

    trackedRef.current.workflows = workflowCount
  }, [workflowCount, celebrate])

  useEffect(() => {
    // First workflow activated
    if (activeWorkflowCount >= 1 && trackedRef.current.active === 0) {
      celebrate("first_workflow_activated")
    }

    trackedRef.current.active = activeWorkflowCount
  }, [activeWorkflowCount, celebrate])

  useEffect(() => {
    // First app connected
    if (connectedAppCount >= 1 && trackedRef.current.apps === 0) {
      celebrate("first_app_connected")
    }

    trackedRef.current.apps = connectedAppCount
  }, [connectedAppCount, celebrate])

  useEffect(() => {
    // First execution
    if (executionCount >= 1 && trackedRef.current.executions === 0) {
      celebrate("first_workflow_executed")
    }

    trackedRef.current.executions = executionCount
  }, [executionCount, celebrate])
}
