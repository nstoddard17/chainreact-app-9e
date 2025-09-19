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
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameCheckTimer, setUsernameCheckTimer] = useState<NodeJS.Timeout | null>(null)

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

    // Validate username
    if (!username || username.trim().length < 3) {
      toast({
        title: "Username required",
        description: "Please choose a username with at least 3 characters",
        variant: "destructive"
      })
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      toast({
        title: "Invalid username",
        description: "Username can only contain letters, numbers, dashes, and underscores",
        variant: "destructive"
      })
      return
    }

    // Check username availability one more time before submission
    setLoading(true)
    try {
      const response = await fetch('/api/check-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      })

      const data = await response.json()

      if (!data.available) {
        toast({
          title: "Username taken",
          description: "This username is already in use. Please choose another.",
          variant: "destructive"
        })
        setLoading(false)
        return
      }
    } catch (checkErr: any) {
      console.log("Username pre-check error:", checkErr)
      // Continue with signup - database constraints will handle duplicates
    }

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

    // setLoading is already true from username check above

    try {
      const supabase = createClient()

      // Sign up the user - keep it simple, no special options
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName,
            username: username,
            is_beta_tester: true
          }
        }
      })

      if (error) {
        throw error
      }

      if (data?.user) {
        // Create the user profile using service role API to bypass RLS
        let profileCreated = false
        let retryCount = 0
        const maxRetries = 3

        while (!profileCreated && retryCount < maxRetries) {
          try {
            console.log(`Attempting to create profile (attempt ${retryCount + 1}/${maxRetries})`)

            // Use API endpoint with service role to bypass RLS
            const response = await fetch('/api/create-beta-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: data.user.id,
                username: username.toLowerCase().trim(),
                fullName: fullName,
                email: email
              }),
            })

            const result = await response.json()

            if (response.ok && result.success) {
              console.log("Profile created successfully:", result.profile)
              profileCreated = true
            } else {
              throw new Error(result.error || 'Failed to create profile')
            }

          } catch (err: any) {
            console.error(`Profile creation attempt ${retryCount + 1} error:`, err)
            retryCount++

            if (retryCount >= maxRetries) {
              // Profile creation failed after all retries
              console.error("Failed to create user profile after all retries. Error details:", {
                error: err,
                message: err?.message
              })

              toast({
                title: "Profile Creation Failed",
                description: "Unable to create your profile. Please try again or contact support.",
                variant: "destructive"
              })

              // Don't proceed with the flow
              setLoading(false)
              return
            }

            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
          }
        }

        // Update beta tester status to converted AFTER user creation
        try {
          // Use RPC to mark beta tester as converted
          const { error: convertError } = await supabase.rpc('mark_beta_tester_converted', {
            user_email: email
          })

          if (convertError) {
            console.error("Failed to mark beta tester as converted:", convertError)
          }

          // Try to confirm email for beta testers (if function exists)
          const { error: confirmError } = await supabase.rpc('confirm_beta_tester_email', {
            user_email: email
          })

          if (confirmError) {
            console.error("Failed to confirm email:", confirmError)
            // Not critical - user can confirm via email
          }
        } catch (err) {
          console.error("Error updating beta tester status:", err)
          // Non-critical errors, continue
        }

        // Wait a bit to ensure all database operations propagate
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Sign in the user immediately after signup
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        })

        if (signInError) {
          console.error("Auto sign-in error:", signInError)
          toast({
            title: "Account Created",
            description: "Your account has been created. Please sign in to continue.",
          })
          setTimeout(() => {
            router.push("/auth/login")
          }, 1500)
          return
        }

        if (signInData?.user) {
          // Do one final verification that profile exists with username
          const { data: finalProfileCheck, error: finalCheckError } = await supabase
            .from('user_profiles')
            .select('id, username, role')
            .eq('id', signInData.user.id)
            .single()

          if (!finalCheckError && finalProfileCheck && finalProfileCheck.username) {
            console.log("Final profile check passed:", finalProfileCheck)

            toast({
              title: "Welcome to ChainReact Beta! 🎉",
              description: "Your account has been created successfully.",
            })

            // Small delay to ensure session is established
            await new Promise(resolve => setTimeout(resolve, 500))

            // Use window.location for hard redirect to ensure clean navigation
            window.location.href = "/dashboard"
          } else {
            // This should never happen with our retry logic, but just in case
            console.error("Profile missing after all checks:", finalCheckError)
            toast({
              title: "Setup Required",
              description: "Please complete your profile setup.",
            })
            window.location.href = "/auth/setup-username"
          }
        } else {
          // Fallback if sign-in returns no user
          toast({
            title: "Account Created",
            description: "Please sign in to continue.",
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
                <div className="relative">
                  <Input
                    id="username"
                    type="text"
                    placeholder="johndoe"
                    value={username}
                    onChange={(e) => {
                      const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
                      setUsername(value)

                      // Clear previous timer if exists
                      if (usernameCheckTimer) {
                        clearTimeout(usernameCheckTimer)
                      }

                      // Clear previous state
                      setUsernameAvailable(null)

                      // Check username availability after typing stops
                      if (value.length >= 3) {
                        setCheckingUsername(true)
                        const timer = setTimeout(async () => {
                          try {
                            // Use API endpoint that uses service role to bypass RLS
                            const response = await fetch('/api/check-username', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ username: value }),
                            })

                            const data = await response.json()
                            setUsernameAvailable(data.available)
                          } catch (err: any) {
                            console.error("Username availability check error:", err)
                            // Default to showing as available - actual check happens at signup
                            setUsernameAvailable(true)
                          } finally {
                            setCheckingUsername(false)
                          }
                        }, 500)

                        setUsernameCheckTimer(timer)
                      } else {
                        setCheckingUsername(false)
                      }
                    }}
                    required
                    className={
                      usernameAvailable === false
                        ? "border-red-500 focus:border-red-500"
                        : usernameAvailable === true
                        ? "border-green-500 focus:border-green-500"
                        : ""
                    }
                  />
                  {checkingUsername && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!checkingUsername && usernameAvailable === true && username.length >= 3 && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                  {!checkingUsername && usernameAvailable === false && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500">
                      <svg fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                        <path d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {usernameAvailable === false
                    ? "This username is already taken"
                    : usernameAvailable === true && username.length >= 3
                    ? "Username is available!"
                    : "Choose a unique username for your account"}
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
                disabled={loading || !fullName || !username || !password || !confirmPassword || checkingUsername || usernameAvailable === false}
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