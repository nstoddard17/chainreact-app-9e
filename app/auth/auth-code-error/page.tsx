"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { AlertCircle, Mail, RefreshCw, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function AuthCodeErrorPage() {
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          window.location.href = '/auth/login'
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

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

          {/* Error Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-500/20 mb-6">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-4">
                Email Confirmation Issue
              </h2>
              
              <p className="text-blue-200 mb-6 leading-relaxed">
                There was an issue confirming your email address. This could happen if:
              </p>

              <div className="text-left mb-6 space-y-2">
                <div className="flex items-center space-x-3 text-blue-200/80">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-sm">The confirmation link has expired</span>
                </div>
                <div className="flex items-center space-x-3 text-blue-200/80">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-sm">The link has already been used</span>
                </div>
                <div className="flex items-center space-x-3 text-blue-200/80">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-sm">There was a network connectivity issue</span>
                </div>
              </div>

              <div className="space-y-4">
                <Link href="/auth/register">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105">
                    <Mail className="mr-2 h-4 w-4" />
                    Resend Confirmation Email
                  </Button>
                </Link>

                <Link href="/auth/login">
                  <Button variant="outline" className="w-full border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-lg py-3 transition-all duration-300">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Sign In
                  </Button>
                </Link>
              </div>

              <div className="mt-6 p-4 bg-blue-600/20 rounded-lg border border-blue-500/30">
                <p className="text-sm text-blue-200">
                  <RefreshCw className="inline h-4 w-4 mr-1" />
                  Redirecting to sign in in <span className="font-semibold text-white">{countdown}</span> seconds...
                </p>
              </div>

              <div className="mt-6 text-xs text-blue-300/60">
                Need help? Contact us at{" "}
                <span className="text-blue-300">support</span>@<span className="text-blue-300">chainreact</span>.<span className="text-blue-300">app</span>
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