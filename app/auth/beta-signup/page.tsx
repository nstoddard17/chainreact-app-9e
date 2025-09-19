"use client"

import { Suspense } from "react"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/utils/supabaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle, Sparkles, Zap, Shield, Users } from "lucide-react"
import Link from "next/link"

function BetaSignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [validatingToken, setValidatingToken] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)

  useEffect(() => {
    // Get email and token from URL params
    const urlEmail = searchParams.get("email")
    const token = searchParams.get("token")

    // Decode the email from URL encoding
    const decodedEmail = urlEmail ? decodeURIComponent(urlEmail) : null

    if (decodedEmail) {
      setEmail(decodedEmail)
    }

    // Validate the token with the decoded email
    validateToken(token, decodedEmail)
  }, [searchParams])

  const validateToken = async (token: string | null, urlEmail: string | null) => {
    if (!token || !urlEmail) {
      setValidatingToken(false)
      setTokenValid(false)
      return
    }

    try {
      // Decode the token to check if it's valid
      const decoded = atob(token)
      const [tokenEmail] = decoded.split(":")

      console.log("Token validation:", { token, decoded, tokenEmail, urlEmail })

      if (tokenEmail === urlEmail) {
        // Token matches the email, check if this beta tester exists and has this token
        const supabase = createClient()


        // First check if user already exists (they may have already signed up)
        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("email", urlEmail)
          .single()

        if (userData) {
          toast({
            title: "Account Already Exists",
            description: "You already have an account. Redirecting to login...",
            variant: "default"
          })
          setTimeout(() => {
            router.push("/auth/login")
          }, 1500)
          setValidatingToken(false)
          return
        }

        // Check beta tester record
        const { data, error } = await supabase
          .from("beta_testers")
          .select("status, expires_at, signup_token")
          .eq("email", urlEmail)
          .single()

        console.log("Beta tester query result:", { data, error })

        if (error) {
          console.error("Database error:", error)
          setTokenValid(false)
          toast({
            title: "Invitation Not Found",
            description: "No invitation found for this email address. Please ensure you're using the latest invitation link.",
            variant: "destructive"
          })
          return
        }

        if (data) {
          console.log("Beta tester data:", {
            status: data.status,
            expires_at: data.expires_at,
            signup_token: data.signup_token,
            tokenMatch: data.signup_token === token
          })

          // Check if already converted (user already signed up)
          if (data.status === 'converted') {
            toast({
              title: "Already Signed Up",
              description: "You've already created an account with this invitation. Redirecting to login...",
              variant: "default"
            })
            setTimeout(() => {
              router.push("/auth/login")
            }, 1500)
            setValidatingToken(false)
            return
          }

          // Check if invitation has expired
          const hasExpired = data.expires_at && new Date(data.expires_at) < new Date()

          // If signup_token is null, this might be an old invitation - accept it
          if (!data.signup_token || data.signup_token === token) {
            if (!hasExpired && data.status === 'active') {
              setTokenValid(true)
            } else if (hasExpired) {
              setTokenValid(false)
              toast({
                title: "Invitation Expired",
                description: "This beta invitation has expired. Please contact support for assistance.",
                variant: "destructive"
              })
            } else {
              setTokenValid(false)
              toast({
                title: "Invitation Issue",
                description: "There's an issue with your invitation. Please contact support.",
                variant: "destructive"
              })
            }
          } else {
            setTokenValid(false)
            toast({
              title: "Invalid Invitation",
              description: "This invitation link is invalid. Please use the link from your email.",
              variant: "destructive"
            })
          }
        } else {
          setTokenValid(false)
          toast({
            title: "Invitation Not Found",
            description: "No invitation found for this email address.",
            variant: "destructive"
          })
        }
      } else {
        setTokenValid(false)
      }
    } catch (error) {
      console.error("Token validation error:", error)
      setTokenValid(false)
    } finally {
      setValidatingToken(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match",
        variant: "destructive"
      })
      return
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive"
      })
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Sign up the user with email confirmation disabled for beta testers
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName,
            username: username,
            is_beta_tester: true,
            email_confirmed: true  // Mark as confirmed for beta testers
          },
          emailRedirectTo: undefined  // Don't send confirmation email
        }
      })

      if (error) {
        throw error
      }

      if (data?.user) {
        // The trigger in the database will automatically assign the beta-pro role
        // based on the email matching a beta_testers record

        // Manually confirm the beta tester's email
        try {
          const { data: confirmData, error: confirmError } = await supabase
            .rpc('confirm_beta_tester_after_signup', { user_email: email })

          if (confirmError) {
            console.error("Error confirming email:", confirmError)
          }
        } catch (err) {
          console.error("Failed to auto-confirm email:", err)
        }

        // Wait a brief moment for the confirmation to process
        await new Promise(resolve => setTimeout(resolve, 500))

        // Sign in the user immediately after signup
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        })

        if (signInError) {
          console.error("Auto sign-in error:", signInError)
          // If sign-in fails due to email confirmation, try to manually confirm
          if (signInError.message?.includes('confirm')) {
            toast({
              title: "Account Created",
              description: "Your account has been created. Redirecting to login...",
            })
            setTimeout(() => {
              router.push("/auth/login")
            }, 1500)
            return
          }
        }

        if (signInData?.user) {
          toast({
            title: "Welcome to ChainReact Beta! 🎉",
            description: "Your account has been created and you're now logged in.",
          })

          // Redirect to dashboard immediately
          router.push("/dashboard")
        } else {
          // Fallback to login page if auto-login failed
          toast({
            title: "Account Created",
            description: "Your account has been created. Please sign in.",
          })
          setTimeout(() => {
            router.push("/auth/login")
          }, 1500)
        }
      }
    } catch (error: any) {
      console.error("Signup error:", error)
      toast({
        title: "Signup Failed",
        description: error.message || "There was an error creating your account",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Validating your invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This beta invitation link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              If you believe this is an error, please contact our support team.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/login">Go to Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">
        {/* Left side - Benefits */}
        <div className="hidden md:block space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Welcome to ChainReact Beta
            </h1>
            <p className="text-xl text-muted-foreground">
              You're invited to shape the future of workflow automation
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold">Exclusive Early Access</h3>
                <p className="text-sm text-muted-foreground">Be among the first to use our powerful automation platform</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Zap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold">Pro Features Free</h3>
                <p className="text-sm text-muted-foreground">Access all premium features at no cost during beta</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold">Priority Support</h3>
                <p className="text-sm text-muted-foreground">Get direct access to our development team</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold">Shape the Product</h3>
                <p className="text-sm text-muted-foreground">Your feedback directly influences our roadmap</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Signup form */}
        <Card className="w-full max-w-md mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Verified Beta Invitation
              </span>
            </div>
            <CardTitle>Create Your Beta Account</CardTitle>
            <CardDescription>
              Complete your registration to access ChainReact Beta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This email is pre-registered for beta access
                </p>
              </div>

              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="johndoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a unique username for your account
                </p>
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !fullName || !username || !password || !confirmPassword}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Beta Account"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By signing up, you agree to our{" "}
                <Link href="/terms" className="underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline">
                  Privacy Policy
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Loading fallback component
function BetaSignupLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Main component with Suspense boundary
export default function BetaSignupPage() {
  return (
    <Suspense fallback={<BetaSignupLoading />}>
      <BetaSignupContent />
    </Suspense>
  )
}