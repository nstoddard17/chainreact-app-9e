"use client"

import { useEffect, useState, Suspense } from "react"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

function EmailConfirmedContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const confirmEmail = async () => {
      const token = searchParams.get('token')
      const userId = searchParams.get('userId')

      // If no token, show success (might be a redirect from old flow)
      if (!token || !userId) {
        setStatus('success')
        return
      }

      try {
        // Call the manual confirmation API
        const response = await fetch('/api/auth/confirm-manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, token })
        })

        const result = await response.json()

        if (!response.ok) {
          setErrorMessage(result.error || 'Failed to confirm email')
          setStatus('error')
          return
        }

        setStatus('success')
      } catch (error) {
        setErrorMessage('An error occurred while confirming your email')
        setStatus('error')
      }
    }

    confirmEmail()
  }, [searchParams])

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

          {/* Status Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              {status === 'loading' && (
                <>
                  <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-orange-500/20 mb-6">
                    <Loader2 className="h-10 w-10 text-orange-400 animate-spin" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Confirming Email...
                  </h2>
                  <p className="text-orange-200 mb-6 leading-relaxed">
                    Please wait while we verify your email address.
                  </p>
                </>
              )}

              {status === 'success' && (
                <>
                  <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-500/20 mb-6">
                    <CheckCircle className="h-10 w-10 text-green-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Email Confirmed!
                  </h2>
                  <p className="text-green-200 mb-6 leading-relaxed">
                    Your email has been verified successfully.
                  </p>
                  <div className="bg-green-600/20 rounded-lg p-4">
                    <p className="text-green-200 text-sm">
                      You may now close this tab.
                    </p>
                  </div>
                </>
              )}

              {status === 'error' && (
                <>
                  <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-500/20 mb-6">
                    <XCircle className="h-10 w-10 text-red-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Confirmation Failed
                  </h2>
                  <p className="text-red-200 mb-6 leading-relaxed">
                    {errorMessage}
                  </p>
                  <div className="bg-red-600/20 rounded-lg p-4">
                    <p className="text-red-200 text-sm">
                      Please try signing up again or contact support if this issue persists.
                    </p>
                  </div>
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
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900 to-rose-900 flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-orange-400 animate-spin" />
      </div>
    }>
      <EmailConfirmedContent />
    </Suspense>
  )
}
