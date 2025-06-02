"use client"

import type React from "react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X, User, LogOut } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"

interface PublicLayoutProps {
  children: React.ReactNode
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user, session, loading, initialize, signOut, profile } = useAuthStore()

  // Initialize auth on component mount
  useEffect(() => {
    initialize()
  }, [initialize])

  const handlePageNavigation = (path: string) => {
    // Close mobile menu if open
    setMobileMenuOpen(false)
    // Scroll to top after navigation
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }, 100)
  }

  const handleMobileMenuClose = () => {
    setMobileMenuOpen(false)
  }

  const handleSignOut = async () => {
    await signOut()
    setMobileMenuOpen(false)
  }

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  const isLoggedIn = !!user && !!session

  // Get the first name from profile or user metadata
  const firstName =
    profile?.first_name || user?.user_metadata?.first_name || (user?.email ? user.email.split("@")[0] : "User")

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Link href="/" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                  <h1 className="text-2xl font-bold text-indigo-600 cursor-pointer">ChainReact</h1>
                </Link>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <Link href="/#features" className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
                  Features
                </Link>
                <Link
                  href="/#integrations"
                  className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium"
                >
                  Integrations
                </Link>
                <Link href="/#pricing" className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
                  Pricing
                </Link>
                <Link
                  href="/templates"
                  className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium"
                  onClick={() => handlePageNavigation("/templates")}
                >
                  Templates
                </Link>
                <Link
                  href="/support"
                  className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium"
                  onClick={() => handlePageNavigation("/support")}
                >
                  Support
                </Link>
              </div>
            </div>

            {/* Desktop Auth Buttons */}
            <div className="hidden md:flex items-center space-x-4">
              {isLoggedIn ? (
                <>
                  <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <User className="h-4 w-4" />
                    <span>Welcome, {firstName}</span>
                  </div>
                  <Link href="/dashboard">
                    <Button className="bg-indigo-600 text-white hover:bg-indigo-700">Dashboard</Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={handleSignOut}
                    className="border-slate-300 text-slate-600 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth/login">
                    <Button className="border-2 border-indigo-600 text-indigo-600 bg-white hover:bg-indigo-50">
                      Login
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button className="bg-indigo-600 text-white hover:bg-indigo-700">Sign Up</Button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-slate-600 hover:text-indigo-600"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-slate-200">
              <Link
                href="/#features"
                className="text-slate-600 hover:text-indigo-600 block px-3 py-2 text-base font-medium"
                onClick={handleMobileMenuClose}
              >
                Features
              </Link>
              <Link
                href="/#integrations"
                className="text-slate-600 hover:text-indigo-600 block px-3 py-2 text-base font-medium"
                onClick={handleMobileMenuClose}
              >
                Integrations
              </Link>
              <Link
                href="/#pricing"
                className="text-slate-600 hover:text-indigo-600 block px-3 py-2 text-base font-medium"
                onClick={handleMobileMenuClose}
              >
                Pricing
              </Link>
              <Link
                href="/templates"
                className="text-slate-600 hover:text-indigo-600 block px-3 py-2 text-base font-medium"
                onClick={() => handlePageNavigation("/templates")}
              >
                Templates
              </Link>
              <Link
                href="/support"
                className="text-slate-600 hover:text-indigo-600 block px-3 py-2 text-base font-medium"
                onClick={() => handlePageNavigation("/support")}
              >
                Support
              </Link>

              {/* Mobile Auth Section */}
              <div className="pt-4 pb-3 border-t border-slate-200">
                {isLoggedIn ? (
                  <>
                    <div className="px-3 py-2">
                      <div className="flex items-center space-x-2 text-sm text-slate-600">
                        <User className="h-4 w-4" />
                        <span>Welcome, {firstName}</span>
                      </div>
                    </div>
                    <Link href="/dashboard" className="block px-3 py-2">
                      <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-700">Dashboard</Button>
                    </Link>
                    <div className="px-3 py-2">
                      <Button
                        variant="outline"
                        onClick={handleSignOut}
                        className="w-full border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Link href="/auth/login" className="block px-3 py-2">
                      <Button className="w-full border-2 border-indigo-600 text-indigo-600 bg-white hover:bg-indigo-50">
                        Login
                      </Button>
                    </Link>
                    <Link href="/auth/register" className="block px-3 py-2">
                      <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-700">Sign Up</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="pt-16">{children}</main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-2xl font-bold mb-4 text-indigo-400">ChainReact</h3>
              <p className="text-slate-400 mb-4">
                Automate your workflows with ease. Connect apps, save time, and boost productivity.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-indigo-300">Product</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <Link href="/#features" className="hover:text-indigo-300">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/#integrations" className="hover:text-indigo-300">
                    Integrations
                  </Link>
                </li>
                <li>
                  <Link href="/#pricing" className="hover:text-indigo-300">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/templates"
                    className="hover:text-indigo-300"
                    onClick={() => handlePageNavigation("/templates")}
                  >
                    Templates
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-indigo-300">Company</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <Link href="/community" className="hover:text-indigo-300">
                    Community
                  </Link>
                </li>
                <li>
                  <Link href="/learn" className="hover:text-indigo-300">
                    Learn
                  </Link>
                </li>
                <li>
                  <Link href="/enterprise" className="hover:text-indigo-300">
                    Enterprise
                  </Link>
                </li>
                <li>
                  <Link
                    href="/support"
                    className="hover:text-indigo-300"
                    onClick={() => handlePageNavigation("/support")}
                  >
                    Support
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-indigo-300">Legal</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <Link href="/privacy" className="hover:text-indigo-300">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-indigo-300">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/support"
                    className="hover:text-indigo-300"
                    onClick={() => handlePageNavigation("/support")}
                  >
                    Support
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-8 pt-8 text-center text-slate-400">
            <p>&copy; 2024 ChainReact. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Export as default for compatibility
export default PublicLayout
