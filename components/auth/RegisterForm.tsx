"use client"

import type React from "react"

import { useState, Suspense, useEffect, useRef, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuthStore, type BootPhase } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Lock, User, Eye, EyeOff, Check, X } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { supabase } from "@/utils/supabaseClient"

import { logger } from '@/lib/utils/logger'

function getPasswordStrength(password: string): { score: number; label: string; color: string; bgColor: string } {
  if (!password) return { score: 0, label: "", color: "", bgColor: "" }

  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`]/.test(password)) score++

  if (score <= 2) return { score, label: "Weak", color: "bg-red-500", bgColor: "bg-red-100" }
  if (score <= 3) return { score, label: "Fair", color: "bg-orange-500", bgColor: "bg-orange-100" }
  if (score <= 4) return { score, label: "Good", color: "bg-yellow-500", bgColor: "bg-yellow-100" }
  if (score <= 5) return { score, label: "Strong", color: "bg-green-500", bgColor: "bg-green-100" }
  return { score, label: "Very Strong", color: "bg-emerald-500", bgColor: "bg-emerald-100" }
}

function RegisterFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [loading, setLoading] = useState(false)
  const [providerError, setProviderError] = useState("")
  const { signUp, signInWithGoogle, signInWithGitHub, signInWithMicrosoft } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl')
  const hasCleanedSession = useRef(false)

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password])
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  const passwordRequirements = useMemo(() => [
    { met: password.length >= 8, label: "At least 8 characters" },
    { met: /[A-Z]/.test(password), label: "One uppercase letter" },
    { met: /[a-z]/.test(password), label: "One lowercase letter" },
    { met: /\d/.test(password), label: "One number" },
    { met: /[@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`]/.test(password), label: "One special character" },
  ], [password])

  // Clear any stale session data when visiting register page to prevent
  // "Invalid Refresh Token: Already Used" errors from race conditions
  useEffect(() => {
    if (hasCleanedSession.current) return
    hasCleanedSession.current = true

    const clearStaleSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          logger.info('[RegisterForm] Clearing existing session on register page visit')
          await supabase.auth.signOut({ scope: 'local' })

          localStorage.removeItem('chainreact-auth')

          useAuthStore.setState({
            user: null,
            profile: null,
            phase: 'ready' as BootPhase,
            loading: false,
            error: null
          })
        }
      } catch (error) {
        logger.info('[RegisterForm] Error clearing stale session:', error)
      }
    }

    clearStaleSession()
  }, [])

  const getRedirectUrl = () => {
    if (returnUrl) {
      try {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) throw new Error(`Provider check failed (${response.status})`);
      const data = await response.json();

      if (data.exists && data.provider && data.provider !== 'email') {
        const providerName = data.provider.charAt(0).toUpperCase() + data.provider.slice(1);
        setProviderError(`An account with this email already exists. Please sign in with ${providerName} instead.`);
        return false;
      } else if (data.exists) {
        setProviderError('An account with this email already exists. Please sign in instead.');
        return false;
      }
      setProviderError('');
      return true;
    } catch (error) {
      logger.error('Error checking provider:', error);
      return true;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setProviderError('')

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure your passwords match.", variant: "destructive" })
      setLoading(false)
      return
    }

    try {
      const canRegister = await checkProvider(email);
      if (!canRegister) { setLoading(false); return; }

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

      await signUp(email, password, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        email: email,
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

  const handleOAuthSignIn = async (provider: 'google' | 'github' | 'microsoft') => {
    setLoading(true)
    setProviderError('')
    try {
      if (provider === 'google') await signInWithGoogle()
      else if (provider === 'github') await signInWithGitHub()
      else await signInWithMicrosoft()
    } catch (error) {
      logger.error(`${provider} sign in error:`, error)
      toast({
        title: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Sign In Failed`,
        description: `Could not sign in with ${provider}. Please try again.`,
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  const emailTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleEmailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);

    if (providerError) setProviderError('');

    if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);

    if (newEmail && newEmail.includes('@')) {
      emailTimeoutRef.current = setTimeout(() => {
        checkProvider(newEmail);
      }, 500);
    }
  }

  return (
    <>
      <Card className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold text-slate-900">Create Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-6 pt-2">
          {/* OAuth Providers */}
          <div className="grid grid-cols-3 gap-3">
            <Button
              onClick={() => handleOAuthSignIn('google')}
              variant="outline"
              className="flex items-center justify-center gap-2 border border-slate-300 !bg-white text-black hover:!bg-slate-100 active:!bg-slate-200"
              disabled={loading}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="text-black text-sm">Google</span>
            </Button>

            <Button
              onClick={() => handleOAuthSignIn('github')}
              variant="outline"
              className="flex items-center justify-center gap-2 border border-slate-300 !bg-white text-black hover:!bg-slate-100 active:!bg-slate-200"
              disabled={loading}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="text-black text-sm">GitHub</span>
            </Button>

            <Button
              onClick={() => handleOAuthSignIn('microsoft')}
              variant="outline"
              className="flex items-center justify-center gap-2 border border-slate-300 !bg-white text-black hover:!bg-slate-100 active:!bg-slate-200"
              disabled={loading}
            >
              <svg className="w-4 h-4" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span className="text-black text-sm">Microsoft</span>
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">Or with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* First Name + Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-slate-700">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="First name"
                    required
                    autoComplete="given-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-slate-700">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full pl-3 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Last name"
                    required
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
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
                  className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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

            {/* Password */}
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
                  className="w-full pl-10 pr-10 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Create a password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-black transition-colors duration-200 focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Bar */}
              {password.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{ width: `${Math.min((passwordStrength.score / 6) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium min-w-[70px] text-right ${
                      passwordStrength.score <= 2 ? 'text-red-600' :
                      passwordStrength.score <= 3 ? 'text-orange-600' :
                      passwordStrength.score <= 4 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>

                  {/* Requirements Checklist */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                    {passwordRequirements.map((req) => (
                      <div key={req.label} className="flex items-center gap-1.5">
                        {req.met ? (
                          <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="w-3 h-3 text-slate-300 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${req.met ? 'text-green-700' : 'text-slate-400'}`}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-700">
                Confirm Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-2 !bg-white text-black border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                    passwordsMismatch ? 'border-red-300 focus:ring-red-500' :
                    passwordsMatch ? 'border-green-300 focus:ring-green-500' :
                    'border-slate-200 focus:ring-orange-500'
                  }`}
                  placeholder="Confirm your password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-black transition-colors duration-200 focus:outline-none"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordsMismatch && (
                <div className="flex items-center gap-1.5 text-sm text-red-600">
                  <X className="w-3.5 h-3.5" />
                  Passwords do not match
                </div>
              )}
              {passwordsMatch && (
                <div className="flex items-center gap-1.5 text-sm text-green-600">
                  <Check className="w-3.5 h-3.5" />
                  Passwords match
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white"
              disabled={loading || !!providerError || passwordsMismatch}
            >
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <div className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-orange-500 hover:text-orange-600 font-medium">
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
