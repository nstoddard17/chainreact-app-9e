"use client"

import type React from "react"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Lock, User, AtSign, Eye, EyeOff } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

import { logger } from '@/lib/utils/logger'

function RegisterFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [providerError, setProviderError] = useState("")
  const [usernameError, setUsernameError] = useState("")
  const [usernameChecking, setUsernameChecking] = useState(false)
  const { signUp, signInWithGoogle } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl')

  const getRedirectUrl = () => {
    if (returnUrl) {
      try {
        // Validate that the return URL is from our domain
        const url = new URL(returnUrl)
        if (url.origin === window.location.origin) {
          return returnUrl
        }
      } catch (error) {
        logger.error('Invalid return URL:', error)
      }
    }
    return "/auth/waiting-confirmation"
  }

  const checkProvider = async (email: string) => {
    try {
      const response = await fetch('/api/auth/check-provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.exists && data.provider === 'google') {
        setProviderError('An account with this email already exists. Please sign in with Google instead.');
        return false;
      } else if (data.exists) {
        setProviderError('An account with this email already exists. Please sign in instead.');
        return false;
      } 
        setProviderError('');
        return true;
      
    } catch (error) {
      logger.error('Error checking provider:', error);
      return true; // Allow registration if check fails
    }
  }

  const checkUsername = async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameError('');
      return true;
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/
    if (!usernameRegex.test(username)) {
      setUsernameError('Username must be 3-20 characters and contain only letters, numbers, underscores, and hyphens');
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
      } 
        setUsernameError('');
        return true;
      
    } catch (error) {
      logger.error('Error checking username:', error);
      return true; // Allow if check fails
    } finally {
      setUsernameChecking(false);
    }
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setProviderError('')
    setUsernameError('')

    try {
      // Check if user already exists
      const canRegister = await checkProvider(email);
      
      if (!canRegister) {
        setLoading(false);
        return;
      }

      // Check if username is available
      const usernameAvailable = await checkUsername(username);
      
      if (!usernameAvailable) {
        setLoading(false);
        return;
      }

      await signUp(email, password, {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
        email: email,
        username: username,
      })
      router.push(getRedirectUrl())
    } catch (error) {
      logger.error("Registration error:", error)
      toast({
        title: "Registration Failed",
        description: "Could not create account. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setProviderError('')
    try {
      await signInWithGoogle()
      // Google OAuth will handle redirect via callback to setup-username or workflows
    } catch (error) {
      logger.error("Google sign in error:", error)
      toast({
        title: "Google Sign In Failed",
        description: "Could not sign in with Google. Please try again.",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  const handleEmailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    
    // Clear previous error when user starts typing
    if (providerError) {
      setProviderError('');
    }
    
    // Check provider when user finishes typing (debounced)
    if (newEmail && newEmail.includes('@')) {
      setTimeout(() => {
        if (email === newEmail) { // Only check if email hasn't changed
          checkProvider(newEmail);
        }
      }, 500);
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


  return (
    <>
      <Card className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-slate-900">Create Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-slate-700">
                  First Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="First name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-slate-700">
                  Last Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Last name"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700">
                Username <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Choose a username"
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="^[a-zA-Z0-9_-]{3,20}$"
                  disabled={usernameChecking}
                  autoComplete="username"
                />
              </div>
              {usernameError && (
                <div className="text-sm text-red-600 mt-1 p-2 bg-red-50 border border-red-200 rounded">
                  {usernameError}
                </div>
              )}
              {usernameChecking && (
                <div className="text-sm text-blue-600 mt-1">
                  Checking username availability...
                </div>
              )}
              <div className="text-xs text-slate-500">
                3-20 characters, letters, numbers, underscores, and hyphens only
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your email"
                  required
                  autoComplete="email"
                />
              </div>
              {providerError && (
                <div className="text-sm text-red-600 mt-1 p-2 bg-red-50 border border-red-200 rounded">
                  {providerError}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700">
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Create a password"
                  required
                  minLength={8}
                  maxLength={15}
                  pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,15}$"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-black transition-colors duration-200 focus:outline-none"
                  style={{ color: showPassword ? '#4B5563' : '#6B7280' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#000000'}
                  onMouseLeave={(e) => e.currentTarget.style.color = showPassword ? '#4B5563' : '#6B7280'}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="text-xs text-slate-500">
                8-15 characters, must include uppercase, lowercase, number, and special character
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
              disabled={loading || !!providerError || !!usernameError || usernameChecking}
            >
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">Or continue with</span>
            </div>
          </div>

          <Button
            onClick={handleGoogleSignIn}
            variant="outline"
            className="w-full flex items-center space-x-2 border border-slate-300 !bg-white text-black hover:!bg-slate-100 active:!bg-slate-200"
            disabled={loading}
          >
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
            <span className="text-black">Google</span>
          </Button>

          <div className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default function RegisterForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterFormContent />
    </Suspense>
  )
}
