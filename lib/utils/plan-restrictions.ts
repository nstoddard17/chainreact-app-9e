/**
 * Plan-based feature restrictions for ChainReact
 * Determines what features are available for each plan tier
 *
 * Pricing Economics (target 60%+ gross margin):
 * - 1 task = $0.01 cost (100 tasks = $1)
 * - Average workflow: ~10 tasks per run
 */

export type PlanTier = 'free' | 'pro' | 'beta' | 'team' | 'business' | 'enterprise'

// Route-level access control is handled by lib/access-policy/ (canonical source of truth).
// This file only contains feature/resource limits and billing metadata.

export interface PlanLimits {
  // Tasks
  tasksPerMonth: number

  // Workflows
  maxActiveWorkflows: number
  maxWorkflowsTotal: number

  // Features
  multiStepWorkflows: boolean
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

  // AI Context
  maxBusinessContextEntries: number

  // Enterprise features
  sso: boolean
  customContracts: boolean
  slaGuarantee: string | null
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  // FREE: Let users experience the product fully, but limit tasks and premium features
  // Tasks are the natural limiter - no need to restrict workflow count
  free: {
    tasksPerMonth: 100,
    maxActiveWorkflows: -1, // unlimited - tasks are the real limiter
    maxWorkflowsTotal: -1,  // unlimited - tasks are the real limiter
    multiStepWorkflows: true,  // core feature - everyone needs this
    aiAgents: false,           // KEY UPGRADE DRIVER - AI costs real money
    conditionalPaths: true,    // core feature - everyone needs this
    webhooks: true,            // core feature - needed for real automation
    scheduling: true,          // core feature - needed for real automation
    errorNotifications: true,  // basic version - users need to know when things break
    teamSharing: false,        // upgrade driver - solo use only
    maxTeamMembers: 1,
    sharedWorkspaces: false,   // upgrade driver - solo use only
    advancedAnalytics: false,  // upgrade driver - basic stats only
    prioritySupport: false,
    dedicatedSupport: false,
    historyRetentionDays: 7,   // upgrade driver - short retention
    detailedLogs: false,       // upgrade driver - basic logs only
    maxBusinessContextEntries: 1, // teaser - upgrade for more
    sso: false,
    customContracts: false,
    slaGuarantee: null,
  },

  // PRO: Main upgrade path - AI Agents + more tasks + better logs
  pro: {
    tasksPerMonth: 750,
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
    aiAgents: true,            // THE key Pro feature
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
    maxBusinessContextEntries: 15,
    sso: false,
    customContracts: false,
    slaGuarantee: null,
  },

  // BETA: Pro-equivalent access for beta testers (750 tasks, $0)
  beta: {
    tasksPerMonth: 750,
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
    aiAgents: true,
    conditionalPaths: true,
    webhooks: true,
    scheduling: true,
    errorNotifications: true,
    teamSharing: false,
    maxTeamMembers: 1,
    sharedWorkspaces: false,
    advancedAnalytics: false,
    prioritySupport: true,
    dedicatedSupport: false,
    historyRetentionDays: 30,
    detailedLogs: true,
    maxBusinessContextEntries: 15,
    sso: false,
    customContracts: false,
    slaGuarantee: null,
  },

  // TEAM: Collaboration features + more tasks + analytics
  team: {
    tasksPerMonth: 2000,
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
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
    maxBusinessContextEntries: -1, // unlimited
    sso: false,
    customContracts: false,
    slaGuarantee: null,
  },

  // BUSINESS: More team members + dedicated support + SLA
  business: {
    tasksPerMonth: 5000,
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
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
    maxBusinessContextEntries: -1, // unlimited
    sso: false,
    customContracts: false,
    slaGuarantee: '99.9%',
  },

  // ENTERPRISE: Everything + SSO + custom contracts + unlimited
  enterprise: {
    tasksPerMonth: -1,
    maxActiveWorkflows: -1,
    maxWorkflowsTotal: -1,
    multiStepWorkflows: true,
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
    historyRetentionDays: -1,
    detailedLogs: true,
    maxBusinessContextEntries: -1, // unlimited
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
    priceAnnual: 16, // $192/year = $16/mo
    billingPeriod: 'month',
    description: 'For solo professionals and freelancers',
    popular: true,
    overageRate: 0.025, // $0.025 per task
  },
  beta: {
    name: 'Beta',
    price: 0,
    priceAnnual: 0,
    billingPeriod: 'month',
    description: 'Beta testing program with full Pro access',
    overageRate: null,
  },
  team: {
    name: 'Team',
    price: 49,
    priceAnnual: 40, // $480/year = $40/mo
    billingPeriod: 'month',
    description: 'For small teams collaborating on workflows',
    overageRate: 0.020, // $0.02 per task
  },
  business: {
    name: 'Business',
    price: 99,
    priceAnnual: 80, // $960/year = $80/mo
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
    'Unlimited workflows',
    'Multi-step workflows',
    'Webhooks & scheduling',
    'All integrations',
    '7-day history',
    'Community support',
  ],
  pro: [
    '750 tasks/month',
    'Everything in Free',
    'AI Agents (Claude)',
    '30-day history',
    'Detailed logs',
    'Email support',
  ],
  beta: [
    '750 tasks/month',
    'Full Pro access',
    'AI Agents (Claude)',
    '30-day history',
    'Detailed logs',
    'Priority support',
    'Early feature access',
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
  ],
  enterprise: [
    'Unlimited tasks',
    'Everything in Business',
    'Unlimited team members',
    'SSO/SAML',
    'Custom contracts',
    '99.99% SLA guarantee',
    'Dedicated success manager',
  ],
}

/**
 * Get the task limit for a plan by ID.
 * This is the single source of truth for plan → task limit mapping.
 * Used by billing webhooks, task deduction, and UI.
 */
export function getTaskLimitForPlan(planId: string): number {
  const normalized = planId === 'free-tier' ? 'free' : planId as PlanTier
  return PLAN_LIMITS[normalized]?.tasksPerMonth ?? 100
}

// Economics summary for reference
export const PLAN_ECONOMICS = {
  free: { monthlyPrice: 0, tasks: 100, costToUs: 1, margin: 'Loss leader' },
  pro: { monthlyPrice: 19, tasks: 750, costToUs: 7.50, margin: '61%' },
  beta: { monthlyPrice: 0, tasks: 750, costToUs: 7.50, margin: 'Beta program' },
  team: { monthlyPrice: 49, tasks: 2000, costToUs: 20, margin: '59%' },
  business: { monthlyPrice: 99, tasks: 5000, costToUs: 50, margin: '49%' },
  enterprise: { monthlyPrice: 249, tasks: 15000, costToUs: 150, margin: 'Custom' },
}

/**
 * Check if a plan has access to a feature
 */
export function hasFeatureAccess(plan: PlanTier, feature: keyof PlanLimits): boolean {
  // Defensive check: fallback to free plan if plan is invalid or undefined
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free
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
  const tiers: PlanTier[] = ['free', 'pro', 'beta', 'team', 'business', 'enterprise']

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
  action: 'createWorkflow' | 'activateWorkflow' | 'addTeamMember' | 'useTasks' | 'addBusinessContext',
  currentCount: number,
  required?: number
): { allowed: boolean; reason?: string; upgradeTo?: PlanTier } {
  // Defensive check: fallback to free plan if plan is invalid or undefined
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free

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

    case 'addBusinessContext':
      if (limits.maxBusinessContextEntries === -1) {
        return { allowed: true }
      }
      if (currentCount >= limits.maxBusinessContextEntries) {
        const upgradeTo = plan === 'free' ? 'pro' : plan === 'pro' || plan === 'beta' ? 'team' : 'enterprise'
        return {
          allowed: false,
          reason: `You've reached your AI Context limit (${limits.maxBusinessContextEntries}). Upgrade to add more.`,
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
