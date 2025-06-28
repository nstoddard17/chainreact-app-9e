"use client"

import { useAuthStore } from "@/stores/authStore"
import { canAccessPage, type UserRole } from "@/lib/utils/roles"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Crown, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PageProtectionProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export default function PageProtection({ children, requiredRole }: PageProtectionProps) {
  const { profile, user } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()
  
  const userRole = (profile?.role || 'free') as UserRole

  useEffect(() => {
    // If user is not authenticated, redirect to login
    if (!user) {
      router.push('/auth/login')
      return
    }

    // Allow access to setup-username page for users without usernames
    if (pathname === '/setup-username' && !profile?.username) {
      return
    }

    // Redirect users without usernames to setup page (except for setup-username page itself)
    if (!profile?.username && pathname !== '/setup-username') {
      router.push('/setup-username')
      return
    }

    // Allow access to profile and settings pages for all authenticated users
    if (pathname === '/profile' || pathname === '/settings' || pathname.startsWith('/settings/')) {
      return
    }

    // If page requires a specific role, check if user has it
    if (requiredRole && !canAccessPage(userRole, pathname)) {
      router.push('/dashboard')
      return
    }

    // Check if user can access the current page
    if (!canAccessPage(userRole, pathname)) {
      router.push('/dashboard')
    }
  }, [user, userRole, pathname, router, requiredRole, profile])

  // Show loading while checking permissions
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Show access denied if user doesn't have permission
  if (!canAccessPage(userRole, pathname)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <Lock className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You don't have permission to access this page with your current role ({profile?.role}).
            </p>
            <div className="flex flex-col space-y-2">
              <Button onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => router.push('/settings/billing')}>
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
} 