"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Menu, X, User, LogOut } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/authStore"
import { useRouter } from "next/navigation"

interface PublicLayoutProps {
  children: React.ReactNode
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAuthenticated, user, isReady } = useAuth()
  const { signOut, profile } = useAuthStore()
  const router = useRouter()

  const handlePageNavigation = (path: string) => {
    setMobileMenuOpen(false)
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }, 100)
  }

  const handleMobileMenuClose = () => {
    setMobileMenuOpen(false)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setMobileMenuOpen(false)
      // Redirect to homepage after successful logout
      router.push("/")
    } catch (error) {
      console.error("Logout error:", error)
      setMobileMenuOpen(false)
      // Still redirect even if there's an error
      router.push("/")
    }
  }

  if (!isReady) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  const getDisplayName = () => {
    if (profile?.username) return profile.username
    if (!user) return ""
    if (user.first_name) return user.first_name
    if (user.name) return user.name.split(" ")[0]
    if (user.email) return user.email.split("@")[0]
    return "User"
  }

  const displayName = getDisplayName()

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo */}
            <div className="flex-shrink-0 w-48">
              <Link href="/" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <h1 className="text-2xl font-bold text-indigo-600 cursor-pointer">ChainReact</h1>
              </Link>
            </div>

            {/* Center: Navigation Links */}
            <div className="hidden lg:flex items-center justify-center flex-1">
              <div className="flex items-center space-x-8">
                <Link
                  href="/#features"
                  className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                >
                  Features
                </Link>
                <Link
                  href="/#integrations"
                  className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                >
                  Integrations
                </Link>
                {!isAuthenticated && (
                  <Link
                    href="/#pricing"
                    className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                  >
                    Pricing
                  </Link>
                )}
                <Link
                  href="/templates"
                  className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                  onClick={() => handlePageNavigation("/templates")}
                >
                  Templates
                </Link>
                <Link
                  href="/support"
                  className="text-slate-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                  onClick={() => handlePageNavigation("/support")}
                >
                  Support
                </Link>
              </div>
            </div>

            {/* Right: Auth Buttons */}
            <div className="hidden lg:flex items-center justify-end w-48">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 text-sm text-slate-600 whitespace-nowrap">
                    <User className="h-4 w-4 flex-shrink-0" />
                    <span className="font-medium">Welcome, {displayName}!</span>
                  </div>
                  <Link href="/dashboard">
                    <Button
                      size="sm"
                      className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors duration-200"
                    >
                      Dashboard
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSignOut}
                    className="border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors duration-200"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <Link href="/auth/login">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-600 hover:text-indigo-600 transition-colors duration-200"
                    >
                      Login
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button
                      size="sm"
                      className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors duration-200"
                    >
                      Sign Up
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Medium screens: Simplified layout */}
            <div className="hidden md:flex lg:hidden items-center space-x-6 flex-1 justify-end">
              <div className="flex items-center space-x-6">
                <Link href="/#features" className="text-slate-600 hover:text-indigo-600 text-sm font-medium">
                  Features
                </Link>
                <Link href="/#integrations" className="text-slate-600 hover:text-indigo-600 text-sm font-medium">
                  Integrations
                </Link>
                <Link href="/support" className="text-slate-600 hover:text-indigo-600 text-sm font-medium">
                  Support
                </Link>
              </div>

              {isAuthenticated ? (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-slate-600">Hi, {displayName}!</span>
                  <Link href="/dashboard">
                    <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">
                      Dashboard
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSignOut}
                    className="border-slate-300 text-slate-600 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link href="/auth/login">
                    <Button size="sm" variant="ghost">
                      Login
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">
                      Sign Up
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-slate-600 hover:text-indigo-600 p-2 transition-colors duration-200"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-3 space-y-3">
              {/* Navigation Links */}
              <div className="space-y-2">
                <Link
                  href="/#features"
                  className="block text-slate-600 hover:text-indigo-600 py-2 text-base font-medium transition-colors duration-200"
                  onClick={handleMobileMenuClose}
                >
                  Features
                </Link>
                <Link
                  href="/#integrations"
                  className="block text-slate-600 hover:text-indigo-600 py-2 text-base font-medium transition-colors duration-200"
                  onClick={handleMobileMenuClose}
                >
                  Integrations
                </Link>
                {!isAuthenticated && (
                  <Link
                    href="/#pricing"
                    className="block text-slate-600 hover:text-indigo-600 py-2 text-base font-medium transition-colors duration-200"
                    onClick={handleMobileMenuClose}
                  >
                    Pricing
                  </Link>
                )}
                <Link
                  href="/templates"
                  className="block text-slate-600 hover:text-indigo-600 py-2 text-base font-medium transition-colors duration-200"
                  onClick={() => handlePageNavigation("/templates")}
                >
                  Templates
                </Link>
                <Link
                  href="/support"
                  className="block text-slate-600 hover:text-indigo-600 py-2 text-base font-medium transition-colors duration-200"
                  onClick={() => handlePageNavigation("/support")}
                >
                  Support
                </Link>
              </div>

              {/* Auth Section */}
              <div className="pt-4 border-t border-slate-200">
                {isAuthenticated ? (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 text-slate-600">
                      <User className="h-4 w-4" />
                      <span className="font-medium">Welcome, {displayName}!</span>
                    </div>
                    <div className="flex space-x-3">
                      <Link href="/dashboard" className="flex-1">
                        <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-700">Dashboard</Button>
                      </Link>
                      <Button
                        variant="outline"
                        onClick={handleSignOut}
                        className="border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex space-x-3">
                    <Link href="/auth/login" className="flex-1">
                      <Button variant="outline" className="w-full border-indigo-600 text-indigo-600 hover:bg-indigo-50">
                        Login
                      </Button>
                    </Link>
                    <Link href="/auth/register" className="flex-1">
                      <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-700">Sign Up</Button>
                    </Link>
                  </div>
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
                  <Link href="/#features" className="hover:text-indigo-300 transition-colors duration-200">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/#integrations" className="hover:text-indigo-300 transition-colors duration-200">
                    Integrations
                  </Link>
                </li>
                {!isAuthenticated && (
                  <li>
                    <Link href="/#pricing" className="hover:text-indigo-300 transition-colors duration-200">
                      Pricing
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    href="/templates"
                    className="hover:text-indigo-300 transition-colors duration-200"
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
                  <Link href="/community" className="hover:text-indigo-300 transition-colors duration-200">
                    Community
                  </Link>
                </li>
                <li>
                  <Link href="/learn" className="hover:text-indigo-300 transition-colors duration-200">
                    Learn
                  </Link>
                </li>
                <li>
                  <Link href="/enterprise" className="hover:text-indigo-300 transition-colors duration-200">
                    Enterprise
                  </Link>
                </li>
                <li>
                  <Link
                    href="/support"
                    className="hover:text-indigo-300 transition-colors duration-200"
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
                  <Link href="/privacy" className="hover:text-indigo-300 transition-colors duration-200">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-indigo-300 transition-colors duration-200">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/sub-processors" className="hover:text-indigo-300 transition-colors duration-200">
                    Sub-processors
                  </Link>
                </li>
                <li>
                  <Link
                    href="/support"
                    className="hover:text-indigo-300 transition-colors duration-200"
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

export default PublicLayout
