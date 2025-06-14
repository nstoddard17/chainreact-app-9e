"use client"

import type React from "react"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Workflow, LogOut } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/authStore"

interface PublicLayoutProps {
  children: React.ReactNode
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const { isAuthenticated, user } = useAuth()
  const { signOut } = useAuthStore()

  // Extract first name from various possible sources
  const getFirstName = () => {
    if (!user) return ""

    // Try user metadata first name
    if (user.user_metadata?.first_name) {
      return user.user_metadata.first_name
    }

    // Try user metadata full name and extract first part
    if (user.user_metadata?.name) {
      return user.user_metadata.name.split(" ")[0]
    }

    // Try the name field directly
    if (user.name) {
      return user.name.split(" ")[0]
    }

    // Fallback to email username if no name available
    if (user.email) {
      return user.email.split("@")[0]
    }

    return "User"
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <h1 className="text-xl font-bold text-indigo-600">ChainReact</h1>
              </Link>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-8">
              {!isAuthenticated && (
                <>
                  <Link href="/#features" className="text-slate-600 hover:text-slate-900">
                    Features
                  </Link>
                  <Link href="/#integrations" className="text-slate-600 hover:text-slate-900">
                    Integrations
                  </Link>
                  <Link href="/#pricing" className="text-slate-600 hover:text-slate-900">
                    Pricing
                  </Link>
                  <Link href="/support" className="text-slate-600 hover:text-slate-900">
                    Support
                  </Link>
                </>
              )}
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-slate-600 hidden sm:inline">Welcome, {getFirstName()}!</span>
                  <Link href="/dashboard">
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                      <Workflow className="h-4 w-4 mr-2" />
                      Dashboard
                    </Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => signOut()}>
                    <LogOut className="h-4 w-4" />
                    <span className="ml-2 hidden sm:inline">Sign Out</span>
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth/login">
                    <Button variant="ghost" size="sm">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  )
}
