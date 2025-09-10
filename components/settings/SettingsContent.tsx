"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings, CreditCard, Bell, Shield, Key, Trash2 } from "lucide-react"
import BillingContent from "@/components/billing/BillingContent"
import DataDeletionSettings from "./DataDeletionSettings"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"

export default function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("billing")
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Handle URL parameters for success/canceled states
  useEffect(() => {
    const tab = searchParams.get("tab")
    const success = searchParams.get("success")
    const canceled = searchParams.get("canceled")
    
    // Set the active tab if specified in URL
    if (tab) {
      setActiveTab(tab)
    }
    
    // Handle success state from Stripe checkout
    if (success === "true") {
      // Check if this is a new subscription or an update
      const action = searchParams.get("action") || "upgraded"
      
      const messages = {
        upgraded: {
          title: "🎉 Welcome to Pro!",
          description: "Your subscription has been activated successfully. You now have access to all Pro features including unlimited workflows, advanced integrations, and priority support."
        },
        changed: {
          title: "✅ Plan Changed Successfully",
          description: "Your subscription plan has been updated. Changes will take effect immediately."
        },
        reactivated: {
          title: "🔄 Subscription Reactivated",
          description: "Welcome back! Your subscription has been reactivated successfully."
        }
      }
      
      const message = messages[action as keyof typeof messages] || messages.upgraded
      
      toast({
        title: message.title,
        description: message.description,
        duration: 6000,
      })
      
      // Set flag for billing component to show welcome banner
      if (action === "upgraded") {
        sessionStorage.setItem("just_upgraded", "true")
      }
      
      // Clean up the URL parameters
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete("success")
      newUrl.searchParams.delete("action")
      newUrl.searchParams.delete("tab")
      router.replace(newUrl.pathname + "?tab=billing")
    }
    
    // Handle canceled state from Stripe checkout
    if (canceled === "true") {
      toast({
        title: "Checkout Canceled",
        description: "Your subscription upgrade was canceled. You can try again anytime.",
        variant: "default",
        duration: 5000,
      })
      
      // Clean up the URL parameters
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete("canceled")
      newUrl.searchParams.delete("tab")
      router.replace(newUrl.pathname + "?tab=billing")
    }
  }, [searchParams, router])

  async function handleFacebookDelete() {
    setDeleting(true)
    try {
      const res = await fetch("/api/integrations/facebook/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInitiated: true }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: "Request Submitted", description: data.message || "Your Facebook data deletion request has been received." })
      } else {
        toast({ title: "Error", description: data.message || "Failed to submit deletion request.", variant: "destructive" })
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to submit deletion request.", variant: "destructive" })
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const tabHeaders = {
    billing: {
      title: "Billing & Subscription",
      subtitle: "Manage your subscription and view usage statistics"
    },
    notifications: {
      title: "Notification Settings",
      subtitle: "Configure your notification preferences"
    },
    privacy: {
      title: "Privacy Settings",
      subtitle: "Manage your privacy and data settings"
    },
    api: {
      title: "API Keys",
      subtitle: "Manage your API keys for programmatic access"
    }
  }

  const currentHeader = tabHeaders[activeTab as keyof typeof tabHeaders]

  return (
    <AppLayout title="Settings">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">{currentHeader.title}</h1>
          <p className="text-slate-400 mt-3 text-lg">{currentHeader.subtitle}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
          </TabsList>

          <TabsContent value="billing" className="mt-6">
            <BillingContent />
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            <Card className="bg-card rounded-2xl shadow-lg border border-border">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-card-foreground">Notification Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Configure your notification preferences.</p>
                {/* Add notification settings here */}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="privacy" className="mt-6">
            <DataDeletionSettings />
          </TabsContent>

          <TabsContent value="api" className="mt-6">
            <Card className="bg-card rounded-2xl shadow-lg border border-border">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-card-foreground">API Keys</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Manage your API keys for programmatic access.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
