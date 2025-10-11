"use client"

import type React from "react"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, Lock, Eye, EyeOff } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

function LoginFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [providerError, setProviderError] = useState("")
  const [loginError, setLoginError] = useState("")
  const { signIn, signInWithGoogle } = useAuthStore()
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
        console.error('Invalid return URL:', error)
      }
    }
    return "/dashboard"
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
        setProviderError('This account was created with Google. Please sign in with Google instead.');
        return false;
      } 
        setProviderError('');
        return true;
      
    } catch (error) {
      console.error('Error checking provider:', error);
      return true; // Allow login if check fails
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setProviderError('')
    setLoginError('')

    try {
      // Check if user should use Google instead
      const canUseEmail = await checkProvider(email);
      
      if (!canUseEmail) {
        setLoading(false);
        return;
      }

      await signIn(email, password)
      
      // Small delay to ensure auth state is propagated
      setTimeout(() => {
        router.push(getRedirectUrl())
      }, 100)
    } catch (error: any) {
      console.error("Login error:", error)
      
      // Set specific error message based on error type
      let errorMessage = "Invalid email or password. Please check your credentials and try again.";
      
      if (error.message?.toLowerCase().includes('invalid')) {
        errorMessage = "Invalid email or password. Please check your credentials and try again.";
      } else if (error.message?.toLowerCase().includes('not found')) {
        errorMessage = "No account found with this email. Please sign up first.";
      } else if (error.message?.toLowerCase().includes('network')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message?.toLowerCase().includes('email not confirmed')) {
        errorMessage = "Please confirm your email address before signing in.";
      }
      
      setLoginError(errorMessage)
      
      // Also show toast for accessibility
      toast({
        title: "Login Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      // Always reset loading state, even if an unexpected error occurs
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setProviderError('')
    setLoginError('')
    try {
      await signInWithGoogle()
      // Google sign-in redirects automatically via OAuth flow
      // No need for manual navigation
    } catch (error) {
      console.error("Google sign in error:", error)
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
    
    // Only clear provider error when user starts typing
    if (providerError) {
      setProviderError('');
    }
    // Don't clear login error - let user see what went wrong
    
    // Check provider when user finishes typing (debounced)
    if (newEmail && newEmail.includes('@')) {
      setTimeout(() => {
        if (email === newEmail) { // Only check if email hasn't changed
          checkProvider(newEmail);
        }
      }, 500);
    }
  }

  return (
    <>
      <Card className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardContent className="space-y-6 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                Email
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
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    // Don't clear login error - let user see what went wrong
                  }}
                  className="w-full pl-10 pr-10 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                  required
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
            </div>

            {/* Login Error Message */}
            {loginError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-red-800">
                      {loginError}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
              disabled={loading || !!providerError}
            >
              {loading ? "Signing in..." : "Sign In"}
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
            {"Don't have an account? "}
            <Link href="/auth/register" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default function LoginForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginFormContent />
    </Suspense>
  )
}
