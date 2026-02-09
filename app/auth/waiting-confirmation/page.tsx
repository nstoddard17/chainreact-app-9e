"use client"

import { useEffect, useState, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Mail, RefreshCw, CheckCircle, ArrowRight, AlertCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { supabase } from "@/utils/supabaseClient"
import { Suspense } from 'react'

import { logger } from '@/lib/utils/logger'

function WaitingConfirmationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState<string>("")
  const [userId, setUserId] = useState<string>("")
  const [isPolling, setIsPolling] = useState(true)
  const [hasResent, setHasResent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)
  const autoSignInAttempted = useRef(false)
  const { user, initialize } = useAuthStore()

  useEffect(() => {
    // Check if redirected here due to expired confirmation link
    if (searchParams.get('expired') === 'true') {
      setLinkExpired(true)
    }
  }, [searchParams])

  useEffect(() => {
    // Get email and userId from pending signup or current user
    const pendingSignup = localStorage.getItem('pendingSignup')
    if (pendingSignup) {
      const data = JSON.parse(pendingSignup)
      setEmail(data.email)
      setUserId(data.userId || '')
    } else if (user?.email) {
      setEmail(user.email)
      setUserId(user.id)
    }
  }, [user])

  /**
   * Attempt to auto-sign-in when email is confirmed on another device.
   * This creates a seamless experience where the original device
   * automatically gets signed in and redirected.
   */
  const attemptAutoSignIn = async (confirmedUserId: string, confirmedEmail: string) => {
    // Prevent multiple attempts
    if (autoSignInAttempted.current) return
    autoSignInAttempted.current = true

    setIsSigningIn(true)
    logger.debug('Attempting auto sign-in for cross-device confirmation...')

    try {
      // Request a magic link token for this user
      const response = await fetch('/api/auth/generate-signin-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: confirmedUserId, email: confirmedEmail })
      })

      if (!response.ok) {
        logger.warn('Failed to generate sign-in token, falling back to manual flow')
        setIsSigningIn(false)
        return
      }

      const data = await response.json()

      if (data.token_hash) {
        // Use verifyOtp with the token hash to establish a session
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: 'magiclink'
        })

        if (verifyError) {
          logger.error('Failed to verify OTP for auto sign-in:', verifyError)
          setIsSigningIn(false)
          return
        }

        if (verifyData.session) {
          logger.debug('Auto sign-in successful! Redirecting to workflows...')
          localStorage.removeItem('pendingSignup')
          await initialize()

          // Small delay to show the success state before redirect
          setTimeout(() => {
            router.push('/workflows')
          }, 500)
          return
        }
      }

      // If we get here, auto sign-in didn't work
      logger.warn('Auto sign-in response missing expected data')
      setIsSigningIn(false)
    } catch (error) {
      logger.error('Auto sign-in error:', error)
      setIsSigningIn(false)
    }
  }

  useEffect(() => {
    if ((!userId && !email) || !isPolling || isConfirmed) return

    // Poll every 3 seconds to check if email has been confirmed
    // Uses server-side API to check confirmation status across devices
    const pollInterval = setInterval(async () => {
      try {
        logger.debug('Polling for email confirmation...')

        // First, check if we have a local session (same device confirmation)
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user?.email_confirmed_at) {
          logger.debug('Email confirmed! Session detected on this device.')
          setIsConfirmed(true)
          setIsPolling(false)
          clearInterval(pollInterval)
          localStorage.removeItem('pendingSignup')
          await initialize()

          // Auto-redirect since we already have a session
          setTimeout(() => {
            router.push('/workflows')
          }, 1000)
          return
        }

        // If no local session, check server-side for cross-device confirmation
        // This allows detection when user confirms on mobile but signed up on desktop
        const response = await fetch('/api/auth/check-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, email })
        })

        if (response.ok) {
          const data = await response.json()

          if (data.confirmed) {
            logger.debug('Email confirmed on another device! Initiating auto sign-in...')
            setIsConfirmed(true)
            setIsPolling(false)
            clearInterval(pollInterval)

            // Attempt seamless auto sign-in
            await attemptAutoSignIn(userId, email)
          }
        }
      } catch (error) {
        logger.error('Error polling for confirmation:', error)
      }
    }, 3000) // Poll every 3 seconds

    // Clean up interval on unmount or when polling stops
    return () => clearInterval(pollInterval)
  }, [userId, email, isPolling, isConfirmed, initialize, router])

  const handleResendEmail = async () => {
    if (resendCooldown > 0) return

    try {
      setHasResent(false) // Reset status

      // Send confirmation email using the new endpoint
      const response = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setHasResent(true)
        setResendCooldown(60) // 60 second cooldown

        const cooldownInterval = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(cooldownInterval)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else if (response.status === 429) {
        // Rate limited
        const retryAfter = data.retryAfter || 3600
        setResendCooldown(Math.min(retryAfter, 3600)) // Cap at 1 hour for display

        const cooldownInterval = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(cooldownInterval)
              return 0
            }
            return prev - 1
          })
        }, 1000)

        // Show error message
        alert(data.error || 'Too many requests. Please try again later.')
      } else {
        // Other errors
        alert(data.error || 'Failed to resend email. Please try again.')
      }
    } catch (error) {
      logger.error('Error resending confirmation email:', error)
      alert('An error occurred. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900 to-rose-900 relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 to-rose-600/20 animate-pulse"></div>
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute top-3/4 right-1/4 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl animate-float-delayed"></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Logo/Brand */}
          <div className="text-center">
            <Link href="/" className="inline-block">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">
                ChainReact
              </h1>
            </Link>
          </div>

          {/* Waiting Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              {/* Icon changes based on state */}
              <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-6 ${
                isSigningIn ? 'bg-blue-500/20' : isConfirmed ? 'bg-green-500/20' : 'bg-orange-500/20'
              }`}>
                {isSigningIn ? (
                  <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                ) : isConfirmed ? (
                  <CheckCircle className="h-8 w-8 text-green-400" />
                ) : (
                  <Mail className="h-8 w-8 text-orange-400" />
                )}
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">
                {isSigningIn ? 'Signing you in...' : isConfirmed ? 'Email Confirmed!' : 'Check Your Email'}
              </h2>

              {!isConfirmed && !isSigningIn ? (
                <>
                  {linkExpired && (
                    <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-lg p-4 mb-6">
                      <div className="flex items-center gap-2 text-yellow-300 mb-1">
                        <AlertCircle className="h-4 w-4" />
                        <span className="font-medium text-sm">Your confirmation link has expired</span>
                      </div>
                      <p className="text-yellow-200/80 text-xs">
                        Click "Resend Email" below to get a new confirmation link.
                      </p>
                    </div>
                  )}

                  <p className="text-orange-200 mb-6 leading-relaxed">
                    We've sent a confirmation link to:
                  </p>

                  <div className="bg-orange-600/20 rounded-lg p-3 mb-6">
                    <p className="text-white font-medium">{email}</p>
                  </div>

                  <p className="text-orange-200 mb-6 text-sm leading-relaxed">
                    Click the link in your email to verify your account. You can open it on any device -
                    this page will automatically sign you in once confirmed.
                  </p>

                  {/* Status indicator */}
                  <div className="flex items-center justify-center text-orange-300 mb-6">
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    <span className="text-sm">Waiting for email confirmation...</span>
                  </div>
                </>
              ) : isSigningIn ? (
                <>
                  <p className="text-blue-200 mb-6 leading-relaxed">
                    Your email was confirmed! Setting up your session...
                  </p>

                  <div className="bg-blue-600/20 rounded-lg p-3 mb-6">
                    <p className="text-blue-200 text-sm">
                      You'll be redirected to your dashboard momentarily.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-orange-200 mb-6 leading-relaxed">
                    Your email has been verified successfully!
                  </p>

                  <div className="bg-green-600/20 rounded-lg p-3 mb-6">
                    <p className="text-green-200 text-sm">
                      Redirecting to your dashboard...
                    </p>
                  </div>

                  <Link href="/workflows">
                    <Button className="w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105">
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Continue to Dashboard
                    </Button>
                  </Link>
                </>
              )}

              {!isConfirmed && !isSigningIn && (
                <div className="space-y-4">
                  <Button
                    onClick={handleResendEmail}
                    variant="outline"
                    className="w-full border-orange-400 text-orange-400 hover:bg-orange-400/10 rounded-lg py-3 transition-all duration-300"
                    disabled={resendCooldown > 0}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : hasResent
                        ? "Email Resent!"
                        : "Resend Email"
                    }
                  </Button>

                  <Link href="/auth/register">
                    <Button variant="ghost" className="w-full text-orange-300 hover:text-orange-200 hover:bg-orange-400/10 rounded-lg py-3 transition-all duration-300">
                      Use Different Email
                    </Button>
                  </Link>
                </div>
              )}

              {!isSigningIn && (
                <div className="mt-6 text-xs text-orange-300/60">
                  Didn't receive the email? Check your spam folder or{" "}
                  <Link href="/contact" className="text-orange-300 hover:text-orange-200 underline">
                    contact support
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-10px) rotate(1deg); }
          66% { transform: translateY(5px) rotate(-1deg); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(10px) rotate(-1deg); }
          66% { transform: translateY(-5px) rotate(1deg); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

export default function WaitingConfirmationPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WaitingConfirmationContent />
    </Suspense>
  )
}
