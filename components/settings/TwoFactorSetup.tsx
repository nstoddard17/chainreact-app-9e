"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle, XCircle, Copy, Smartphone, Shield, Check } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"

interface TwoFactorSetupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function TwoFactorSetup({ open, onOpenChange, onSuccess }: TwoFactorSetupProps) {
  const { toast } = useToast()
  const { user } = useAuthStore()

  const [step, setStep] = useState<'setup' | 'verify' | 'success'>('setup')
  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [factorId, setFactorId] = useState<string>('')
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('setup')
      setVerificationCode('')
      setError(null)
      setSecretCopied(false)
      enrollIn2FA()
    }
  }, [open])

  const enrollIn2FA = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/2fa/enroll', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to enroll in 2FA')
      }

      const data = await response.json()
      setQrCode(data.qr_code)
      setSecret(data.secret)
      setFactorId(data.factor_id)
    } catch (err: any) {
      setError(err.message || 'Failed to set up 2FA')
    } finally {
      setLoading(false)
    }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(secret)
    setSecretCopied(true)
    toast({
      title: "Secret copied",
      description: "The secret has been copied to your clipboard",
    })
    setTimeout(() => setSecretCopied(false), 3000)
  }

  const verifyCode = async () => {
    if (verificationCode.length !== 6) {
      setError('Please enter a 6-digit code')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factor_id: factorId,
          code: verificationCode,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Invalid verification code')
      }

      setStep('success')
      toast({
        title: "2FA enabled successfully",
        description: "Your account is now protected with two-factor authentication",
      })

      setTimeout(() => {
        onSuccess?.()
        onOpenChange(false)
      }, 2000)

    } catch (err: any) {
      setError(err.message || 'Failed to verify code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {step === 'setup' && 'Set Up Two-Factor Authentication'}
            {step === 'verify' && 'Verify Your Code'}
            {step === 'success' && '2FA Enabled Successfully'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {step === 'setup' && 'Scan the QR code with your authenticator app'}
            {step === 'verify' && 'Enter the 6-digit code from your authenticator app'}
            {step === 'success' && 'Your account is now protected'}
          </DialogDescription>
        </DialogHeader>

        {step === 'setup' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Setting up 2FA...</p>
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Step 1: Download App */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      1
                    </div>
                    <h3 className="font-semibold">Download an authenticator app</h3>
                  </div>
                  <div className="pl-11 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      We recommend:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 rounded-md bg-muted font-medium">Google Authenticator</span>
                      <span className="text-xs px-2 py-1 rounded-md bg-muted font-medium">Authy</span>
                      <span className="text-xs px-2 py-1 rounded-md bg-muted font-medium">1Password</span>
                      <span className="text-xs px-2 py-1 rounded-md bg-muted font-medium">Microsoft Authenticator</span>
                    </div>
                  </div>
                </div>

                {/* Step 2: Scan QR Code */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      2
                    </div>
                    <h3 className="font-semibold">Scan this QR code</h3>
                  </div>
                  <div className="pl-11 space-y-3">
                    {qrCode && (
                      <div className="flex justify-center p-4 bg-white rounded-lg border">
                        <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Or enter this code manually:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono">
                          {secret}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copySecret}
                          className="shrink-0"
                        >
                          {secretCopied ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => setStep('verify')}
                  className="w-full"
                  size="lg"
                >
                  Continue to Verification
                </Button>
              </>
            )}
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="flex justify-center">
                <Smartphone className="w-16 h-16 text-muted-foreground" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-center block">Enter 6-Digit Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '')
                    setVerificationCode(value)
                    if (value.length === 6) {
                      setError(null)
                    }
                  }}
                  placeholder="000000"
                  className="text-center text-2xl font-mono tracking-widest"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  Open your authenticator app and enter the 6-digit code
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('setup')}
                className="flex-1"
                disabled={loading}
              >
                Back
              </Button>
              <Button
                onClick={verifyCode}
                className="flex-1"
                disabled={loading || verificationCode.length !== 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Enable'
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">You're all set!</h3>
              <p className="text-sm text-muted-foreground">
                Two-factor authentication has been enabled for your account. You'll now need to enter a code from your authenticator app when you sign in.
              </p>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Keep your authenticator app secure and backed up. If you lose access to it, you may be locked out of your account.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
