"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Copy, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export default function StripeSetupGuide() {
  const [copiedStep, setCopiedStep] = useState<number | null>(null)

  const copyToClipboard = (text: string, step: number) => {
    navigator.clipboard.writeText(text)
    setCopiedStep(step)
    setTimeout(() => setCopiedStep(null), 2000)
  }

  const isDevelopment = process.env.NODE_ENV === "development"

  if (!isDevelopment) return null

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant="outline">Development</Badge>
          Stripe Setup Guide
        </CardTitle>
        <CardDescription>Follow these steps to configure Stripe for your billing system</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            This guide is only visible in development mode. Complete these steps to enable billing functionality.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-semibold mb-2">Step 1: Create Stripe Products & Prices</h4>
            <p className="text-sm text-gray-600 mb-3">
              Create products and prices in your Stripe dashboard, then update the database with the real price IDs.
            </p>
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <code className="text-sm">
                  UPDATE plans SET stripe_price_id_monthly = 'price_xxx' WHERE name = 'Starter';
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard("UPDATE plans SET stripe_price_id_monthly = 'price_xxx' WHERE name = 'Starter';", 1)
                  }
                >
                  {copiedStep === 1 ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="border-l-4 border-green-500 pl-4">
            <h4 className="font-semibold mb-2">Step 2: Configure Webhook Endpoint</h4>
            <p className="text-sm text-gray-600 mb-3">Add this webhook endpoint to your Stripe dashboard:</p>
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="flex items-center justify-between">
                <code className="text-sm">
                  {process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"}/api/webhooks/stripe
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard(
                      `${process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"}/api/webhooks/stripe`,
                      2,
                    )
                  }
                >
                  {copiedStep === 2 ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="border-l-4 border-purple-500 pl-4">
            <h4 className="font-semibold mb-2">Step 3: Environment Variables</h4>
            <p className="text-sm text-gray-600 mb-3">Ensure these environment variables are set:</p>
            <ul className="text-sm space-y-1">
              <li>✅ STRIPE_SECRET_KEY</li>
              <li>✅ STRIPE_WEBHOOK_SECRET</li>
              <li>✅ NEXT_PUBLIC_APP_URL</li>
            </ul>
          </div>

          <div className="flex items-center gap-2 pt-4">
            <Button asChild size="sm">
              <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                Open Stripe Dashboard <ExternalLink className="w-4 h-4 ml-1" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
