"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, ArrowRight, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/utils/supabaseClient'

export default function ConfirmationSuccessPage() {
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasValidSession, setHasValidSession] = useState(false)
  const router = useRouter()
  const { initialize, user } = useAuthStore()

  useEffect(() => {
    // Check if user has a valid session after email confirmation
    const checkSession = async () => {
      try {
        // Initialize auth store
        await initialize()
        
        // Check for active session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (session && !error) {
          console.log('Valid session found after email confirmation')
          setHasValidSession(true)
        } else {
          console.log('No valid session found, user needs to sign in')
          setHasValidSession(false)
        }
      } catch (error) {
        console.error('Error checking session:', error)
        setHasValidSession(false)
      } finally {
        setIsCheckingSession(false)
      }
    }

    checkSession()
  }, [initialize])

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

          {/* Success Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              {/* Success Icon with Animation */}
              <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-500/20 mb-6 animate-bounce">
                <CheckCircle className="h-12 w-12 text-green-400" />
              </div>
              
              <h2 className="text-3xl font-bold text-white mb-4">
                Email Confirmed!
              </h2>
              
              <p className="text-blue-200 mb-6 leading-relaxed">
                Your email has been successfully verified. Welcome to ChainReact!
              </p>

              <div className="bg-blue-600/20 rounded-lg p-4 mb-6">
                <p className="text-white font-medium mb-2">
                  You're all set! 🎉
                </p>
                <p className="text-blue-200 text-sm">
                  Your account has been created and email verified successfully.
                </p>
              </div>

              {/* Show loading state while checking session */}
              {isCheckingSession ? (
                <div className="flex flex-col items-center justify-center mb-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
                  <p className="text-blue-200 text-sm">Verifying your session...</p>
                </div>
              ) : (
                <>
                  {/* Primary CTA based on session status */}
                  {hasValidSession ? (
                    <Link href="/dashboard">
                      <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105 mb-4">
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Continue to Dashboard
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                        <p className="text-yellow-200 text-sm text-center">
                          Your session has expired or is invalid.
                          <br />
                          Please sign in to access your account.
                        </p>
                      </div>
                      
                      <Link href="/auth/login">
                        <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105 mb-4">
                          <LogIn className="mr-2 h-4 w-4" />
                          Sign In Manually
                        </Button>
                      </Link>
                    </>
                  )}

                  {/* Secondary option to close tab */}
                  <button
                    onClick={() => window.close()}
                    className="w-full text-blue-300 hover:text-blue-200 text-sm py-2 transition-colors"
                  >
                    Or close this tab and return to the original window
                  </button>
                </>
              )}

              <div className="mt-6 text-xs text-blue-300/60">
                Having trouble? <Link href="/contact" className="text-blue-300 hover:text-blue-200 underline">Contact support</Link>
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