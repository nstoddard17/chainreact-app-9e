"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { User, Mail, Loader2 } from "lucide-react"
import { supabase } from "@/utils/supabaseClient"

import { logger } from '@/lib/utils/logger'

export default function SetupUsernamePage() {
  const router = useRouter()
  const { user, profile, updateProfile } = useAuthStore()
  const [username, setUsername] = useState("")
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [usernameError, setUsernameError] = useState("")
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    // Wait for auth to initialize
    if (!user || !profile) {
      return
    }
    
    // If user already has a username, redirect to dashboard
    if (profile?.username && profile.username.trim() !== '') {
      router.push('/dashboard')
      
    }
    
    // Allow any user without username to access this page
    // No need to check provider - any user without username needs to set one
  }, [user, profile, router])

  const checkUsernameAvailability = async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameError("Username must be at least 3 characters")
      setIsAvailable(null)
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      setUsernameError("Username can only contain letters, numbers, dashes, and underscores")
      setIsAvailable(null)
      return
    }

    setChecking(true)
    setUsernameError("")

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('username', value)
        .single()

      if (error && error.code === 'PGRST116') {
        // No matching row found - username is available
        setIsAvailable(true)
        setUsernameError("")
      } else if (data) {
        // Username already taken
        setIsAvailable(false)
        setUsernameError("Username is already taken")
      }
    } catch (error) {
      logger.error("Error checking username:", error)
      setUsernameError("Error checking username availability")
    } finally {
      setChecking(false)
    }
  }

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    setUsername(value)
    
    // Debounce the availability check
    if (value.length >= 3) {
      const timer = setTimeout(() => {
        checkUsernameAvailability(value)
      }, 500)
      return () => clearTimeout(timer)
    } 
      setIsAvailable(null)
      if (value.length > 0) {
        setUsernameError("Username must be at least 3 characters")
      } else {
        setUsernameError("")
      }
    
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isAvailable || !username || username.length < 3) {
      setUsernameError("Please choose a valid, available username")
      return
    }

    setSaving(true)

    try {
      // Update the user profile with the username
      await updateProfile({ username })

      toast({
        title: "Account Setup Complete!",
        description: "Your username has been set successfully.",
      })

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (error: any) {
      logger.error("Error saving username:", error)
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to save username. Please try again.",
        variant: "destructive",
      })
      setSaving(false)
    }
  }

  // Show loading while checking auth state
  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Complete Your Profile</CardTitle>
          <CardDescription className="text-center">
            Choose a username to complete your account setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User Info Display (Read-only) */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">Name</Label>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700 font-medium">
                  {profile.full_name || user.full_name || user.name || 'Not provided'}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">Email</Label>
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700 font-medium">{user.email}</span>
              </div>
            </div>
            
            {profile?.provider === 'google' && (
              <div className="space-y-2">
                <Label className="text-sm text-gray-600">Sign-in Method</Label>
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span className="text-gray-700 font-medium">Google</span>
                </div>
              </div>
            )}
          </div>

          {/* Username Input Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700">
                Choose Your Username <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  className={`pr-10 ${
                    usernameError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : isAvailable === true 
                      ? 'border-green-500 focus:ring-green-500' 
                      : ''
                  }`}
                  placeholder="Choose a unique username"
                  required
                  autoFocus
                  minLength={3}
                  maxLength={30}
                />
                {checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                )}
                {!checking && isAvailable === true && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-5 h-5 text-green-500" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                )}
                {!checking && isAvailable === false && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-5 h-5 text-red-500" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </div>
                )}
              </div>
              {usernameError && (
                <p className="text-sm text-red-600 mt-1">{usernameError}</p>
              )}
              {!usernameError && isAvailable === true && (
                <p className="text-sm text-green-600 mt-1">Username is available!</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Your username will be visible to others and cannot be changed later.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
              disabled={saving || checking || !isAvailable || username.length < 3}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Complete Setup'
              )}
            </Button>
          </form>

          <p className="text-xs text-center text-gray-500">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  )
}