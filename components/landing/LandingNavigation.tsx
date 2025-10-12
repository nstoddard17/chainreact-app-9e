"use client"

import React, { memo, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Crown,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RoleBadgeCompact } from "@/components/ui/role-badge"
import { NotificationDropdown } from "@/components/ui/notification-dropdown"
import { type UserRole } from "@/lib/utils/roles"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { logger } from '@/lib/utils/logger'

interface LandingNavigationProps {
  isAuthenticated: boolean
  user: any
  profile: any
  userRole: UserRole
  isAdmin: boolean
  onSignOut: () => Promise<void>
}

const LandingNavigation = memo(({ 
  isAuthenticated, 
  user, 
  profile, 
  userRole, 
  isAdmin, 
  onSignOut 
}: LandingNavigationProps) => {
  const router = useRouter()
  
  const handleSignOut = useCallback(async () => {
    try {
      await onSignOut()
      router.push("/")
    } catch (error) {
      logger.error("Logout error:", error)
      router.push("/")
    }
  }, [onSignOut, router])

  return (
    <>
      {/* Optimized button animations */}
      <style jsx>{`
        .button-animated {
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .button-animated:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
        }
        .button-animated::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s;
        }
        .button-animated:hover::before {
          left: 100%;
        }
      `}</style>

      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 py-6 bg-gray-900/20 backdrop-blur-sm border-b border-gray-700/30">
        {/* Desktop Navigation (large screens only) */}
        <div className="hidden lg:grid max-w-7xl mx-auto grid-cols-3 items-center">
          {/* Left Section: Logo */}
          <div className="flex justify-start">
            <Link href="/" className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              ChainReact
            </Link>
          </div>

          {/* Center Section: Navigation Links */}
          <div className="flex justify-center">
            <div className="flex items-center space-x-8">
              <Link href="#features">
                <Button 
                  variant="ghost" 
                  className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-4 py-2 rounded-full transition-all duration-300 text-base"
                >
                  Features
                </Button>
              </Link>
              <Link href="#pricing">
                <Button 
                  variant="ghost" 
                  className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-4 py-2 rounded-full transition-all duration-300 text-base"
                >
                  Pricing
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Section: Auth Buttons */}
          <div className="flex justify-end">
            {!isAuthenticated ? (
              <Link href="/auth/login">
                <Button 
                  className="button-animated bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full shadow-lg hover:shadow-xl text-base"
                >
                  Sign In <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <div className="flex items-center space-x-4">
                <Link href="/dashboard">
                  <Button 
                    variant="outline" 
                    className="button-animated border-blue-400 text-blue-400 hover:bg-blue-400/10 px-4 py-2 rounded-full text-base"
                  >
                    Dashboard
                  </Button>
                </Link>
                
                {/* Notification Bell - separate from user dropdown */}
                <NotificationDropdown />
                
                {/* Membership tier - separate and non-clickable */}
                {userRole && <RoleBadgeCompact role={userRole} />}
                
                {/* User dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="button-animated flex items-center space-x-2 text-blue-200 hover:text-white hover:bg-white/10 px-4 py-2 rounded-full text-base"
                    >
                      <User className="h-4 w-4" />
                      <span className="max-w-[120px] truncate">{profile?.username || profile?.full_name || "User"}</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700">
                    <div className="px-2 py-1.5 text-sm text-gray-300">
                      <div className="font-medium">{profile?.username || profile?.full_name || "User"}</div>
                      <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                    </div>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="flex items-center text-gray-200 hover:text-white hover:bg-gray-700">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="flex items-center text-gray-200 hover:text-white hover:bg-gray-700">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center text-yellow-400 hover:text-yellow-300 hover:bg-gray-700">
                          <Crown className="mr-2 h-4 w-4" />
                          Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    )}
                    
                    <DropdownMenuSeparator className="bg-gray-700" />
                    
                    <DropdownMenuItem 
                      onClick={handleSignOut}
                      className="flex items-center text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Tablet Navigation (medium screens) */}
        <div className="hidden md:flex lg:hidden max-w-7xl mx-auto items-center justify-between">
          {/* Left Section: Logo */}
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              ChainReact
            </Link>
          </div>

          {/* Center Section: Navigation Links */}
          <div className="flex items-center space-x-6">
            <Link href="#features">
              <Button 
                variant="ghost" 
                className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-3 py-2 rounded-full transition-all duration-300"
              >
                Features
              </Button>
            </Link>
            <Link href="#pricing">
              <Button 
                variant="ghost" 
                className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-3 py-2 rounded-full transition-all duration-300"
              >
                Pricing
              </Button>
            </Link>
          </div>

          {/* Right Section: Compact Auth Buttons */}
          <div className="flex items-center">
            {!isAuthenticated ? (
              <Link href="/auth/login">
                <Button 
                  className="button-animated bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg hover:shadow-xl"
                >
                  Sign In <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <div className="flex items-center space-x-2">
                <Link href="/dashboard">
                  <Button 
                    variant="outline" 
                    className="button-animated border-blue-400 text-blue-400 hover:bg-blue-400/10 px-3 py-2 rounded-full"
                  >
                    Dashboard
                  </Button>
                </Link>
                
                {/* Notification Bell */}
                <NotificationDropdown />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-3 py-2 rounded-full"
                    >
                      <User className="h-4 w-4" />
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-gray-900/95 backdrop-blur-sm border border-gray-700">
                    <div className="px-2 py-1.5 text-sm text-gray-300">
                      <div className="font-medium truncate">{profile?.username || profile?.full_name || "User"}</div>
                      <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                    </div>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="text-gray-200 hover:text-white hover:bg-gray-700">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="text-gray-200 hover:text-white hover:bg-gray-700">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="text-yellow-400 hover:text-yellow-300 hover:bg-gray-700">
                          <Crown className="mr-2 h-4 w-4" />
                          Admin
                        </Link>
                      </DropdownMenuItem>
                    )}
                    
                    <DropdownMenuSeparator className="bg-gray-700" />
                    
                    <DropdownMenuItem 
                      onClick={handleSignOut}
                      className="text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation (small screens only) */}
        <div className="md:hidden flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            ChainReact
          </Link>
          
          {!isAuthenticated ? (
            <Link href="/auth/login">
              <Button 
                size="sm"
                className="button-animated bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg"
              >
                Sign In
              </Button>
            </Link>
          ) : (
            <div className="flex items-center space-x-2">
              <Link href="/dashboard">
                <Button 
                  size="sm"
                  variant="outline" 
                  className="button-animated border-blue-400 text-blue-400 hover:bg-blue-400/10 px-3 py-2 rounded-full"
                >
                  Dashboard
                </Button>
              </Link>
              
              {/* Notification Bell */}
              <NotificationDropdown />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    size="sm"
                    variant="ghost" 
                    className="button-animated text-blue-200 hover:text-white hover:bg-white/10 px-3 py-2 rounded-full"
                  >
                    <User className="h-4 w-4" />
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-gray-900/95 backdrop-blur-sm border border-gray-700">
                  <div className="px-2 py-1.5 text-sm text-gray-300">
                    <div className="font-medium truncate">{profile?.username || profile?.full_name || "User"}</div>
                    <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                  </div>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="text-gray-200 hover:text-white hover:bg-gray-700">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="text-gray-200 hover:text-white hover:bg-gray-700">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="text-yellow-400 hover:text-yellow-300 hover:bg-gray-700">
                        <Crown className="mr-2 h-4 w-4" />
                        Admin
                      </Link>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuSeparator className="bg-gray-700" />
                  
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </nav>
    </>
  )
})

LandingNavigation.displayName = 'LandingNavigation'

export default LandingNavigation 