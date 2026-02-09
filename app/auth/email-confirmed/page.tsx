"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { CheckCircle, Monitor, Smartphone, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Suspense } from 'react'

function EmailConfirmedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [hasSession, setHasSession] = useState(false)
  const { user, initialize } = useAuthStore()

  // Check if opened on same device (has session) or different device
  const crossDevice = searchParams.get('cross_device') === 'true'

  useEffect(() => {
    // Check if we have a session on this device
    const checkSession = async () => {
      await initialize()
      if (user) {
        setHasSession(true)
        // If we have a session, auto-redirect after a short delay
        setTimeout(() => {
          router.push('/workflows')
        }, 2000)
      }
    }
    checkSession()
  }, [initialize, user, router])

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

          {/* Success Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              {/* Success Icon */}
              <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-500/20 mb-6">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">
                Email Confirmed!
              </h2>

              {crossDevice && !hasSession ? (
                // Cross-device flow - user confirmed on different device
                <>
                  <p className="text-green-200 mb-6 leading-relaxed">
                    Your email has been verified successfully.
                  </p>

                  <div className="bg-white/5 rounded-xl p-6 mb-6">
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center mb-2">
                          <Smartphone className="h-6 w-6 text-orange-400" />
                        </div>
                        <span className="text-xs text-orange-300">This device</span>
                      </div>
                      <div className="text-orange-400">→</div>
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-2">
                          <Monitor className="h-6 w-6 text-green-400" />
                        </div>
                        <span className="text-xs text-green-300">Original device</span>
                      </div>
                    </div>

                    <p className="text-orange-200 text-sm">
                      You can now close this tab and return to the browser where you signed up.
                      You'll be automatically signed in there.
                    </p>
                  </div>

                  <p className="text-orange-300/70 text-xs mb-6">
                    Or continue on this device:
                  </p>

                  <Link href="/auth/login">
                    <Button className="w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white rounded-lg py-3 transition-all duration-300">
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Sign in on this device
                    </Button>
                  </Link>
                </>
              ) : (
                // Same device flow - user is signed in
                <>
                  <p className="text-green-200 mb-6 leading-relaxed">
                    Your account is ready. Redirecting you to your dashboard...
                  </p>

                  <div className="bg-green-600/20 rounded-lg p-4 mb-6">
                    <p className="text-green-200 text-sm">
                      You're all set! Taking you to your workflows.
                    </p>
                  </div>

                  <Link href="/workflows">
                    <Button className="w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white rounded-lg py-3 transition-all duration-300">
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Go to Dashboard
                    </Button>
                  </Link>
                </>
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

export default function EmailConfirmedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EmailConfirmedContent />
    </Suspense>
  )
}
