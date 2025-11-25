/**
 * Plan-based feature restrictions for ChainReact
 * Determines what features are available for each plan tier
 *
 * Pricing Economics (target 60%+ gross margin):
 * - 1 task = $0.01 cost (100 tasks = $1)
 * - Average workflow: ~10 tasks per run
 */

export type PlanTier = 'free' | 'pro' | 'team' | 'business' | 'enterprise'

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

  // Enterprise features
  sso: boolean
  customContracts: boolean
  slaGuarantee: string | null
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    tasksPerMonth: 100,
    maxActiveWorkflows: 3,
    maxWorkflowsTotal: 5,
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
    sso: false,
    customContracts: false,
    slaGuarantee: null,
  },

  pro: {
    tasksPerMonth: 750,
    maxActiveWorkflows: -1, // unlimited
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
    advancedAnalytics: false,
    prioritySupport: false,
    dedicatedSupport: false,
    historyRetentionDays: 30,
    detailedLogs: true,
    sso: false,
    customContracts: false,
    slaGuarantee: null,
  },

  team: {
    tasksPerMonth: 2000,
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
    maxTeamMembers: 5,
    sharedWorkspaces: true,
    advancedAnalytics: true,
    prioritySupport: true,
    dedicatedSupport: false,
    historyRetentionDays: 90,
    detailedLogs: true,
    sso: false,
    customContracts: false,
    slaGuarantee: null,
  },

  business: {
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
    teamSharing: true,
    maxTeamMembers: 15,
    sharedWorkspaces: true,
    advancedAnalytics: true,
    prioritySupport: true,
    dedicatedSupport: true,
    historyRetentionDays: 365,
    detailedLogs: true,
    sso: false,
    customContracts: false,
    slaGuarantee: '99.9%',
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
    sso: true,
    customContracts: true,
    slaGuarantee: '99.99%',
  },
}

export interface PlanInfo {
  name: string
  price: number
  priceAnnual: number // per month when billed annually
  billingPeriod: 'month' | 'year'
  description: string
  popular?: boolean
  overageRate: number | null // cost per additional task
}

export const PLAN_INFO: Record<PlanTier, PlanInfo> = {
  free: {
    name: 'Free',
    price: 0,
    priceAnnual: 0,
    billingPeriod: 'month',
    description: 'Perfect for trying out ChainReact',
    overageRate: null, // no overage, hard cap
  },
  pro: {
    name: 'Pro',
    price: 19,
    priceAnnual: 15.83, // $190/year = ~$15.83/mo
    billingPeriod: 'month',
    description: 'For solo professionals and freelancers',
    popular: true,
    overageRate: 0.025, // $0.025 per task
  },
  team: {
    name: 'Team',
    price: 49,
    priceAnnual: 40.83, // $490/year = ~$40.83/mo
    billingPeriod: 'month',
    description: 'For small teams collaborating on workflows',
    overageRate: 0.020, // $0.02 per task
  },
  business: {
    name: 'Business',
    price: 99,
    priceAnnual: 82.50, // $990/year = ~$82.50/mo
    billingPeriod: 'month',
    description: 'For growing companies with advanced needs',
    overageRate: 0.015, // $0.015 per task
  },
  enterprise: {
    name: 'Enterprise',
    price: 249, // Starting price
    priceAnnual: 249,
    billingPeriod: 'month',
    description: 'For large organizations with custom requirements',
    overageRate: null, // custom/negotiated
  },
}

// Feature lists for display
export const PLAN_FEATURES: Record<PlanTier, string[]> = {
  free: [
    '100 tasks/month',
    '3 active workflows',
    '5 total workflows',
    'Basic integrations',
    '7-day history',
    'Community support',
  ],
  pro: [
    '750 tasks/month',
    'Unlimited workflows',
    'All integrations',
    'AI Agents',
    'Webhooks & scheduling',
    '30-day history',
    'Detailed logs',
    'Email support',
  ],
  team: [
    '2,000 tasks/month',
    'Everything in Pro',
    'Up to 5 team members',
    'Shared workspaces',
    'Advanced analytics',
    '90-day history',
    'Priority support',
  ],
  business: [
    '5,000 tasks/month',
    'Everything in Team',
    'Up to 15 team members',
    '1-year history',
    'Dedicated support',
    '99.9% SLA guarantee',
    'Custom onboarding',
  ],
  enterprise: [
    'Unlimited tasks',
    'Everything in Business',
    'Unlimited team members',
    'SSO/SAML',
    'Custom contracts',
    '99.99% SLA guarantee',
    'Dedicated success manager',
    'Custom integrations',
  ],
}

// Economics summary for reference
export const PLAN_ECONOMICS = {
  free: { monthlyPrice: 0, tasks: 100, costToUs: 1, margin: 'Loss leader' },
  pro: { monthlyPrice: 19, tasks: 750, costToUs: 7.50, margin: '61%' },
  team: { monthlyPrice: 49, tasks: 2000, costToUs: 20, margin: '59%' },
  business: { monthlyPrice: 99, tasks: 5000, costToUs: 50, margin: '49%' },
  enterprise: { monthlyPrice: 249, tasks: 15000, costToUs: 150, margin: 'Custom' },
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

  // For string values (like SLA)
  if (typeof value === 'string') {
    return true
  }

  return false
}

/**
 * Get the minimum plan required for a feature
 */
export function getMinimumPlanForFeature(feature: keyof PlanLimits): PlanTier | null {
  const tiers: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']

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
  action: 'createWorkflow' | 'activateWorkflow' | 'addTeamMember' | 'useTasks',
  currentCount: number,
  required?: number
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
          upgradeTo: 'pro',
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
          upgradeTo: 'pro',
        }
      }
      return { allowed: true }

    case 'addTeamMember':
      if (limits.maxTeamMembers === -1) {
        return { allowed: true }
      }
      if (currentCount >= limits.maxTeamMembers) {
        const upgradeTo = plan === 'free' || plan === 'pro' ? 'team' : plan === 'team' ? 'business' : 'enterprise'
        return {
          allowed: false,
          reason: `You've reached your team member limit (${limits.maxTeamMembers}). Upgrade to add more members.`,
          upgradeTo,
        }
      }
      return { allowed: true }

    case 'useTasks':
      if (limits.tasksPerMonth === -1) {
        return { allowed: true }
      }
      const tasksNeeded = required || 1
      const remaining = limits.tasksPerMonth - currentCount
      if (remaining < tasksNeeded) {
        const upgradeTo = plan === 'free' ? 'pro' : plan === 'pro' ? 'team' : plan === 'team' ? 'business' : 'enterprise'
        return {
          allowed: false,
          reason: `You need ${tasksNeeded} tasks but only have ${remaining} remaining this month.`,
          upgradeTo,
        }
      }
      return { allowed: true }

    default:
      return { allowed: true }
  }
}

/**
 * Get display-friendly task limit
 */
export function formatTaskLimit(limit: number): string {
  if (limit === -1) return 'Unlimited'
  if (limit >= 1000) return `${(limit / 1000).toFixed(limit % 1000 === 0 ? 0 : 1)}k`
  return limit.toString()
}

/**
 * Calculate estimated workflow runs per month
 */
export function estimateWorkflowRuns(tasksPerMonth: number, avgTasksPerRun: number = 10): number {
  if (tasksPerMonth === -1) return -1 // unlimited
  return Math.floor(tasksPerMonth / avgTasksPerRun)
}
