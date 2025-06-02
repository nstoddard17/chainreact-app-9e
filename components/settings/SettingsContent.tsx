"use client"

import { useState } from "react"
import AppLayout from "@/components/layout/AppLayout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings, User, CreditCard, Bell, Shield, Key } from "lucide-react"
import ProfileSettings from "./ProfileSettings"
import BillingContent from "@/components/billing/BillingContent"

export default function SettingsContent() {
  const [activeTab, setActiveTab] = useState("profile")

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Settings className="w-6 h-6 text-slate-600" />
          <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
        </div>

        <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardContent className="p-0">
              <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0">
                <TabsTrigger
                  value="profile"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Billing
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Notifications
                </TabsTrigger>
                <TabsTrigger
                  value="security"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Security
                </TabsTrigger>
                <TabsTrigger
                  value="api"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Key className="w-4 h-4 mr-2" />
                  API Keys
                </TabsTrigger>
              </TabsList>
            </CardContent>
          </Card>

          <TabsContent value="profile" className="mt-6">
            <ProfileSettings />
          </TabsContent>

          <TabsContent value="billing" className="mt-6">
            <BillingContent />
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-slate-900">Notification Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500">Configure your notification preferences.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-slate-900">Security Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500">Manage your account security settings.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="mt-6">
            <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-slate-900">API Keys</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500">Manage your API keys for programmatic access.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
