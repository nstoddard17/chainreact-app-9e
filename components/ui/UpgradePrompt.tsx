"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Zap, TrendingUp, Crown, Users, Shield } from "lucide-react"
import Link from "next/link"

interface UpgradePromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  usageType: "ai_assistant" | "ai_compose" | "ai_agent"
  currentUsage: number
  limit: number
}

const planFeatures = {
  pro: [
    "20 AI messages per month",
    "Up to 20 workflows",
    "Advanced integrations",
    "Priority support",
    "Custom templates"
  ],
  business: [
    "100 AI messages per month",
    "Unlimited workflows",
    "Team collaboration",
    "Advanced analytics",
    "API access",
    "Dedicated support"
  ],
  enterprise: [
    "100 AI messages per month",
    "Everything in Business",
    "Custom integrations",
    "SLA guarantees",
    "On-premise deployment",
    "24/7 support"
  ]
}

export default function UpgradePrompt({ 
  open, 
  onOpenChange, 
  usageType, 
  currentUsage, 
  limit 
}: UpgradePromptProps) {
  const [selectedPlan, setSelectedPlan] = useState<"pro" | "business" | "enterprise">("pro")

  const getUsageTypeName = () => {
    switch (usageType) {
      case "ai_assistant": return "AI Assistant"
      case "ai_compose": return "AI Compose"
      case "ai_agent": return "AI Agent"
      default: return "AI Feature"
    }
  }

  const getUsageTypeIcon = () => {
    switch (usageType) {
      case "ai_assistant": return <Zap className="w-5 h-5" />
      case "ai_compose": return <Zap className="w-5 h-5" />
      case "ai_agent": return <Zap className="w-5 h-5" />
      default: return <Zap className="w-5 h-5" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getUsageTypeIcon()}
            Upgrade for More AI Power
          </DialogTitle>
          <DialogDescription>
            You've reached your {getUsageTypeName()} usage limit ({currentUsage}/{limit} messages). 
            Upgrade your plan to continue using AI features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Usage Warning */}
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-600 dark:text-red-400" />
              <div>
                <h4 className="font-semibold text-red-900 dark:text-red-300">Usage Limit Reached</h4>
                <p className="text-sm text-red-700 dark:text-red-400">
                  You've used {currentUsage} out of {limit} {getUsageTypeName()} messages this month.
                </p>
              </div>
            </div>
          </div>

          {/* Plan Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Choose Your Plan</h3>
            
            {/* Pro Plan */}
            <div
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedPlan === "pro"
                  ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
              onClick={() => setSelectedPlan("pro")}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">Pro</h4>
                  <Badge variant="secondary">$20/month</Badge>
                </div>
                {selectedPlan === "pro" && (
                  <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                {planFeatures.pro.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Business Plan */}
            <div
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedPlan === "business"
                  ? "border-rose-500 bg-rose-50 dark:bg-rose-900/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
              onClick={() => setSelectedPlan("business")}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">Business</h4>
                  <Badge variant="secondary">$100/month</Badge>
                </div>
                {selectedPlan === "business" && (
                  <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                {planFeatures.business.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Enterprise Plan */}
            <div
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedPlan === "enterprise"
                  ? "border-pink-500 bg-pink-50 dark:bg-pink-900/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
              onClick={() => setSelectedPlan("enterprise")}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">Enterprise</h4>
                  <Badge variant="secondary">Contact Sales</Badge>
                </div>
                {selectedPlan === "enterprise" && (
                  <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                {planFeatures.enterprise.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-pink-500 rounded-full"></div>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Maybe Later
            </Button>
            <Link href="/settings/billing" className="flex-1">
              <Button className="w-full">
                Upgrade to {selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 