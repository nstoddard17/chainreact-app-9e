/**
 * BuildState.ts
 *
 * Finite state machine for the Kadabra-style animated build UX.
 * Front-end only - no backend changes required.
 */

import { Copy } from "@/components/workflows/builder/ui/copy"

export enum BuildState {
  // Planning phase
  IDLE = 'IDLE',
  THINKING = 'THINKING',
  SUBTASKS = 'SUBTASKS',
  COLLECT_NODES = 'COLLECT_NODES',
  OUTLINE = 'OUTLINE',
  PURPOSE = 'PURPOSE',
  PLAN_READY = 'PLAN_READY',

  // Building phase
  BUILDING_SKELETON = 'BUILDING_SKELETON',
  WAITING_USER = 'WAITING_USER',
  PREPARING_NODE = 'PREPARING_NODE',
  TESTING_NODE = 'TESTING_NODE',

  // Complete
  COMPLETE = 'COMPLETE',
}

export interface PlanNode {
  id: string
  title: string
  description?: string
  nodeType: string
  providerId?: string
  icon?: any
  requires?: {
    secretNames?: string[]
    params?: string[]
  }
  /**
   * Schema snapshot for the node so the agent/UI know exactly which fields exist.
   * Populated from the node's configSchema/outputSchema when available.
   */
  configFields?: Array<{
    name: string
    label?: string
    type?: string
    required?: boolean
    dynamic?: boolean
    options?: any[]
    placeholder?: string
    defaultValue?: any
    dependsOn?: string
    description?: string
    supportsAI?: boolean
  }>
  outputFields?: Array<{
    name: string
    label?: string
    type?: string
    description?: string
  }>
}

export interface StagedText {
  thinking?: string
  subtasks?: string[]
  relevantNodes?: Array<{ title: string; description: string; providerId?: string }>
  outline?: string
  purpose?: string
}

export interface BuildProgress {
  currentIndex: number
  done: number
  total: number
}

export interface BadgeInfo {
  text: string
  subtext?: string
  variant: 'blue' | 'green' | 'red' | 'default'
  spinner?: boolean
  dots?: boolean
}

export interface BuildStateMachine {
  state: BuildState
  plan: PlanNode[]
  stagedText: StagedText
  progress: BuildProgress
  badge: BadgeInfo | null
  edits: any[] | null
  nodeMapping?: Record<string, string> // Maps planNode.id -> reactFlowNode.id
  nodesCache?: any[] // Stores actual ReactFlow nodes to avoid relying on stale builder.nodes
}

export const getInitialState = (): BuildStateMachine => ({
  state: BuildState.IDLE,
  plan: [],
  stagedText: {},
  progress: { currentIndex: -1, done: 0, total: 0 },
  badge: null,
  edits: null,
})

export const getBadgeForState = (state: BuildState, currentNodeTitle?: string): BadgeInfo | null => {
  switch (state) {
    case BuildState.THINKING:
      return { text: Copy.thinking, variant: 'blue', dots: true }
    case BuildState.SUBTASKS:
      return { text: Copy.subtasks, variant: 'blue', dots: false }
    case BuildState.COLLECT_NODES:
      return { text: Copy.collected, variant: 'blue', dots: false }
    case BuildState.OUTLINE:
    case BuildState.PURPOSE:
      return { text: Copy.outline, variant: 'blue', dots: false }
    case BuildState.PLAN_READY:
      return null // Hide badge when plan is ready
    case BuildState.BUILDING_SKELETON:
      return { text: `${Copy.agentBadge} …`, variant: 'blue', dots: true }
    case BuildState.WAITING_USER:
      return {
        text: Copy.agentBadge,
        subtext: Copy.waitingUser,
        variant: 'blue',
        spinner: true
      }
    case BuildState.PREPARING_NODE:
      return {
        text: Copy.preparing(currentNodeTitle),
        variant: 'blue',
        spinner: true
      }
    case BuildState.TESTING_NODE:
      return {
        text: Copy.testing(currentNodeTitle),
        variant: 'blue',
        spinner: true
      }
    case BuildState.COMPLETE:
      return { text: Copy.flowReady, variant: 'green' }
    default:
      return null
  }
}

export const canTransitionTo = (current: BuildState, next: BuildState): boolean => {
  const validTransitions: Record<BuildState, BuildState[]> = {
    [BuildState.IDLE]: [BuildState.THINKING],
    [BuildState.THINKING]: [BuildState.SUBTASKS, BuildState.PLAN_READY],
    [BuildState.SUBTASKS]: [BuildState.COLLECT_NODES],
    [BuildState.COLLECT_NODES]: [BuildState.OUTLINE],
    [BuildState.OUTLINE]: [BuildState.PURPOSE],
    [BuildState.PURPOSE]: [BuildState.PLAN_READY],
    [BuildState.PLAN_READY]: [BuildState.BUILDING_SKELETON, BuildState.IDLE],
    [BuildState.BUILDING_SKELETON]: [BuildState.WAITING_USER, BuildState.PLAN_READY],
    [BuildState.WAITING_USER]: [BuildState.PREPARING_NODE, BuildState.COMPLETE, BuildState.PLAN_READY],
    [BuildState.PREPARING_NODE]: [BuildState.TESTING_NODE, BuildState.WAITING_USER],
    [BuildState.TESTING_NODE]: [BuildState.WAITING_USER, BuildState.COMPLETE],
    [BuildState.COMPLETE]: [BuildState.IDLE],
  }

  return validTransitions[current]?.includes(next) ?? false
}

export const getStateLabel = (state: BuildState): string => {
  switch (state) {
    case BuildState.THINKING:
      return Copy.thinking
    case BuildState.SUBTASKS:
      return Copy.subtasks
    case BuildState.COLLECT_NODES:
      return Copy.collected
    case BuildState.OUTLINE:
      return Copy.outline
    case BuildState.PURPOSE:
      return Copy.outline
    case BuildState.PLAN_READY:
      return Copy.executePlan
    case BuildState.BUILDING_SKELETON:
      return Copy.buildingSkeleton
    case BuildState.WAITING_USER:
      return Copy.moveOn
    case BuildState.PREPARING_NODE:
      return Copy.preparingNode
    case BuildState.TESTING_NODE:
      return Copy.testingNode
    case BuildState.COMPLETE:
      return Copy.yourFlowReady
    default:
      return ''
  }
}
