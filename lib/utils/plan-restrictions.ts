/**
 * Plan-based feature restrictions for ChainReact
 *
 * The database `plans` table is the SINGLE SOURCE OF TRUTH for all plan data.
 *
 * This file provides:
 *   - TypeScript types used across both client and server code
 *   - Server-side utility functions that delegate to lib/plans/server-cache.ts
 *
 * Client code uses `usePlansStore` from stores/plansStore.ts
 * Server code uses `lib/plans/server-cache.ts` directly
 *
 * NO HARDCODED PLAN DATA EXISTS IN THIS FILE.
 */

export type PlanTier = 'free' | 'pro' | 'team' | 'business' | 'enterprise'

export interface PlanLimits {
  tasksPerMonth: number
  maxActiveWorkflows: number
  maxWorkflowsTotal: number
  multiStepWorkflows: boolean
  aiAgents: boolean
  conditionalPaths: boolean
  webhooks: boolean
  scheduling: boolean
  errorNotifications: boolean
  teamSharing: boolean
  maxTeamMembers: number
  sharedWorkspaces: boolean
  advancedAnalytics: boolean
  prioritySupport: boolean
  dedicatedSupport: boolean
  historyRetentionDays: number
  detailedLogs: boolean
  maxBusinessContextEntries: number
  sso: boolean
  customContracts: boolean
  slaGuarantee: string | null
}

export interface PlanInfo {
  name: string
  price: number
  priceAnnual: number
  billingPeriod: 'month' | 'year'
  description: string
  popular?: boolean
  overageRate: number | null
}
