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
  ArrowLeft,
  Zap,
  Users,
  Clock,
  Shield,
  HelpCircle,
  CreditCard,
  RefreshCw,
  TrendingUp,
  Layers,
  Bot,
  Webhook,
  Calendar,
  BarChart3,
  Headphones,
  Building2,
  Crown,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { useSearchParams, useRouter } from "next/navigation"
import { LoadingScreen } from "@/components/ui/loading-screen"
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
      <LoadingScreen
        title="Loading Billing"
        description="Fetching your subscription details..."
        size="lg"
      />
    )
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Card className="bg-red-950/20 border-red-900/50 max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
              <HelpCircle className="w-6 h-6 text-red-400" />
            </div>
            <div className="text-red-400">{error}</div>
            <Button onClick={() => fetchAll()} variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentTier = currentSubscription?.plan?.name
    ? mapPlanNameToTier(currentSubscription.plan.name)
    : 'free'
  const currentPlanInfo = PLAN_INFO[currentTier]
  const currentLimits = PLAN_LIMITS[currentTier]

  // Calculate task usage
  const tasksUsed = usage?.execution_count || 0
  const tasksLimit = currentLimits.tasksPerMonth
  const tasksPercentage = tasksLimit === -1 ? 0 : Math.min((tasksUsed / tasksLimit) * 100, 100)

  return (
    <div className={`${isModal ? "" : "min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950"}`}>
      <div className={`${isModal ? "space-y-6" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10"}`}>

        {/* Header */}
        {!isModal && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="h-6 w-px bg-slate-700" />
              <h1 className="text-2xl font-bold text-white">Billing & Plans</h1>
            </div>
          </div>
        )}

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
                    You now have access to {currentLimits.tasksPerMonth === -1 ? 'unlimited' : currentLimits.tasksPerMonth.toLocaleString()} tasks per month.
                  </p>
                </div>
              </div>
              <CheckCircle className="h-12 w-12 text-white/60" />
            </div>
          </div>
        )}

        {/* Beta Tester Banner */}
        {isBetaTester && (
          <Card className="bg-gradient-to-r from-purple-950/50 to-blue-950/50 border-purple-500/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-3 rounded-xl">
                  <Crown className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Beta Testing Program</h2>
                  <p className="text-slate-400 mt-1">
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
            <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400">Current Plan</span>
                  <Badge className={`${
                    currentTier === 'free' ? 'bg-slate-700 text-slate-300' :
                    currentTier === 'pro' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                    currentTier === 'team' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                    currentTier === 'business' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                    'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {currentPlanInfo.name}
                  </Badge>
                </div>
                <div className="text-3xl font-bold text-white mb-1">
                  ${currentPlanInfo.price}<span className="text-lg font-normal text-slate-500">/mo</span>
                </div>
                <p className="text-sm text-slate-500">{currentPlanInfo.description}</p>
              </CardContent>
            </Card>

            {/* Task Usage */}
            <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400">Tasks This Month</span>
                  <Zap className="w-5 h-5 text-yellow-500" />
                </div>
                <div className="text-3xl font-bold text-white mb-2">
                  {tasksUsed.toLocaleString()}
                  <span className="text-lg font-normal text-slate-500">
                    /{tasksLimit === -1 ? '∞' : tasksLimit.toLocaleString()}
                  </span>
                </div>
                {tasksLimit !== -1 && (
                  <Progress
                    value={tasksPercentage}
                    className="h-2 bg-slate-800"
                  />
                )}
                <p className="text-xs text-slate-500 mt-2">
                  {tasksLimit === -1 ? 'Unlimited tasks' : `${Math.max(0, tasksLimit - tasksUsed).toLocaleString()} tasks remaining`}
                </p>
              </CardContent>
            </Card>

            {/* Billing Cycle */}
            <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400">Billing</span>
                  <CreditCard className="w-5 h-5 text-slate-500" />
                </div>
                <div className="text-lg font-semibold text-white mb-1">
                  {currentSubscription?.billing_cycle === 'yearly' ? 'Annual' : 'Monthly'}
                </div>
                {currentSubscription?.current_period_end && (
                  <p className="text-sm text-slate-500">
                    Renews {new Date(currentSubscription.current_period_end).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                )}
                {!currentSubscription && (
                  <p className="text-sm text-slate-500">No active subscription</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Plan Selection Section */}
        <div className={isModal ? "" : "pt-4"}>
          <div className={`text-center ${isModal ? "mb-6" : "mb-10"}`}>
            <h2 className={`font-bold text-white ${isModal ? "text-2xl mb-2" : "text-3xl mb-3"}`}>
              {currentSubscription ? "Change Your Plan" : "Choose Your Plan"}
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
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

        {/* Feature Explanations Section */}
        {!isModal && (
          <div className="pt-8 border-t border-slate-800">
            <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-white mb-3">Understanding Your Plan</h3>
              <p className="text-slate-400">Learn what each feature means and how it benefits your workflows</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Tasks */}
              <FeatureExplanation
                icon={<Zap className="w-5 h-5" />}
                title="Tasks"
                description="Each workflow step that executes counts as a task. A 5-node workflow uses ~10 tasks per run. Tasks reset monthly."
                color="yellow"
              />

              {/* AI Agents */}
              <FeatureExplanation
                icon={<Bot className="w-5 h-5" />}
                title="AI Agents"
                description="Intelligent automation powered by Claude AI. Create agents that can reason, make decisions, and handle complex multi-step processes."
                color="purple"
              />

              {/* Team Members */}
              <FeatureExplanation
                icon={<Users className="w-5 h-5" />}
                title="Team Members"
                description="Collaborate with your team on workflows. Share integrations, edit together, and manage permissions across your organization."
                color="blue"
              />

              {/* Webhooks */}
              <FeatureExplanation
                icon={<Webhook className="w-5 h-5" />}
                title="Webhooks"
                description="Receive real-time data from external services. Trigger workflows instantly when events happen in your connected apps."
                color="green"
              />

              {/* Scheduling */}
              <FeatureExplanation
                icon={<Calendar className="w-5 h-5" />}
                title="Scheduling"
                description="Run workflows on a schedule - hourly, daily, weekly, or custom cron expressions. Perfect for recurring automation tasks."
                color="cyan"
              />

              {/* Analytics */}
              <FeatureExplanation
                icon={<BarChart3 className="w-5 h-5" />}
                title="Advanced Analytics"
                description="Track workflow performance, execution times, success rates, and usage trends. Identify bottlenecks and optimize your automations."
                color="pink"
              />

              {/* History Retention */}
              <FeatureExplanation
                icon={<Clock className="w-5 h-5" />}
                title="History Retention"
                description="Access logs and execution history for debugging. Free plans keep 7 days; higher tiers retain up to 1 year of history."
                color="orange"
              />

              {/* Priority Support */}
              <FeatureExplanation
                icon={<Headphones className="w-5 h-5" />}
                title="Priority Support"
                description="Get faster response times and dedicated help from our team. Business and Enterprise plans include dedicated success managers."
                color="indigo"
              />

              {/* SSO/SAML */}
              <FeatureExplanation
                icon={<Shield className="w-5 h-5" />}
                title="SSO & Security"
                description="Enterprise-grade security with SAML single sign-on, audit logs, and custom security policies. Available on Enterprise plans."
                color="red"
              />
            </div>
          </div>
        )}

        {/* FAQ Section */}
        {!isModal && (
          <div className="pt-8 border-t border-slate-800">
            <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-white mb-3">Frequently Asked Questions</h3>
              <p className="text-slate-400">Common questions about billing and plans</p>
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
          <div className="pt-8 border-t border-slate-800">
            <div className="flex flex-wrap items-center justify-center gap-8 text-slate-500">
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
    </div>
  )
}

// Feature Explanation Component
interface FeatureExplanationProps {
  icon: React.ReactNode
  title: string
  description: string
  color: 'yellow' | 'purple' | 'blue' | 'green' | 'cyan' | 'pink' | 'orange' | 'indigo' | 'red'
}

function FeatureExplanation({ icon, title, description, color }: FeatureExplanationProps) {
  const colorClasses = {
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    pink: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  return (
    <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
      <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-4 border`}>
        {icon}
      </div>
      <h4 className="text-white font-semibold mb-2">{title}</h4>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
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
    <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
      >
        <span className="font-medium text-white">{question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-4">
          <p className="text-slate-400 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}
