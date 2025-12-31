"use client"

import { useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { AlertCircle, Mail, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Suspense } from 'react'

function ErrorPageContent() {
  const searchParams = useSearchParams()
  const errorType = searchParams.get('type')
  const message = searchParams.get('message')

  const getErrorDetails = () => {
    switch (errorType) {
      case 'expired-link':
        return {
          title: 'Link Expired',
          description: message || 'Your confirmation link has expired. Confirmation links are valid for 15 minutes for security reasons.',
          icon: <AlertCircle className="h-12 w-12 text-yellow-400" />,
          bgColor: 'bg-yellow-500/20',
          actions: (
            <>
              <Link href="/auth/register">
                <Button className="w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105">
                  <Mail className="mr-2 h-4 w-4" />
                  Sign Up Again
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="outline" className="w-full border-orange-400 text-orange-400 hover:bg-orange-400/10 rounded-lg py-3 transition-all duration-300">
                  Already Confirmed? Sign In
                </Button>
              </Link>
            </>
          )
        }
      case 'already-used':
        return {
          title: 'Link Already Used',
          description: 'This confirmation link has already been used. Each link can only be used once for security.',
          icon: <AlertCircle className="h-12 w-12 text-orange-400" />,
          bgColor: 'bg-orange-500/20',
          actions: (
            <Link href="/auth/login">
              <Button className="w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go to Sign In
              </Button>
            </Link>
          )
        }
      default:
        return {
          title: 'Authentication Error',
          description: message || 'An error occurred during authentication. Please try again.',
          icon: <AlertCircle className="h-12 w-12 text-red-400" />,
          bgColor: 'bg-red-500/20',
          actions: (
            <>
              <Link href="/auth/login">
                <Button className="w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105">
                  Try Again
                </Button>
              </Link>
              <Link href="/">
                <Button variant="ghost" className="w-full text-orange-300 hover:text-orange-200 hover:bg-orange-400/10 rounded-lg py-3 transition-all duration-300">
                  Go to Homepage
                </Button>
              </Link>
            </>
          )
        }
    }
  }

  const errorDetails = getErrorDetails()

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

          {/* Error Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              {/* Error Icon */}
              <div className={`mx-auto flex items-center justify-center h-20 w-20 rounded-full ${errorDetails.bgColor} mb-6`}>
                {errorDetails.icon}
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-4">
                {errorDetails.title}
              </h2>
              
              <p className="text-orange-200 mb-6 leading-relaxed">
                {errorDetails.description}
              </p>

              <div className="space-y-4">
                {errorDetails.actions}
              </div>

              <div className="mt-6 text-xs text-orange-300/60">
                Need help? <Link href="/contact" className="text-orange-300 hover:text-orange-200 underline">Contact support</Link>
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

export default function ErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorPageContent />
    </Suspense>
  )
}