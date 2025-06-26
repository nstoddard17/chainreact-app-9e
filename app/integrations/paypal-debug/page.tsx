import React from "react"
import PayPalDebugHelper from "@/components/integrations/PayPalDebugHelper"

export default function PayPalDebugPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">PayPal Connection Troubleshooter</h1>
      <PayPalDebugHelper />
    </div>
  )
} 