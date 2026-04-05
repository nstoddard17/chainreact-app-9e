"use client"

import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { VisuallyHidden } from "@/components/ui/visually-hidden"
import { Zap, Crown, Gift, Info, User } from "lucide-react"
import dynamic from "next/dynamic"

const BillingContent = dynamic(() => import("@/components/billing/BillingContent"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-12">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  ),
})

export function TaskUsageWidget() {
  const { profile, user } = useAuthStore()
  const { toast } = useToast()
  const [creditsModalOpen, setCreditsModalOpen] = useState(false)
  const [upgradePlanModalOpen, setUpgradePlanModalOpen] = useState(false)
  const [freeCreditsModalOpen, setFreeCreditsModalOpen] = useState(false)
  const [socialPostUrl, setSocialPostUrl] = useState("")

  const tasksUsed = profile?.tasks_used ?? 0
  const tasksLimit = profile?.tasks_limit ?? null

  const userReferralLink = profile?.id
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${profile.id}`
    : ""

  return (
    <>
      <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3 space-y-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs font-medium text-slate-200">Tasks This Month</span>
            <button
              onClick={() => setCreditsModalOpen(true)}
              className="hover:bg-slate-700 rounded-full p-0.5 transition-colors"
            >
              <Info className="w-3 h-3 text-slate-400 cursor-pointer" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 px-0.5">
            <User className="w-2.5 h-2.5 text-slate-500" />
            <span className="text-[10px] text-slate-500">Personal</span>
          </div>
          {tasksLimit != null ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  {tasksUsed} / {tasksLimit} used
                </span>
                <span className="text-[10px] text-slate-400">
                  {Math.round((tasksUsed / tasksLimit) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1">
                <div
                  className="bg-green-500 rounded-full h-1 transition-all"
                  style={{ width: `${Math.min((tasksUsed / tasksLimit) * 100, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-slate-500">Loading...</span>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="flex-1 h-6 text-[10px] bg-green-600 hover:bg-green-500 text-white"
            onClick={() => setUpgradePlanModalOpen(true)}
          >
            <Crown className="w-2.5 h-2.5 mr-0.5" />
            Upgrade
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-6 text-[10px] border-slate-600 text-slate-300 hover:bg-slate-700"
            onClick={() => setFreeCreditsModalOpen(true)}
          >
            <Gift className="w-2.5 h-2.5 mr-0.5" />
            Free Tasks
          </Button>
        </div>
      </div>

      {/* Tasks Info Modal */}
      <Dialog open={creditsModalOpen} onOpenChange={setCreditsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              How Tasks Work
            </DialogTitle>
            <DialogDescription>
              Understand how tasks are counted in ChainReact
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">What is a Task?</h3>
              <p className="text-sm text-muted-foreground">
                A task is counted each time a workflow successfully runs. Every time your workflow executes from start to finish, it uses one task from your monthly allowance.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Task Limits by Plan</h3>
              <div className="rounded-lg border bg-primary/5 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Free:</span>
                    <span className="font-medium">100 tasks/month</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Starter:</span>
                    <span className="font-medium">1,000 tasks/month</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Professional:</span>
                    <span className="font-medium">5,000 tasks/month</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Team:</span>
                    <span className="font-medium">50,000 tasks/month</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Need More Tasks?</h3>
              <div className="space-y-2">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setCreditsModalOpen(false)
                    setUpgradePlanModalOpen(true)
                  }}
                >
                  <Crown className="w-3.5 h-3.5 mr-2" />
                  Upgrade Your Plan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setCreditsModalOpen(false)
                    setFreeCreditsModalOpen(true)
                  }}
                >
                  <Gift className="w-3.5 h-3.5 mr-2" />
                  Get Free Tasks
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Plan Modal */}
      <Dialog open={upgradePlanModalOpen} onOpenChange={setUpgradePlanModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <VisuallyHidden>
            <DialogTitle>Choose Your Plan</DialogTitle>
          </VisuallyHidden>
          <BillingContent isModal={true} />
        </DialogContent>
      </Dialog>

      {/* Get Free Tasks Modal */}
      <Dialog open={freeCreditsModalOpen} onOpenChange={setFreeCreditsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Get Free Tasks</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Choose from the options below to earn additional tasks
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Share Your Success */}
            <div className="rounded-lg border-2 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">Share Your Success</h3>
                  <div className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <span>1500</span>
                    <Zap className="w-3 h-3" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Share your success story on LinkedIn or X. Screenshot and email to{" "}
                  <a href="mailto:hello@chainreact.app" className="text-primary hover:underline font-medium">
                    hello@chainreact.app
                  </a>
                </p>
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Paste your post URL"
                  value={socialPostUrl}
                  onChange={(e) => setSocialPostUrl(e.target.value)}
                  className="h-9 text-sm"
                />
                <Button
                  className="w-full h-9 text-sm"
                  disabled={!socialPostUrl}
                  onClick={async () => {
                    try {
                      let platform: "twitter" | "linkedin" | "x" = "x"
                      if (socialPostUrl.includes("linkedin.com")) {
                        platform = "linkedin"
                      } else if (socialPostUrl.includes("twitter.com") || socialPostUrl.includes("x.com")) {
                        platform = socialPostUrl.includes("x.com") ? "x" : "twitter"
                      } else {
                        toast({ title: "Invalid URL", description: "Please enter a valid LinkedIn or X post URL", variant: "destructive" })
                        return
                      }
                      const response = await fetch("/api/social-posts/submit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ postUrl: socialPostUrl, platform }),
                      })
                      const data = await response.json()
                      if (!response.ok) {
                        toast({ title: "Submission Failed", description: data.error || "Failed to submit post", variant: "destructive" })
                        return
                      }
                      toast({ title: "Success!", description: data.message || "1,500 tasks added! We'll verify your post in 7 days." })
                      setSocialPostUrl("")
                      setFreeCreditsModalOpen(false)
                      window.location.reload()
                    } catch {
                      toast({ title: "Error", description: "Failed to submit post. Please try again.", variant: "destructive" })
                    }
                  }}
                >
                  Share & Earn
                </Button>
              </div>
            </div>

            {/* Invite Friends */}
            <div className="rounded-lg border-2 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">Invite Friends</h3>
                  <div className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <span>1000</span>
                    <Zap className="w-3 h-3" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Get 1000 tasks per friend. Help your team discover ChainReact.
                </p>
              </div>
              <div className="space-y-2">
                <Input readOnly value={userReferralLink} className="text-xs font-mono h-9" />
                <Button
                  variant="outline"
                  className="w-full h-9 text-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(userReferralLink)
                    toast({ title: "Copied!", description: "Referral link copied" })
                  }}
                >
                  Copy Link
                </Button>
              </div>
            </div>

            {/* Feedback Call */}
            <div className="rounded-lg border-2 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">Feedback Call</h3>
                  <div className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <span>500</span>
                    <Zap className="w-3 h-3" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  10 minutes = 500 tasks. Share your experience and help shape ChainReact's future.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full h-9 text-sm"
                onClick={() => toast({ title: "Coming Soon", description: "Scheduling will be available soon!" })}
              >
                Book Call
              </Button>
            </div>

            {/* Redeem Coupon */}
            <div className="rounded-lg border-2 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">Redeem Coupon</h3>
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Have a coupon code? Enter your code below to redeem tasks.
                </p>
              </div>
              <div className="space-y-2">
                <Input placeholder="Enter coupon code" className="h-9 text-sm" />
                <Button variant="outline" className="w-full h-9 text-sm" disabled>
                  Redeem
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
