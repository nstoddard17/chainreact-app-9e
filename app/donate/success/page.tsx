"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Heart, ArrowLeft, Sparkles, Zap, Shield, Globe, Rocket } from "lucide-react"
import AppLayout from "@/components/layout/AppLayout"
import Link from "next/link"

// Floating animation component
const FloatingElement = ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <div 
    className={`absolute ${className}`}
    style={{
      animation: `float 6s ease-in-out infinite`,
      animationDelay: `${delay}s`,
    }}
  >
    {children}
  </div>
)

export default function DonateSuccessPage() {
  const [sessionData, setSessionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const sessionId = urlParams.get('session_id')

    if (sessionId) {
      // You could fetch session details here if needed
      setSessionData({ sessionId })
    }
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <AppLayout title="Processing..." subtitle="Setting up your donation">
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900/20 to-indigo-900/30 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p className="text-blue-200">Processing your donation...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Thank You!" subtitle="Your donation was successful">
      <div className="relative min-h-screen overflow-hidden">
        {/* Futuristic Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-green-900/20 to-emerald-900/30">
          {/* Animated Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.1)_1px,transparent_1px)] bg-[size:50px_50px] animate-pulse"></div>
          
          {/* Floating Elements */}
          <FloatingElement delay={0} className="top-20 left-10">
            <div className="w-4 h-4 bg-green-400/30 rounded-full blur-sm"></div>
          </FloatingElement>
          <FloatingElement delay={2} className="top-40 right-20">
            <div className="w-6 h-6 bg-emerald-400/20 rounded-full blur-sm"></div>
          </FloatingElement>
          <FloatingElement delay={4} className="bottom-40 left-20">
            <div className="w-3 h-3 bg-teal-400/40 rounded-full blur-sm"></div>
          </FloatingElement>
          <FloatingElement delay={1} className="bottom-20 right-10">
            <div className="w-5 h-5 bg-cyan-400/25 rounded-full blur-sm"></div>
          </FloatingElement>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            {/* Success Icon */}
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-full mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-full animate-pulse opacity-75"></div>
              <CheckCircle className="w-12 h-12 text-white relative z-10" />
            </div>

            {/* Success Message */}
            <Card className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl mb-8">
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-4xl font-bold bg-gradient-to-r from-white via-green-100 to-emerald-100 bg-clip-text text-transparent mb-4">
                  Thank You! 🎉
                </CardTitle>
                <CardDescription className="text-xl text-green-200/80">
                  Your donation has been successfully processed
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-8">
                <div className="flex items-center justify-center space-x-3 text-green-400">
                  <Heart className="w-6 h-6" />
                  <span className="font-bold text-lg">You're amazing!</span>
                </div>
                
                <p className="text-blue-200/80 text-lg">
                  Your generous contribution helps us continue building and improving ChainReact. 
                  We're incredibly grateful for your support!
                </p>

                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl p-6 border border-green-500/20">
                  <div className="flex items-center justify-center space-x-3 mb-4">
                    <Sparkles className="w-6 h-6 text-green-400" />
                    <span className="font-bold text-green-300 text-lg">
                      What your donation supports:
                    </span>
                  </div>
                  <ul className="text-blue-200/80 space-y-2 text-left max-w-md mx-auto">
                    <li className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Server infrastructure and hosting costs</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>New feature development and improvements</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Keeping ChainReact free for everyone</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Community support and documentation</span>
                    </li>
                  </ul>
                </div>

                {/* Feature Icons */}
                <div className="flex justify-center space-x-8 pt-4 border-t border-slate-600/50">
                  <div className="flex items-center space-x-2 text-blue-300/70">
                    <Zap className="w-5 h-5" />
                    <span className="text-sm">Lightning Fast</span>
                  </div>
                  <div className="flex items-center space-x-2 text-purple-300/70">
                    <Shield className="w-5 h-5" />
                    <span className="text-sm">Secure</span>
                  </div>
                  <div className="flex items-center space-x-2 text-pink-300/70">
                    <Globe className="w-5 h-5" />
                    <span className="text-sm">Global</span>
                  </div>
                  <div className="flex items-center space-x-2 text-cyan-300/70">
                    <Rocket className="w-5 h-5" />
                    <span className="text-sm">Innovative</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/dashboard">
                <Button className="bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/25">
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              
              <Link href="/donate">
                <Button variant="outline" className="border-green-400/50 text-green-300 hover:bg-green-500/20 hover:text-green-200 font-bold py-3 px-6 rounded-xl transition-all duration-300 hover:scale-105">
                  <Heart className="w-5 h-5 mr-2" />
                  Donate Again
                </Button>
              </Link>
            </div>

            {/* Additional Info */}
            <div className="mt-12 text-center">
              <p className="text-green-200/70">
                You'll receive a receipt via email shortly. Thank you again for your support! 💜
              </p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </AppLayout>
  )
} 