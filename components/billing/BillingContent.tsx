"use client"

import { useEffect, useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { useAuthStore } from "@/stores/authStore"
import PlanSelector from "./PlanSelectorStyled"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Sparkles,
  CheckCircle,
  Zap,
  Users,
  Clock,
  Shield,
  HelpCircle,
  CreditCard,
  RefreshCw,
  Bot,
  Webhook,
  Calendar,
  BarChart3,
  Headphones,
  Crown,
  ChevronDown,
  ChevronUp,
  Workflow,
  Activity,
  Mail,
  FileText,
  Database,
  AlertCircle,
  X,
  Check,
} from "lucide-react"
import { useSearchParams, useRouter } from "next/navigation"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PLAN_INFO, PLAN_LIMITS, type PlanTier } from '@/lib/utils/plan-restrictions'

interface BillingContentProps {
  isModal?: boolean
}

// Map database plan names to our tier system
const mapPlanNameToTier = (name: string): PlanTier => {
  const normalized = name?.toLowerCase()
  if (normalized === 'pro' || normalized === 'professional') return 'pro'
  if (normalized === 'team') return 'team'
  if (normalized === 'business') return 'business'
  if (normalized === 'enterprise') return 'enterprise'
  return 'free'
}

export default function BillingContent({ isModal = false }: BillingContentProps) {
  const { plans, currentSubscription, usage, loading, error, fetchAll } = useBillingStore()
  const { profile } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const targetPlanId = searchParams.get("plan")
  const [showWelcome, setShowWelcome] = useState(false)
  const [showFaq, setShowFaq] = useState<string | null>(null)

  const isBetaTester = profile?.role === 'beta-pro'

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    const justUpgraded = sessionStorage.getItem("just_upgraded")
    if (justUpgraded === "true" && currentSubscription?.plan_id !== "free") {
      setShowWelcome(true)
      sessionStorage.removeItem("just_upgraded")
      setTimeout(() => setShowWelcome(false), 10000)
    }
  }, [currentSubscription])

  if (loading) {
    return (
      <NewAppLayout title="Billing & Plans" subtitle="Manage your subscription and usage">
        <LoadingScreen
          title="Loading Billing"
          description="Fetching your subscription details..."
          size="lg"
        />
      </NewAppLayout>
    )
  }

  if (error) {
    return (
      <NewAppLayout title="Billing & Plans" subtitle="Manage your subscription and usage">
        <div className="min-h-[400px] flex items-center justify-center">
          <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto">
                <HelpCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="text-red-600 dark:text-red-400">{error}</div>
              <Button onClick={() => fetchAll()} variant="outline" className="border-red-300 dark:border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </NewAppLayout>
    )
  }

  const currentTier = currentSubscription?.plan?.name
    ? mapPlanNameToTier(currentSubscription.plan.name)
    : 'free'
  const currentPlanInfo = PLAN_INFO[currentTier] || PLAN_INFO.free
  const currentLimits = PLAN_LIMITS[currentTier] || PLAN_LIMITS.free

  // Calculate task usage
  const tasksUsed = usage?.execution_count || 0
  const tasksLimit = currentLimits?.tasksPerMonth ?? 100
  const tasksPercentage = tasksLimit === -1 ? 0 : Math.min((tasksUsed / tasksLimit) * 100, 100)

  const content = (
    <div className={`${isModal ? "space-y-6" : "space-y-8"}`}>
        {/* Welcome Banner */}
        {!isModal && showWelcome && currentSubscription && (
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 p-6 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-3 duration-500">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Welcome to {currentPlanInfo.name}!</h2>
                  <p className="text-white/80 mt-1">
                    You now have access to {currentLimits?.tasksPerMonth === -1 ? 'unlimited' : (currentLimits?.tasksPerMonth ?? 100).toLocaleString()} tasks per month.
                  </p>
                </div>
              </div>
              <CheckCircle className="h-12 w-12 text-white/60" />
            </div>
          </div>
        )}

        {/* Beta Tester Banner */}
        {isBetaTester && (
          <Card className="bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-950/50 dark:to-blue-950/50 border-purple-300 dark:border-purple-500/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-3 rounded-xl">
                  <Crown className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Beta Testing Program</h2>
                  <p className="text-gray-600 dark:text-slate-400 mt-1">
                    You have full Pro access during the beta period. Thank you for helping us improve!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Plan Summary Card */}
        {!isModal && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Plan */}
            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50 backdrop-blur-sm shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Current Plan</span>
                  <Badge variant="outline" className={`${
                    currentTier === 'free' ? 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600' :
                    currentTier === 'pro' ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' :
                    currentTier === 'team' ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30' :
                    currentTier === 'business' ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30' :
                    'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30'
                  }`}>
                    {currentPlanInfo.name}
                  </Badge>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                  ${currentPlanInfo.price}<span className="text-lg font-normal text-gray-500 dark:text-slate-500">/mo</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-slate-500">{currentPlanInfo.description}</p>
              </CardContent>
            </Card>

            {/* Task Usage */}
            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50 backdrop-blur-sm shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Tasks This Month</span>
                  <Zap className="w-5 h-5 text-yellow-500" />
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {tasksUsed.toLocaleString()}
                  <span className="text-lg font-normal text-gray-500 dark:text-slate-500">
                    /{tasksLimit === -1 ? '∞' : tasksLimit.toLocaleString()}
                  </span>
                </div>
                {tasksLimit !== -1 && (
                  <Progress
                    value={tasksPercentage}
                    className="h-2 bg-gray-200 dark:bg-slate-800"
                  />
                )}
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
                  {tasksLimit === -1 ? 'Unlimited tasks' : `${Math.max(0, tasksLimit - tasksUsed).toLocaleString()} tasks remaining`}
                </p>
              </CardContent>
            </Card>

            {/* Billing Cycle */}
            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50 backdrop-blur-sm shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500 dark:text-slate-400">Billing</span>
                  <CreditCard className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                </div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {currentSubscription?.billing_cycle === 'yearly' ? 'Annual' : 'Monthly'}
                </div>
                {currentSubscription?.current_period_end && (
                  <p className="text-sm text-gray-500 dark:text-slate-500">
                    Renews {new Date(currentSubscription.current_period_end).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                )}
                {!currentSubscription && (
                  <p className="text-sm text-gray-500 dark:text-slate-500">No active subscription</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Plan Selection Section */}
        <div className={isModal ? "" : "pt-4"}>
          <div className={`text-center ${isModal ? "mb-6" : "mb-10"}`}>
            <h2 className={`font-bold text-gray-900 dark:text-white ${isModal ? "text-2xl mb-2" : "text-3xl mb-3"}`}>
              {currentSubscription ? "Change Your Plan" : "Choose Your Plan"}
            </h2>
            <p className="text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
              Select the plan that best fits your workflow automation needs. Upgrade or downgrade anytime.
            </p>
          </div>

          <PlanSelector
            plans={plans}
            currentSubscription={currentSubscription}
            targetPlanId={targetPlanId || undefined}
            isModal={isModal}
          />
        </div>

        {/* Feature Comparison Section */}
        {!isModal && (
          <div className="pt-8 border-t border-gray-200 dark:border-slate-800">
            <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Compare Plan Features</h3>
              <p className="text-gray-600 dark:text-slate-400">See exactly what's included in each plan</p>
            </div>

            <FeatureComparisonTable />
          </div>
        )}

        {/* FAQ Section */}
        {!isModal && (
          <div className="pt-8 border-t border-gray-200 dark:border-slate-800">
            <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Frequently Asked Questions</h3>
              <p className="text-gray-600 dark:text-slate-400">Common questions about billing and plans</p>
            </div>

            <div className="max-w-3xl mx-auto space-y-4">
              <FaqItem
                question="What happens when I run out of tasks?"
                answer="When you reach your task limit, workflows will pause until the next billing cycle. Paid plans can purchase additional tasks at the overage rate shown on each plan. We'll notify you when you're approaching your limit."
                isOpen={showFaq === 'tasks'}
                onToggle={() => setShowFaq(showFaq === 'tasks' ? null : 'tasks')}
              />

              <FaqItem
                question="Can I switch plans at any time?"
                answer="Yes! You can upgrade instantly and get immediate access to new features. When downgrading, you'll keep your current plan's benefits until the end of your billing cycle. No long-term contracts required."
                isOpen={showFaq === 'switch'}
                onToggle={() => setShowFaq(showFaq === 'switch' ? null : 'switch')}
              />

              <FaqItem
                question="How does annual billing work?"
                answer="Annual billing saves you 17% compared to monthly billing (2 months free). You're charged once per year, and your task allocation is spread across all 12 months. Annual plans include the same features as monthly plans."
                isOpen={showFaq === 'annual'}
                onToggle={() => setShowFaq(showFaq === 'annual' ? null : 'annual')}
              />

              <FaqItem
                question="What counts as a task?"
                answer="Each node that executes in a workflow counts as tasks based on its complexity. Simple actions (like delays or branches) are free. API calls use 2-3 tasks. AI operations use 1-2 tasks. The average workflow uses about 10 tasks per run."
                isOpen={showFaq === 'counting'}
                onToggle={() => setShowFaq(showFaq === 'counting' ? null : 'counting')}
              />

              <FaqItem
                question="Do you offer refunds?"
                answer="We offer a 14-day money-back guarantee on all paid plans. If you're not satisfied, contact support within 14 days of your purchase for a full refund. After 14 days, we prorate refunds based on usage."
                isOpen={showFaq === 'refunds'}
                onToggle={() => setShowFaq(showFaq === 'refunds' ? null : 'refunds')}
              />

              <FaqItem
                question="What payment methods do you accept?"
                answer="We accept all major credit cards (Visa, Mastercard, American Express, Discover) through Stripe. Enterprise customers can also pay via invoice with NET-30 terms."
                isOpen={showFaq === 'payment'}
                onToggle={() => setShowFaq(showFaq === 'payment' ? null : 'payment')}
              />
            </div>
          </div>
        )}

        {/* Trust Badges */}
        {!isModal && (
          <div className="pt-8 border-t border-gray-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-center gap-8 text-gray-500 dark:text-slate-500">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <span className="text-sm">SSL Encrypted</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                <span className="text-sm">Powered by Stripe</span>
              </div>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                <span className="text-sm">Cancel Anytime</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm">14-Day Money Back</span>
              </div>
            </div>
          </div>
        )}
      </div>
  )

  // Wrap with layout if not modal
  if (isModal) {
    return content
  }

  return (
    <NewAppLayout title="Billing & Plans" subtitle="Manage your subscription and usage">
      {content}
    </NewAppLayout>
  )
}

// Feature Comparison Table Component
interface FeatureRow {
  name: string
  description: string
  free: boolean | string
  pro: boolean | string
  team: boolean | string
  business: boolean | string
  enterprise: boolean | string
}

const FEATURE_ROWS: FeatureRow[] = [
  // Core Limits - What differentiates plans
  {
    name: "Tasks per Month",
    description: "Number of workflow task executions included each month. This is the main usage limit - each workflow step consumes tasks.",
    free: "100",
    pro: "750",
    team: "2,000",
    business: "5,000",
    enterprise: "Unlimited"
  },
  {
    name: "Workflows",
    description: "Create and run unlimited workflows on all plans. Tasks are the natural limiter, not workflow count.",
    free: "Unlimited",
    pro: "Unlimited",
    team: "Unlimited",
    business: "Unlimited",
    enterprise: "Unlimited"
  },
  // Core Workflow Features - Everyone gets these
  {
    name: "Multi-Step Workflows",
    description: "Chain multiple actions together with data flowing between steps. Essential for any real automation.",
    free: true,
    pro: true,
    team: true,
    business: true,
    enterprise: true
  },
  {
    name: "Conditional Logic",
    description: "Add if/else branching to route data through different paths based on conditions.",
    free: true,
    pro: true,
    team: true,
    business: true,
    enterprise: true
  },
  {
    name: "Webhooks",
    description: "Trigger workflows instantly when events happen in external services (form submissions, payments, etc.)",
    free: true,
    pro: true,
    team: true,
    business: true,
    enterprise: true
  },
  {
    name: "Scheduling",
    description: "Run workflows automatically on schedules - hourly, daily, weekly, or custom cron expressions.",
    free: true,
    pro: true,
    team: true,
    business: true,
    enterprise: true
  },
  {
    name: "Error Notifications",
    description: "Get alerted when workflows fail so you can fix issues quickly.",
    free: true,
    pro: true,
    team: true,
    business: true,
    enterprise: true
  },
  // Premium Features - Upgrade drivers
  {
    name: "AI Agents (Claude)",
    description: "AI-powered nodes that can reason, analyze data, generate content, and make intelligent decisions. The key Pro feature.",
    free: false,
    pro: true,
    team: true,
    business: true,
    enterprise: true
  },
  {
    name: "Detailed Logs",
    description: "Full step-by-step execution logs with timestamps, input/output data, and API responses for debugging.",
    free: false,
    pro: true,
    team: true,
    business: true,
    enterprise: true
  },
  // Team Features
  {
    name: "Team Members",
    description: "Number of users who can access and collaborate on workflows.",
    free: "1",
    pro: "1",
    team: "5",
    business: "15",
    enterprise: "Unlimited"
  },
  {
    name: "Team Sharing",
    description: "Share workflows and integrations with your team members.",
    free: false,
    pro: false,
    team: true,
    business: true,
    enterprise: true
  },
  {
    name: "Shared Workspaces",
    description: "Collaborative workspaces where teams can build and manage workflows together.",
    free: false,
    pro: false,
    team: true,
    business: true,
    enterprise: true
  },
  {
    name: "Advanced Analytics",
    description: "Performance dashboards, usage trends, and exportable reports for your team.",
    free: false,
    pro: false,
    team: true,
    business: true,
    enterprise: true
  },
  // History & Support
  {
    name: "History Retention",
    description: "How long execution logs are stored for debugging and auditing.",
    free: "7 days",
    pro: "30 days",
    team: "90 days",
    business: "1 year",
    enterprise: "Unlimited"
  },
  {
    name: "Support",
    description: "Response times and support channels available to you.",
    free: "Community",
    pro: "Email",
    team: "Priority",
    business: "Dedicated",
    enterprise: "Dedicated"
  },
  // Enterprise Features
  {
    name: "SSO / SAML",
    description: "Single sign-on with identity providers like Okta, Azure AD, and OneLogin.",
    free: false,
    pro: false,
    team: false,
    business: false,
    enterprise: true
  },
  {
    name: "SLA Guarantee",
    description: "Guaranteed uptime with service credits if targets are missed.",
    free: false,
    pro: false,
    team: false,
    business: "99.9%",
    enterprise: "99.99%"
  },
  {
    name: "Custom Contracts",
    description: "Flexible billing, custom terms, and negotiated pricing for your organization.",
    free: false,
    pro: false,
    team: false,
    business: false,
    enterprise: true
  },
]

function FeatureComparisonTable() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const renderValue = (value: boolean | string) => {
    if (value === true) {
      return (
        <div className="flex justify-center">
          <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
        </div>
      )
    }
    if (value === false) {
      return (
        <div className="flex justify-center">
          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-400 dark:text-gray-600" />
          </div>
        </div>
      )
    }
    return (
      <span className="text-sm font-medium text-gray-900 dark:text-white">{value}</span>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-900 dark:text-white w-1/3">
              Feature
            </th>
            <th className="text-center py-4 px-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
              Free
            </th>
            <th className="text-center py-4 px-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
              Pro
            </th>
            <th className="text-center py-4 px-2 text-sm font-semibold text-green-600 dark:text-green-400">
              Team
            </th>
            <th className="text-center py-4 px-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
              Business
            </th>
            <th className="text-center py-4 px-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
              Enterprise
            </th>
          </tr>
        </thead>
        <tbody>
          {FEATURE_ROWS.map((feature, index) => (
            <tr
              key={feature.name}
              className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${
                index % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-gray-50/50 dark:bg-gray-900/20'
              }`}
            >
              <td className="py-4 px-4">
                <button
                  onClick={() => setExpandedRow(expandedRow === feature.name ? null : feature.name)}
                  className="text-left w-full group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {feature.name}
                    </span>
                    <HelpCircle className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {expandedRow === feature.name && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pr-4">
                      {feature.description}
                    </p>
                  )}
                </button>
              </td>
              <td className="py-4 px-2 text-center">{renderValue(feature.free)}</td>
              <td className="py-4 px-2 text-center bg-blue-50/50 dark:bg-blue-900/10">{renderValue(feature.pro)}</td>
              <td className="py-4 px-2 text-center">{renderValue(feature.team)}</td>
              <td className="py-4 px-2 text-center">{renderValue(feature.business)}</td>
              <td className="py-4 px-2 text-center">{renderValue(feature.enterprise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// FAQ Item Component
interface FaqItemProps {
  question: string
  answer: string
  isOpen: boolean
  onToggle: () => void
}

function FaqItem({ question, answer, isOpen, onToggle }: FaqItemProps) {
  return (
    <div className="bg-white dark:bg-gray-900/30 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
      >
        <span className="font-medium text-gray-900 dark:text-white">{question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-400 dark:text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 dark:text-slate-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-4">
          <p className="text-gray-600 dark:text-slate-400 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}
