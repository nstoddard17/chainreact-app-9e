'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Zap, Users, Bot, Calendar, Bell, BarChart3, Headphones } from 'lucide-react'
import { PlanTier, PlanLimits, PLAN_INFO, PLAN_LIMITS } from '@/lib/utils/plan-restrictions'
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'

interface UpgradePlanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requiredPlan?: PlanTier
  feature?: keyof PlanLimits
}

const featureNames: Record<keyof PlanLimits, string> = {
  tasksPerMonth: 'More Tasks',
  maxActiveWorkflows: 'Unlimited Active Workflows',
  maxWorkflowsTotal: 'Unlimited Total Workflows',
  multiStepWorkflows: 'Multi-Step Workflows',
  premiumIntegrations: 'Premium Integrations',
  aiAgents: 'AI Agents',
  conditionalPaths: 'Conditional Logic (If/Else)',
  webhooks: 'Webhooks & HTTP Requests',
  scheduling: 'Workflow Scheduling',
  errorNotifications: 'Error Notifications',
  teamSharing: 'Team Sharing & Collaboration',
  maxTeamMembers: 'Team Members',
  sharedWorkspaces: 'Shared Workspaces',
  advancedAnalytics: 'Advanced Analytics',
  prioritySupport: 'Priority Support',
  dedicatedSupport: 'Dedicated Support',
  historyRetentionDays: 'Extended History Retention',
  detailedLogs: 'Detailed Logs'
}

export function UpgradePlanModal({ open, onOpenChange, requiredPlan, feature }: UpgradePlanModalProps) {
  const { currentPlan } = usePlanRestrictions()

  // Determine which plan to show (use 'pro' as default instead of 'professional')
  const planToShow = requiredPlan || 'pro'
  const planInfo = PLAN_INFO[planToShow] || PLAN_INFO.pro
  const planLimits = PLAN_LIMITS[planToShow] || PLAN_LIMITS.pro

  // Get feature name
  const featureName = feature ? featureNames[feature] : 'This feature'

  // Plan-specific features to highlight
  const getKeyFeatures = (plan: PlanTier) => {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free
    const features: { icon: any; label: string; value: string }[] = []

    // Tasks
    features.push({
      icon: Zap,
      label: 'Tasks per month',
      value: limits?.tasksPerMonth === -1 ? 'Unlimited' : (limits?.tasksPerMonth ?? 100).toLocaleString()
    })

    // Workflows
    if (limits?.maxActiveWorkflows === -1) {
      features.push({
        icon: Check,
        label: 'Active workflows',
        value: 'Unlimited'
      })
    }

    // AI Agents
    if (limits.aiAgents) {
      features.push({
        icon: Bot,
        label: 'AI Agents',
        value: 'Included'
      })
    }

    // Conditional Logic
    if (limits.conditionalPaths) {
      features.push({
        icon: Check,
        label: 'Conditional Logic',
        value: 'Yes'
      })
    }

    // Scheduling
    if (limits.scheduling) {
      features.push({
        icon: Calendar,
        label: 'Scheduling',
        value: 'Yes'
      })
    }

    // Error Notifications
    if (limits.errorNotifications) {
      features.push({
        icon: Bell,
        label: 'Error Notifications',
        value: 'Yes'
      })
    }

    // Team Features
    if (limits.teamSharing) {
      features.push({
        icon: Users,
        label: 'Team Members',
        value: limits.maxTeamMembers === -1 ? 'Unlimited' : limits.maxTeamMembers.toString()
      })
    }

    // Analytics
    if (limits.advancedAnalytics) {
      features.push({
        icon: BarChart3,
        label: 'Advanced Analytics',
        value: 'Yes'
      })
    }

    // Support
    if (limits.prioritySupport) {
      features.push({
        icon: Headphones,
        label: 'Priority Support',
        value: 'Yes'
      })
    }

    return features
  }

  const keyFeatures = getKeyFeatures(planToShow)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            Upgrade to {planInfo.name}
            {planToShow === 'professional' && (
              <Badge variant="default" className="text-xs">Most Popular</Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-base">
            {featureName} is available on the {planInfo.name} plan
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 py-2">
          {/* Current Plan Badge */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Current Plan</div>
              <div className="font-semibold text-lg capitalize">{currentPlan}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Upgrade to</div>
              <div className="font-semibold text-lg">{planInfo.name}</div>
            </div>
          </div>

          {/* Pricing */}
          <div className="text-center py-6 bg-gradient-to-br from-primary/5 to-transparent rounded-lg border">
            <div className="text-5xl font-bold">
              ${planInfo.price}
              {planInfo.price > 0 && (
                <span className="text-xl text-muted-foreground font-normal">/{planInfo.billingPeriod}</span>
              )}
            </div>
            <p className="text-base text-muted-foreground mt-3">{planInfo.description}</p>
          </div>

          {/* Key Features */}
          <div className="space-y-4">
            <div className="text-base font-semibold">What's included:</div>
            <div className="grid grid-cols-2 gap-4">
              {keyFeatures.map((feature, index) => {
                const Icon = feature.icon
                return (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{feature.label}</div>
                      <div className="font-semibold truncate">{feature.value}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex gap-4 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11"
              size="lg"
            >
              Maybe Later
            </Button>
            <Button
              onClick={() => {
                // TODO: Implement upgrade flow
                console.log('Upgrade to:', planToShow)
                onOpenChange(false)
              }}
              className="flex-1 h-11"
              size="lg"
            >
              Upgrade Now
            </Button>
          </div>

          {/* Additional Info */}
          <p className="text-sm text-center text-muted-foreground pt-2">
            No credit card required for 14-day free trial
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
