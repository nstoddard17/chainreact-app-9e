"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, User } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { logger } from "@/lib/utils/logger"

function SSOSignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const email = searchParams.get("email") ?? ""
  const firstNameParam = searchParams.get("firstName") ?? ""
  const lastNameParam = searchParams.get("lastName") ?? ""
  const orgId = searchParams.get("orgId") ?? ""
  const returnUrl = searchParams.get("returnUrl") ?? "/workflows"

  const [firstName, setFirstName] = useState(firstNameParam)
  const [lastName, setLastName] = useState(lastNameParam)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          orgId,
          ssoUser: true,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? "Signup failed")
      }

      toast({
        title: "Account Created",
        description: "Your account has been set up successfully.",
      })

      router.push(returnUrl)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not create account. Please try again."
      logger.error("SSO signup error:", error)
      toast({
        title: "Signup Failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardContent className="space-y-6 p-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">Complete your account</h1>
            <p className="text-sm text-slate-500">
              Confirm your details to finish setting up your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sso-email" className="text-slate-700">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="sso-email"
                  type="email"
                  value={email}
                  readOnly
                  className="w-full pl-10 pr-3 py-2 !bg-slate-50 text-slate-500 border border-slate-200 rounded-md cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first-name" className="text-slate-700">
                  First name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="first-name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="First name"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="last-name" className="text-slate-700">
                  Last name
                </Label>
                <input
                  id="last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 !bg-white text-black border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Last name"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SSOSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <p className="text-slate-500">Loading...</p>
        </div>
      }
    >
      <SSOSignupContent />
    </Suspense>
  )
}
