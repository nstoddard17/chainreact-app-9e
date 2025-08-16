"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { CheckCircle, Mail, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { supabase } from "@/utils/supabaseClient"

export default function EmailConfirmPage() {
  const [countdown, setCountdown] = useState(5)
  const [processing, setProcessing] = useState(true)
  const router = useRouter()
  const { initialize } = useAuthStore()

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Get current user
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error || !user) {
          console.error('Error getting user:', error)
          router.push('/auth/login')
          return
        }

        // Initialize auth store
        await initialize()

        // Clear any pending signup data
        localStorage.removeItem('pendingSignup')

        // Create user profile if it doesn't exist
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('id, username')
          .eq('id', user.id)
          .single()

        if (!existingProfile) {
          // Create profile for new user
          const detectedProvider = user.app_metadata?.provider || 
                                 user.app_metadata?.providers?.[0] || 
                                 (user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
          
          // Extract name from user metadata
          const fullName = user.user_metadata?.full_name || 
                          user.user_metadata?.name || 
                          user.email?.split('@')[0] || 'User'
          
          const nameParts = fullName.split(' ')
          const firstName = nameParts[0] || ''
          const lastName = nameParts.slice(1).join(' ') || ''

          await supabase
            .from('user_profiles')
            .insert({
              id: user.id,
              full_name: fullName,
              first_name: firstName,
              last_name: lastName,
              avatar_url: user.user_metadata?.avatar_url,
              provider: detectedProvider,
              role: 'free',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
        }

        setProcessing(false)

        // This page is reached from email link - show success and ask to close tab
        // The waiting tab will detect confirmation and proceed automatically
        
      } catch (error) {
        console.error('Error handling email confirmation:', error)
        setProcessing(false)
        router.push('/auth/login')
      }
    }

    handleEmailConfirmation()
  }, [router, initialize])

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
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-500/20 mb-6">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-4">
                Email Confirmed Successfully!
              </h2>
              
              <p className="text-blue-200 mb-6 leading-relaxed">
                Welcome to ChainReact! Your email has been verified and your account is now active.
                {processing ? " We're setting up your profile..." : " You can now close this tab."}
              </p>

              {processing ? (
                <div className="flex justify-center mb-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-green-600/20 rounded-lg border border-green-500/30 mb-4">
                    <p className="text-green-200 text-sm font-medium text-center">
                      ✅ Account confirmed! You can safely close this tab.
                    </p>
                  </div>

                  <Button
                    onClick={() => window.close()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 transition-all duration-300 transform hover:scale-105"
                  >
                    Close This Tab
                  </Button>

                  <Link href="/setup-username">
                    <Button variant="outline" className="w-full border-blue-400 text-blue-400 hover:bg-blue-400/10 rounded-lg py-3 transition-all duration-300">
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Continue in This Tab
                    </Button>
                  </Link>
                </div>
              )}

              <div className="mt-6 p-4 bg-blue-600/20 rounded-lg border border-blue-500/30">
                <p className="text-sm text-blue-200">
                  {processing 
                    ? "Setting up your account..." 
                    : "Return to your original tab to continue setup"
                  }
                </p>
              </div>

              <div className="mt-6 text-xs text-blue-300/60">
                Need help getting started? Visit our{" "}
                <Link href="/help" className="text-blue-300 hover:text-blue-200 underline">
                  help center
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