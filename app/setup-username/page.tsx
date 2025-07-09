"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AtSign, ArrowRight } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { supabase } from "@/utils/supabaseClient"

export default function SetupUsernamePage() {
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [usernameError, setUsernameError] = useState("")
  const [usernameChecking, setUsernameChecking] = useState(false)
  const { profile, user, updateProfile } = useAuthStore()
  const router = useRouter()

  // Redirect if user already has a username
  useEffect(() => {
    if (profile?.username) {
      router.push('/dashboard')
    }
  }, [profile, router])

  const checkUsername = async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameError('');
      return true;
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/
    if (!usernameRegex.test(username)) {
      setUsernameError('Username must be 3-20 characters long and contain only letters, numbers, underscores, and hyphens');
      return false;
    }

    setUsernameChecking(true);
    try {
      const response = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (data.exists) {
        setUsernameError('This username is already taken. Please choose a different one.');
        return false;
      } else {
        setUsernameError('');
        return true;
      }
    } catch (error) {
      console.error('Error checking username:', error);
      return true; // Allow if check fails
    } finally {
      setUsernameChecking(false);
    }
  }

  const handleUsernameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value;
    setUsername(newUsername);
    
    // Clear previous error when user starts typing
    if (usernameError) {
      setUsernameError('');
    }
    
    // Check username when user finishes typing (debounced)
    if (newUsername && newUsername.length >= 3) {
      setTimeout(() => {
        if (username === newUsername) { // Only check if username hasn't changed
          checkUsername(newUsername);
        }
      }, 500);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setUsernameError('')

    try {
      // Check username availability
      const usernameAvailable = await checkUsername(username);
      
      if (!usernameAvailable) {
        setLoading(false);
        return;
      }

      // Update the user profile with the username
      await updateProfile({ username })

      toast({
        title: "Username Set Successfully",
        description: "Your username has been set up. Welcome to ChainReact!",
      })

      router.push('/dashboard')
    } catch (error) {
      console.error("Username setup error:", error)
      toast({
        title: "Setup Failed",
        description: "Could not set username. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (profile?.username) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-slate-900">Complete Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="text-center">
            <p className="text-slate-600 mb-4">
              Welcome, {profile?.full_name || user?.email || 'User'}! Please choose a username to complete your account setup.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user_username" className="text-slate-700">
                Username <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="user_username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Choose a username"
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_-]+"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                {usernameChecking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
              </div>
              {usernameError && (
                <div className="text-sm text-red-600 mt-1 p-2 bg-red-50 border border-red-200 rounded">
                  {usernameError}
                </div>
              )}
              <div className="text-xs text-slate-500">
                3-20 characters, letters, numbers, underscores, and hyphens only
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
              disabled={loading || !!usernameError || usernameChecking}
            >
              {loading ? "Setting up..." : (
                <>
                  Complete Setup
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
} 