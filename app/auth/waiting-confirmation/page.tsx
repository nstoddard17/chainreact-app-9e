"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Mail, RefreshCw, CheckCircle, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useAuthStore } from "@/stores/authStore"
import { supabase } from "@/utils/supabaseClient"

export default function WaitingConfirmationPage() {
  const [email, setEmail] = useState<string>("")
  const [userId, setUserId] = useState<string>("")
  const [isPolling, setIsPolling] = useState(true)
  const [hasResent, setHasResent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const { user, initialize } = useAuthStore()

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

  useEffect(() => {
    if (!userId || !isPolling || isConfirmed) return

    // Poll every 3 seconds to check if email has been confirmed
    const pollInterval = setInterval(async () => {
      try {
        console.log('Polling for email confirmation...')
        
        // Try to get the current session first
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (session?.user?.email_confirmed_at) {
          console.log('Email confirmed! Session detected.')
          setIsConfirmed(true)
          setIsPolling(false)
          clearInterval(pollInterval)
          
          // Clean up
          localStorage.removeItem('pendingSignup')
          
          // Initialize auth store to get the user data
          await initialize()
          return
        }

        // Alternative: Check the user directly
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
        
        if (currentUser?.email_confirmed_at) {
          console.log('Email confirmed! User check succeeded.')
          setIsConfirmed(true)
          setIsPolling(false)
          clearInterval(pollInterval)
          
          // Clean up
          localStorage.removeItem('pendingSignup')
          
          // Initialize auth store to get the user data
          await initialize()
        }
      } catch (error) {
        console.error('Error polling for confirmation:', error)
      }
    }, 3000) // Poll every 3 seconds

    // Clean up interval on unmount or when polling stops
    return () => clearInterval(pollInterval)
  }, [userId, isPolling, isConfirmed, initialize])

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
      console.error('Error resending confirmation email:', error)
      alert('An error occurred. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 animate-pulse"></div>
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute top-3/4 right-1/4 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl animate-float-delayed"></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Logo/Brand */}
          <div className="text-center">
            <Link href="/" className="inline-block">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                ChainReact
              </h1>
            </Link>
          </div>

          {/* Waiting Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-500/20 mb-6">
                <Mail className="h-8 w-8 text-blue-400" />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-4">
                {isConfirmed ? 'Email Confirmed!' : 'Check Your Email'}
              </h2>
              
              {!isConfirmed ? (
                <>
                  <p className="text-blue-200 mb-6 leading-relaxed">
                    We've sent a confirmation link to:
                  </p>
                  
                  <div className="bg-blue-600/20 rounded-lg p-3 mb-6">
                    <p className="text-white font-medium">{email}</p>
                  </div>

                  <p className="text-blue-200 mb-6 text-sm leading-relaxed">
                    Click the link in your email to verify your account. This page will automatically 
                    update when your email is confirmed.
                  </p>

                  {/* Status indicator */}
                  <div className="flex items-center justify-center text-blue-300 mb-6">
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    <span className="text-sm">Waiting for email confirmation...</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-500/20 mb-6 animate-bounce">
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                  
                  <p className="text-blue-200 mb-6 leading-relaxed">
                    Your email has been verified successfully!
                  </p>
                  
                  <div className="bg-green-600/20 rounded-lg p-3 mb-6">
                    <p className="text-green-200 text-sm">
                      Great! Your account is now active and ready to use.
                    </p>
                  </div>
                  
                  <Link href="/dashboard">
                    <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105">
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Continue to Dashboard
                    </Button>
                  </Link>
                </>
              )}

              {!isConfirmed && (
                <div className="space-y-4">
                  <Button
                    onClick={handleResendEmail}
                    variant="outline"
                    className="w-full border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-lg py-3 transition-all duration-300"
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
                    <Button variant="ghost" className="w-full text-blue-300 hover:text-blue-200 hover:bg-blue-400/10 rounded-lg py-3 transition-all duration-300">
                      Use Different Email
                    </Button>
                  </Link>
                </div>
              )}

              <div className="mt-6 text-xs text-blue-300/60">
                Didn't receive the email? Check your spam folder or{" "}
                <Link href="/contact" className="text-blue-300 hover:text-blue-200 underline">
                  contact support
                </Link>
              </div>
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