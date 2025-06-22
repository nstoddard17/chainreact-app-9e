'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

interface BeehiivGuideProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (apiKey: string) => Promise<void>
}

export function BeehiivGuide({ open, onOpenChange, onConnect }: BeehiivGuideProps) {
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    setIsLoading(true)
    setError('')
    try {
      await onConnect(apiKey)
      onOpenChange(false)
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to Beehiiv</DialogTitle>
          <DialogDescription>
            Follow these steps to find your Beehiiv API key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Log in to your Beehiiv account.
            </li>
            <li>
              Navigate to{' '}
              <Link href="https://app.beehiiv.com/settings/integrations" target="_blank" className="text-blue-500 hover:underline">
                Settings
              </Link>{' '}
              and find the "API, SDK, & Webhooks" section.
            </li>
            <li>
              Under "Developer Tools", click "Manage Keys" to create a new API key.
            </li>
            <li>
              Copy the generated API key and paste it below.
            </li>
          </ol>
          <Input
            type="password"
            placeholder="Enter your Beehiiv API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isLoading}
            className="font-mono"
            autoComplete="off"
            name="beehiiv-api-key"
            autoCorrect="off"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={isLoading || !apiKey}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect Beehiiv
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
