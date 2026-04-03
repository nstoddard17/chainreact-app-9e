"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Shield, Key, Mail } from "lucide-react"
import { toast } from "sonner"
import type { StepUpMethod } from "@/lib/types/admin"

interface StepUpAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: () => void
  onCancel?: () => void
}

interface StepUpInfo {
  availableMethods: StepUpMethod[]
  preferredMethod: StepUpMethod
  mfaFactors: { id: string; type: string }[]
  activeSession: { method: string; expiresAt: string } | null
}

export function StepUpAuthDialog({
  open,
  onOpenChange,
  onVerified,
  onCancel,
}: StepUpAuthDialogProps) {
  const [loading, setLoading] = useState(false)
  const [fetchingMethods, setFetchingMethods] = useState(false)
  const [stepUpInfo, setStepUpInfo] = useState<StepUpInfo | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<StepUpMethod | null>(null)
  const [password, setPassword] = useState("")
  const [mfaCode, setMfaCode] = useState("")
  const [reauthPending, setReauthPending] = useState(false)

  const fetchAvailableMethods = useCallback(async () => {
    try {
      setFetchingMethods(true)
      const response = await fetch("/api/admin/verify-identity")
      if (!response.ok) return

      const data = await response.json()
      setStepUpInfo(data)

      // If there's an active session, skip verification
      if (data.activeSession) {
        onVerified()
        return
      }

      setSelectedMethod(data.preferredMethod)
    } catch {
      toast.error("Failed to load verification methods")
    } finally {
      setFetchingMethods(false)
    }
  }, [onVerified])

  useEffect(() => {
    if (open) {
      fetchAvailableMethods()
      setPassword("")
      setMfaCode("")
      setReauthPending(false)
    }
  }, [open, fetchAvailableMethods])

  const handleVerify = async () => {
    if (!selectedMethod) return

    try {
      setLoading(true)

      const body: Record<string, string | undefined> = { method: selectedMethod }

      if (selectedMethod === "password") {
        if (!password) {
          toast.error("Password is required")
          return
        }
        body.password = password
      }

      if (selectedMethod === "mfa") {
        if (!mfaCode) {
          toast.error("MFA code is required")
          return
        }
        body.code = mfaCode
        body.factorId = stepUpInfo?.mfaFactors[0]?.id
      }

      if (selectedMethod === "reauthenticate" && reauthPending) {
        if (!mfaCode) {
          toast.error("Verification code is required")
          return
        }
        body.code = mfaCode
      }

      const response = await fetch("/api/admin/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Verification failed")
      }

      // Re-auth sends a nonce to email first
      if (data.pending) {
        setReauthPending(true)
        toast.info("Check your email for a verification code")
        return
      }

      toast.success("Identity verified")
      onOpenChange(false)
      onVerified()
    } catch (error: any) {
      toast.error(error.message || "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
    onCancel?.()
  }

  const methodIcon = (method: StepUpMethod) => {
    switch (method) {
      case "mfa":
        return <Shield className="w-4 h-4" />
      case "password":
        return <Key className="w-4 h-4" />
      case "reauthenticate":
      case "email_otp":
        return <Mail className="w-4 h-4" />
    }
  }

  const methodLabel = (method: StepUpMethod) => {
    switch (method) {
      case "mfa":
        return "Authenticator App"
      case "password":
        return "Password"
      case "reauthenticate":
        return "Email Verification"
      case "email_otp":
        return "Email Code"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            Verify Your Identity
          </DialogTitle>
          <DialogDescription>
            This action requires additional verification to proceed.
          </DialogDescription>
        </DialogHeader>

        {fetchingMethods ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Method selector — only show if multiple methods */}
            {stepUpInfo && stepUpInfo.availableMethods.length > 1 && (
              <div className="space-y-2">
                <Label>Verification Method</Label>
                <div className="flex gap-2">
                  {stepUpInfo.availableMethods
                    .filter((m) => m !== "email_otp") // hide fallback unless needed
                    .map((method) => (
                      <Button
                        key={method}
                        variant={selectedMethod === method ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setSelectedMethod(method)
                          setReauthPending(false)
                          setPassword("")
                          setMfaCode("")
                        }}
                        className="flex items-center gap-1.5"
                      >
                        {methodIcon(method)}
                        {methodLabel(method)}
                      </Button>
                    ))}
                </div>
              </div>
            )}

            {/* Password input */}
            {selectedMethod === "password" && (
              <div className="space-y-2">
                <Label htmlFor="step-up-password">Password</Label>
                <Input
                  id="step-up-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  autoFocus
                />
              </div>
            )}

            {/* MFA code input */}
            {selectedMethod === "mfa" && (
              <div className="space-y-2">
                <Label htmlFor="step-up-mfa">Authenticator Code</Label>
                <Input
                  id="step-up-mfa"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  autoFocus
                />
              </div>
            )}

            {/* Re-auth flow */}
            {selectedMethod === "reauthenticate" && !reauthPending && (
              <p className="text-sm text-muted-foreground">
                A verification code will be sent to your email address.
              </p>
            )}

            {selectedMethod === "reauthenticate" && reauthPending && (
              <div className="space-y-2">
                <Label htmlFor="step-up-reauth">Email Verification Code</Label>
                <Input
                  id="step-up-reauth"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Enter code from email"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={loading || fetchingMethods}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {selectedMethod === "reauthenticate" && !reauthPending
              ? "Send Code"
              : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
