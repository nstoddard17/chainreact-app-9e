/**
 * Plan-based feature restrictions for ChainReact
 * Determines what features are available for each plan tier
 */

export type PlanTier = 'free' | 'starter' | 'professional' | 'team' | 'enterprise'

export interface PlanLimits {
  // Tasks
  tasksPerMonth: number

  // Workflows
  maxActiveWorkflows: number
  maxWorkflowsTotal: number

  // Features
  multiStepWorkflows: boolean
  premiumIntegrations: boolean
  aiAgents: boolean
  conditionalPaths: boolean
  webhooks: boolean
  scheduling: boolean
  errorNotifications: boolean

  // Collaboration
  teamSharing: boolean
  maxTeamMembers: number
  sharedWorkspaces: boolean

  // Analytics & Support
  advancedAnalytics: boolean
  prioritySupport: boolean
  dedicatedSupport: boolean

  // History & Logs
  historyRetentionDays: number
  detailedLogs: boolean
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    tasksPerMonth: 100,
    maxActiveWorkflows: 5,
    maxWorkflowsTotal: 10,
    multiStepWorkflows: false,
    premiumIntegrations: false,
    aiAgents: false,
    conditionalPaths: false,
    webhooks: false,
    scheduling: false,
    errorNotifications: false,
    teamSharing: false,
    maxTeamMembers: 1,
    sharedWorkspaces: false,
    advancedAnalytics: false,
    prioritySupport: false,
    dedicatedSupport: false,
    historyRetentionDays: 7,
    detailedLogs: false,
  },

  starter: {
    tasksPerMonth: 1000,
    maxActiveWorkflows: -1, // unlimited
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
    premiumIntegrations: true,
    aiAgents: false,
    conditionalPaths: true,
    webhooks: true,
    scheduling: true,
    errorNotifications: true,
    teamSharing: false,
    maxTeamMembers: 1,
    sharedWorkspaces: false,
    advancedAnalytics: false,
    prioritySupport: false,
    dedicatedSupport: false,
    historyRetentionDays: 30,
    detailedLogs: true,
  },

  professional: {
    tasksPerMonth: 5000,
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
    premiumIntegrations: true,
    aiAgents: true,
    conditionalPaths: true,
    webhooks: true,
    scheduling: true,
    errorNotifications: true,
    teamSharing: false,
    maxTeamMembers: 1,
    sharedWorkspaces: false,
    advancedAnalytics: true,
    prioritySupport: true,
    dedicatedSupport: false,
    historyRetentionDays: 90,
    detailedLogs: true,
  },

  team: {
    tasksPerMonth: 50000,
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
    premiumIntegrations: true,
    aiAgents: true,
    conditionalPaths: true,
    webhooks: true,
    scheduling: true,
    errorNotifications: true,
    teamSharing: true,
    maxTeamMembers: 25,
    sharedWorkspaces: true,
    advancedAnalytics: true,
    prioritySupport: true,
    dedicatedSupport: false,
    historyRetentionDays: 365,
    detailedLogs: true,
  },

  enterprise: {
    tasksPerMonth: -1, // unlimited
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
    premiumIntegrations: true,
    aiAgents: true,
    conditionalPaths: true,
    webhooks: true,
    scheduling: true,
    errorNotifications: true,
    teamSharing: true,
    maxTeamMembers: -1,
    sharedWorkspaces: true,
    advancedAnalytics: true,
    prioritySupport: true,
    dedicatedSupport: true,
    historyRetentionDays: -1, // unlimited
    detailedLogs: true,
  },
}

export interface PlanInfo {
  name: string
  price: number
  billingPeriod: 'month' | 'year'
  description: string
  popular?: boolean
}

export const PLAN_INFO: Record<PlanTier, PlanInfo> = {
  free: {
    name: 'Free',
    price: 0,
    billingPeriod: 'month',
    description: 'Perfect for trying out ChainReact',
  },
  starter: {
    name: 'Starter',
    price: 14.99,
    billingPeriod: 'month',
    description: 'Perfect for individuals getting started',
  },
  professional: {
    name: 'Professional',
    price: 39,
    billingPeriod: 'month',
    description: 'For professionals and small teams',
    popular: true,
  },
  team: {
    name: 'Team',
    price: 79,
    billingPeriod: 'month',
    description: 'For growing teams',
  },
  enterprise: {
    name: 'Enterprise',
    price: 0, // Custom pricing
    billingPeriod: 'month',
    description: 'For large organizations',
  },
}

/**
 * Check if a plan has access to a feature
 */
export function hasFeatureAccess(plan: PlanTier, feature: keyof PlanLimits): boolean {
  const limits = PLAN_LIMITS[plan]
  const value = limits[feature]

  // For boolean features
  if (typeof value === 'boolean') {
    return value
  }

  // For number limits (-1 = unlimited, 0 = no access, >0 = has access)
  if (typeof value === 'number') {
    return value !== 0
  }

  return false
}

/**
 * Get the minimum plan required for a feature
 */
export function getMinimumPlanForFeature(feature: keyof PlanLimits): PlanTier | null {
  const tiers: PlanTier[] = ['free', 'starter', 'professional', 'team', 'enterprise']

  for (const tier of tiers) {
    if (hasFeatureAccess(tier, feature)) {
      return tier
    }
  }

  return null
}

/**
 * Check if user can perform action based on usage limits
 */
export function canPerformAction(
  plan: PlanTier,
  action: 'createWorkflow' | 'activateWorkflow' | 'addTeamMember',
  currentCount: number
): { allowed: boolean; reason?: string; upgradeTo?: PlanTier } {
  const limits = PLAN_LIMITS[plan]

  switch (action) {
    case 'createWorkflow':
      if (limits.maxWorkflowsTotal === -1) {
        return { allowed: true }
      }
      if (currentCount >= limits.maxWorkflowsTotal) {
        return {
          allowed: false,
          reason: `You've reached your workflow limit (${limits.maxWorkflowsTotal}). Upgrade to create more.`,
          upgradeTo: 'starter',
        }
      }
      return { allowed: true }

    case 'activateWorkflow':
      if (limits.maxActiveWorkflows === -1) {
        return { allowed: true }
      }
      if (currentCount >= limits.maxActiveWorkflows) {
        return {
          allowed: false,
          reason: `You've reached your active workflow limit (${limits.maxActiveWorkflows}). Upgrade for unlimited active workflows.`,
          upgradeTo: 'starter',
        }
      }
      return { allowed: true }

    case 'addTeamMember':
      if (limits.maxTeamMembers === -1) {
        return { allowed: true }
      }
      if (currentCount >= limits.maxTeamMembers) {
        return {
          allowed: false,
          reason: `You've reached your team member limit (${limits.maxTeamMembers}). Upgrade to add more members.`,
          upgradeTo: 'team',
        }
      }
      return { allowed: true }

    default:
      return { allowed: true }
  }
}
