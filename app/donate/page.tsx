"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Heart, CreditCard, Sparkles, Coffee, Star, Crown, Zap, Shield, Globe, Rocket } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import AppLayout from "@/components/layout/AppLayout"
import { cn } from "@/lib/utils"

const donationAmounts = [
  { value: "5", label: "$5", icon: Coffee, description: "Buy us a coffee", color: "from-orange-400 to-orange-600" },
  { value: "10", label: "$10", icon: Heart, description: "Show some love", color: "from-pink-400 to-pink-600" },
  { value: "25", label: "$25", icon: Star, description: "Star supporter", color: "from-yellow-400 to-yellow-600" },
  { value: "50", label: "$50", icon: Crown, description: "Premium supporter", color: "from-purple-400 to-purple-600" },
  { value: "100", label: "$100", icon: Sparkles, description: "VIP supporter", color: "from-blue-400 to-blue-600" },
]

// Floating animation component
const FloatingElement = ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <div 
    className={cn("absolute", className)}
    style={{
      animation: `float 6s ease-in-out infinite`,
      animationDelay: `${delay}s`,
    }}
  >
    {children}
  </div>
)

export default function DonatePage() {
  const [selectedAmount, setSelectedAmount] = useState("25")
  const [customAmount, setCustomAmount] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")

  const handleDonation = async () => {
    setIsLoading(true)
    
    try {
      const amount = customAmount || selectedAmount
      
      const response = await fetch('/api/donate/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          email: email,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create donation session')
      }

      const { sessionId } = await response.json()
      
      // Redirect to Stripe Checkout
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
      if (stripe) {
        await stripe.redirectToCheckout({ sessionId })
      }
    } catch (error) {
      console.error('Donation error:', error)
      alert('There was an error processing your donation. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadStripe = async (publishableKey: string) => {
    if (typeof window !== 'undefined') {
      const { loadStripe } = await import('@stripe/stripe-js')
      return loadStripe(publishableKey)
    }
    return null
  }

  return (
    <AppLayout title="Support ChainReact" subtitle="Help us build the future of automation">
      <div className="relative min-h-screen overflow-hidden">
        {/* Futuristic Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/20 to-indigo-900/30">
          {/* Animated Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.1)_1px,transparent_1px)] bg-[size:50px_50px] animate-pulse"></div>
          
          {/* Floating Elements */}
          <FloatingElement delay={0} className="top-20 left-10">
            <div className="w-4 h-4 bg-blue-400/30 rounded-full blur-sm"></div>
          </FloatingElement>
          <FloatingElement delay={2} className="top-40 right-20">
            <div className="w-6 h-6 bg-purple-400/20 rounded-full blur-sm"></div>
          </FloatingElement>
          <FloatingElement delay={4} className="bottom-40 left-20">
            <div className="w-3 h-3 bg-pink-400/40 rounded-full blur-sm"></div>
          </FloatingElement>
          <FloatingElement delay={1} className="bottom-20 right-10">
            <div className="w-5 h-5 bg-cyan-400/25 rounded-full blur-sm"></div>
          </FloatingElement>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 rounded-full mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 rounded-full animate-pulse opacity-75"></div>
              <Heart className="w-10 h-10 text-white relative z-10" />
            </div>
            
            <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent mb-6">
              Support ChainReact
            </h1>
            
            <p className="text-xl text-blue-200/80 mb-8 max-w-2xl mx-auto">
              Help us continue building the future of automation and keep ChainReact free for everyone.
            </p>

            {/* Feature Icons */}
            <div className="flex justify-center space-x-8 mb-8">
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
          </div>

          {/* Donation Card */}
          <div className="max-w-2xl mx-auto">
            <Card className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl">
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
                  Choose Your Donation
                </CardTitle>
                <CardDescription className="text-blue-200/70 text-lg">
                  Every contribution powers the future of automation
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-8">
                {/* Donation Amounts */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium text-blue-200/80">
                    Select Amount
                  </Label>
                  <RadioGroup 
                    value={selectedAmount} 
                    onValueChange={setSelectedAmount}
                    className="grid grid-cols-2 gap-4"
                  >
                    {donationAmounts.map((amount) => {
                      const Icon = amount.icon
                      return (
                        <div key={amount.value}>
                          <RadioGroupItem
                            value={amount.value}
                            id={amount.value}
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor={amount.value}
                            className={cn(
                              "flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg",
                              "bg-slate-700/30 backdrop-blur-sm border-slate-600/50",
                              "peer-checked:border-blue-400 peer-checked:bg-gradient-to-br peer-checked:from-blue-500/20 peer-checked:to-purple-500/20 peer-checked:shadow-blue-500/25",
                              "hover:border-blue-400/50 hover:bg-slate-700/50"
                            )}
                          >
                            <div className={cn("w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center mb-3", amount.color)}>
                              <Icon className="w-6 h-6 text-white" />
                            </div>
                            <span className="font-bold text-lg text-white">{amount.label}</span>
                            <span className="text-xs text-blue-200/70 mt-1">
                              {amount.description}
                            </span>
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                </div>

                {/* Custom Amount */}
                <div className="space-y-3">
                  <Label htmlFor="custom-amount" className="text-sm font-medium text-blue-200/80">
                    Or enter a custom amount
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-blue-300/70 text-lg font-semibold">$</span>
                    <Input
                      id="custom-amount"
                      type="number"
                      placeholder="0.00"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="pl-12 bg-slate-700/50 border-slate-600/50 text-white placeholder:text-blue-200/50 focus:border-blue-400/50 focus:ring-blue-400/20"
                      min="1"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Email (Optional) */}
                <div className="space-y-3">
                  <Label htmlFor="email" className="text-sm font-medium text-blue-200/80">
                    Email (optional - for receipt)
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-700/50 border-slate-600/50 text-white placeholder:text-blue-200/50 focus:border-blue-400/50 focus:ring-blue-400/20"
                  />
                </div>

                {/* Donate Button */}
                <Button
                  onClick={handleDonation}
                  disabled={isLoading || (!customAmount && !selectedAmount)}
                  className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 hover:from-pink-600 hover:via-purple-600 hover:to-blue-600 text-white font-bold py-4 text-lg rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-pink-500/25"
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-3">
                      <LightningLoader size="sm" color="white" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3">
                      <CreditCard className="w-6 h-6" />
                      <span>
                        Donate ${customAmount || selectedAmount}
                      </span>
                    </div>
                  )}
                </Button>

                {/* Security Notice */}
                <div className="text-center pt-4 border-t border-slate-600/50">
                  <div className="flex items-center justify-center space-x-2 text-blue-200/70">
                    <Shield className="w-4 h-4" />
                    <p className="text-sm">Secure payment powered by Stripe</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional Info */}
            <div className="mt-8 text-center">
              <p className="text-blue-200/70">
                Your donation helps us maintain and improve ChainReact. Thank you for your support! 💜
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