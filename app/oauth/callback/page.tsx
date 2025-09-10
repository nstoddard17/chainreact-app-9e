'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { sendOAuthComplete } from '@/lib/utils/oauth-popup'
import { LightningLoader } from '@/components/ui/lightning-loader'

function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  
  useEffect(() => {
    // Check if we have success or error in the URL params
    const success = searchParams.get('success') === 'true'
    const error = searchParams.get('error')
    
    // Send message to parent window
    sendOAuthComplete(success, error || undefined)
    
    // If no parent window, redirect to integrations page after a delay
    if (!window.opener || window.opener.closed) {
      setTimeout(() => {
        window.location.href = '/integrations'
      }, 2000)
    }
  }, [searchParams])
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <LightningLoader />
        <p className="mt-4 text-muted-foreground">
          Completing connection...
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This window will close automatically.
        </p>
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LightningLoader />
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  )
}