"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, CreditCard, Building2, Users, User, Loader2, ExternalLink, CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface BillingEntity {
  id: string
  name: string
  type: 'personal' | 'organization' | 'team'
  plan: string
  credits?: number
  billingSource: 'owner' | 'organization'
  isOwner: boolean
}

export default function BillingOverview() {
  const { profile, user } = useAuthStore()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [billingEntities, setBillingEntities] = useState<BillingEntity[]>([])
  const [openingPortal, setOpeningPortal] = useState(false)

  // Check if user is a beta tester
  const isBetaTester = profile?.role === 'beta-pro'

  useEffect(() => {
    fetchAllBilling()
  }, [user, profile])

  const fetchAllBilling = async () => {
    if (!user || !profile) return

    try {
      setLoading(true)
      const entities: BillingEntity[] = []

      // 1. Add personal billing
      entities.push({
        id: user.id,
        name: 'Personal Account',
        type: 'personal',
        plan: profile.plan || 'free',
        credits: profile.credits || 0,
        billingSource: 'owner',
        isOwner: true
      })

      // 2. Fetch organizations where user is owner
      const orgsResponse = await fetch('/api/organizations')
      if (orgsResponse.ok) {
        const orgsData = await orgsResponse.json()
        const ownedOrgs = (orgsData.organizations || []).filter(
          (org: any) => org.owner_id === user.id && !org.is_workspace
        )

        // Fetch full details including billing for each organization
        for (const org of ownedOrgs) {
          const orgDetailResponse = await fetch(`/api/organizations/${org.id}`)
          if (orgDetailResponse.ok) {
            const orgDetail = await orgDetailResponse.json()
            entities.push({
              id: orgDetail.id,
              name: orgDetail.name,
              type: 'organization',
              plan: orgDetail.billing?.plan || 'free',
              credits: orgDetail.billing?.credits || 0,
              billingSource: orgDetail.billing?.billing_source || 'owner',
              isOwner: true
            })
          }
        }
      }

      // 3. Fetch standalone teams where user is owner (no organization_id)
      const teamsResponse = await fetch('/api/teams/my-teams')
      if (teamsResponse.ok) {
        const teamsData = await teamsResponse.json()
        const ownedTeams = (teamsData.teams || []).filter(
          (team: any) => !team.organization_id && team.user_role === 'owner'
        )

        for (const team of ownedTeams) {
          // Fetch full team details to get billing info
          const teamDetailResponse = await fetch(`/api/teams/${team.id}`)
          if (teamDetailResponse.ok) {
            const teamDetail = await teamDetailResponse.json()
            entities.push({
              id: teamDetail.id,
              name: teamDetail.name,
              type: 'team',
              plan: teamDetail.billing?.plan || 'free',
              credits: teamDetail.billing?.credits || 0,
              billingSource: teamDetail.billing?.billing_source || 'owner',
              isOwner: true
            })
          }
        }
      }

      setBillingEntities(entities)
    } catch (error) {
      console.error('Error fetching billing:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenBillingPortal = async () => {
    try {
      setOpeningPortal(true)
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.error === 'No subscription found') {
          toast.error('No subscription found. Redirecting to upgrade...')
          router.push('/settings/billing')
          return
        }
        toast.error(error.error || 'Failed to open billing portal')
        return
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      } else {
        toast.error('No portal URL returned from Stripe')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to open billing portal')
    } finally {
      setOpeningPortal(false)
    }
  }

  const handleUpgrade = () => {
    router.push('/settings/billing')
  }

  const getPlanColor = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'pro':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20'
      case 'enterprise':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
      case 'beta':
        return 'bg-gradient-to-r from-rose-500/10 to-orange-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
      default:
        return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
    }
  }

  const getPlanFeatures = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'pro':
        return ['Unlimited workflows', 'Up to 25 team members', 'Email support', 'Advanced integrations']
      case 'enterprise':
        return ['Unlimited workflows', 'Unlimited team members', 'Priority support', 'Custom integrations']
      case 'beta':
        return ['Full Pro access', 'Early features', 'Priority support', 'Community feedback']
      default:
        return ['Up to 5 workflows', 'Up to 5 team members', 'Community support', 'Basic integrations']
    }
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'organization':
        return <Building2 className="w-5 h-5" />
      case 'team':
        return <Users className="w-5 h-5" />
      default:
        return <User className="w-5 h-5" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show special view for beta testers
  if (isBetaTester) {
    return (
      <div className="space-y-6">
        <Card className="bg-gradient-to-r from-rose-500/10 to-orange-500/10 border-rose-500/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="bg-gradient-to-r from-rose-500 to-orange-500 p-3 rounded-full">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">Beta Testing Program</h2>
                <p className="text-muted-foreground mb-4">
                  You're currently enrolled in our beta testing program with full Pro access.
                  Thank you for helping us improve ChainReact!
                </p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {getPlanFeatures('beta').map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-orange-500/10 rounded-lg">
                  <p className="text-sm">
                    <strong>Note:</strong> As a beta tester, you have free access to Pro features.
                    When your beta period ends, you'll receive a special discount to continue with a paid plan.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Your Subscriptions</h3>
        <p className="text-sm text-muted-foreground">
          Manage billing for your personal account and any organizations or teams you own
        </p>
      </div>

      {/* Billing Entities Grid */}
      <div className="grid gap-4">
        {billingEntities.map((entity) => (
          <Card key={entity.id} className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    {getEntityIcon(entity.type)}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{entity.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {entity.type === 'personal' ? 'Your personal subscription' :
                       entity.type === 'organization' ? 'Organization subscription' :
                       'Standalone team subscription'}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className={cn("font-semibold", getPlanColor(entity.plan))}>
                  {entity.plan.charAt(0).toUpperCase() + entity.plan.slice(1)} Plan
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Plan Features */}
              <div className="grid grid-cols-2 gap-3">
                {getPlanFeatures(entity.plan).map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Credits Display */}
              {entity.credits !== undefined && entity.credits > 0 && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">
                    {entity.credits.toLocaleString()} credits remaining
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {entity.plan === 'free' ? (
                  <Button onClick={handleUpgrade} className="flex-1" size="sm">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Upgrade Plan
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleOpenBillingPortal}
                    disabled={openingPortal}
                    className="flex-1"
                    size="sm"
                  >
                    {openingPortal ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Manage Billing
                      </>
                    )}
                  </Button>
                )}

                {entity.type !== 'personal' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (entity.type === 'organization') {
                        router.push(`/organization-settings?org=${entity.id}&section=billing`)
                      } else {
                        router.push(`/team-settings?team=${entity.id}&section=billing`)
                      }
                    }}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Billing Source Note */}
              {entity.billingSource === 'owner' && entity.type !== 'personal' && (
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  This {entity.type} inherits billing from your personal account
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stripe Customer Portal Info */}
      {billingEntities.some(e => e.plan !== 'free') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing Portal</CardTitle>
            <CardDescription>
              Manage your payment methods, view invoices, and update billing information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All billing is securely managed through Stripe's customer portal where you can:
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 ml-4 list-disc">
              <li>Update payment methods</li>
              <li>View billing history and download invoices</li>
              <li>Update billing address and contact information</li>
              <li>Cancel or modify your subscription</li>
            </ul>
            <Button
              variant="outline"
              onClick={handleOpenBillingPortal}
              disabled={openingPortal}
              className="w-full"
            >
              {openingPortal ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Opening Portal...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Stripe Customer Portal
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
