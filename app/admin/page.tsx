"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { useAdminStore } from "@/stores/adminStore"
import AppLayout from "@/components/layout/AppLayout"
import UserRoleManagement from "@/components/admin/UserRoleManagement"
import AIUsageAdmin from "@/components/admin/AIUsageAdmin"
import BetaTestersContent from "@/components/admin/BetaTestersContent"
import WaitlistContent from "@/components/admin/WaitlistContent"
import { Crown, Shield, Users, Settings, User, Building, Zap, Sparkles, TestTube, FlaskConical, ListChecks } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RoleBadge } from "@/components/ui/role-badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type UserRole } from "@/lib/utils/roles"

export default function AdminPage() {
  const { profile, user } = useAuthStore()
  const { userStats, loading, fetchUserStats } = useAdminStore()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("overview")

  const userRole = (profile?.role as UserRole) || 'free'

  useEffect(() => {
    // Redirect non-admin users
    if (profile && profile.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [profile, router])

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchUserStats()
    }
  }, [profile, fetchUserStats])

  // Show loading while checking permissions
  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <LightningLoader size="lg" color="primary" />
      </div>
    )
  }

  // Redirect non-admin users
  if (profile.role !== 'admin') {
    return null
  }

  return (
    <AppLayout title="Admin Panel" subtitle="System administration and user management">
      <div className="w-full mx-auto p-6 space-y-8 max-w-[95vw]">
        {/* Admin Header */}
        <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-200/20 rounded-2xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Crown className="w-8 h-8 text-red-500" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
              <p className="text-muted-foreground">System administration and user management</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">Logged in as:</span>
            <span className="font-medium">{user?.email}</span>
            <RoleBadge role={userRole} />
          </div>
          
          {/* External Status Links */}
          <div className="mt-4 pt-4 border-t border-red-200/20">
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-muted-foreground">Infrastructure Status:</span>
              <a 
                href="https://status.vercel.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 transition-colors"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Vercel</span>
              </a>
              <a 
                href="https://status.supabase.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 transition-colors"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Supabase</span>
              </a>
            </div>
          </div>
        </div>

        {/* Admin Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="beta-testers" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Beta Testers
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Waitlist
            </TabsTrigger>
            <TabsTrigger value="ai-usage" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Usage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Admin Stats - First Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-card rounded-2xl shadow-lg border border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "Loading..." : userStats.totalUsers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All registered users
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card rounded-2xl shadow-lg border border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Free Users</CardTitle>
                  <User className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "Loading..." : userStats.freeUsers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Users with free plan
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card rounded-2xl shadow-lg border border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pro Users</CardTitle>
                  <Crown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "Loading..." : userStats.proUsers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Users with pro plan
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card rounded-2xl shadow-lg border border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Business Users</CardTitle>
                  <Building className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "Loading..." : userStats.businessUsers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Users with business plan
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Admin Stats - Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-card rounded-2xl shadow-lg border border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Beta Testers</CardTitle>
                  <FlaskConical className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "Loading..." : userStats.betaUsers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Active beta testers
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card rounded-2xl shadow-lg border border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Enterprise Users</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "Loading..." : userStats.enterpriseUsers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Users with enterprise plan
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card rounded-2xl shadow-lg border border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Admin Users</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? "Loading..." : userStats.adminUsers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    System administrators
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <UserRoleManagement />
          </TabsContent>

          <TabsContent value="beta-testers" className="space-y-6">
            <BetaTestersContent />
          </TabsContent>

          <TabsContent value="waitlist" className="space-y-6">
            <WaitlistContent />
          </TabsContent>

          <TabsContent value="ai-usage" className="space-y-6">
            <AIUsageAdmin />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
} 