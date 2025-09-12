"use client"

import { useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Loader2, CreditCard, AlertCircle } from "lucide-react"

interface SubscriptionDetailsProps {
  subscription: any
}

export default function SubscriptionDetails({ subscription }: SubscriptionDetailsProps) {
  const [loading, setLoading] = useState(false)
  const { cancelSubscription, reactivateSubscription, createPortalSession } = useBillingStore()

  const handleCancelSubscription = async () => {
    if (!subscription) return

    setLoading(true)
    try {
      await cancelSubscription()
    } catch (error) {
      console.error("Failed to cancel subscription:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleReactivateSubscription = async () => {
    if (!subscription) return

    setLoading(true)
    try {
      await reactivateSubscription()
    } catch (error) {
      console.error("Failed to reactivate subscription:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleManagePayment = async () => {
    if (!subscription) return

    setLoading(true)
    try {
      const portalUrl = await createPortalSession()
      window.location.href = portalUrl
    } catch (error) {
      console.error("Failed to create portal session:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!subscription) {
    return (
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-900">Current Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-slate-600">You don't have an active subscription.</p>
            <p className="text-slate-500 text-sm mt-2">Choose a plan below to get started.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const plan = subscription.plan
  const isActive = subscription.status === "active"
  const isCanceled = subscription.status === "canceled"
  const willCancel = subscription.cancel_at_period_end
  const periodEnd = new Date(subscription.current_period_end).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  
  // Calculate the correct price based on billing cycle
  const isMonthly = subscription.billing_cycle === "monthly"
  const price = isMonthly ? plan?.price_monthly : plan?.price_yearly
  const billingPeriod = isMonthly ? "month" : "year"

  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200 h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-slate-900">Current Subscription</CardTitle>
          <Badge
            className={`${
              isActive
                ? "bg-green-100 text-green-700"
                : isCanceled
                  ? "bg-red-100 text-red-700"
                  : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {willCancel ? "Canceling" : subscription.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-slate-900">{plan?.name || "Free Plan"}</h3>
            <p className="text-slate-500">
              {isMonthly ? "Monthly" : "Yearly"} billing •{" "}
              ${price !== undefined ? price : 0}/{billingPeriod}
            </p>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Current period ends</span>
              <span className="font-medium text-slate-900">{periodEnd}</span>
            </div>
            {willCancel && (
              <div className="text-sm text-red-600 mt-2">
                Your subscription will end on this date.
              </div>
            )}
          </div>
        </div>

        {willCancel && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-yellow-800">Subscription Scheduled for Cancellation</h4>
              <p className="text-sm text-yellow-700 mt-1">
                Your subscription will remain active until the end of the current billing period ({periodEnd}), after
                which it will be canceled. You can reactivate your subscription before this date.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
          <Button
            variant="outline"
            className="flex items-center justify-center w-full"
            onClick={handleManagePayment}
            disabled={loading || isCanceled}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Manage Payment
          </Button>

          {isActive && !willCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 w-full" disabled={loading}>
                  Cancel Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your subscription will remain active until the end of the current billing period ({periodEnd}),
                    after which it will be canceled and you'll lose access to premium features.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={handleCancelSubscription}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Cancel Subscription"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {isActive && willCancel && (
            <Button 
              variant="outline" 
              className="text-green-600 border-green-200 hover:bg-green-50 w-full" 
              onClick={handleReactivateSubscription}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Reactivate Subscription"
              )}
            </Button>
          )}
          
          {(!isActive || (isCanceled && !willCancel)) && (
            <div className="sm:col-span-1" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
