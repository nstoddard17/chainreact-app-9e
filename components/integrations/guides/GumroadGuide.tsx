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

interface GumroadGuideProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (apiKey: string) => Promise<void>
}

export function GumroadGuide({ open, onOpenChange, onConnect }: GumroadGuideProps) {
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    setIsLoading(true)
    setError('')
    try {
      await onConnect(apiKey)
      onOpenChange(false) // Close the dialog on success
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
          <DialogTitle>Connect to Gumroad</DialogTitle>
          <DialogDescription>
            Follow these steps to find your Gumroad API key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Log in to your Gumroad account.
            </li>
            <li>
              Navigate to the{' '}
              <Link href="https://app.gumroad.com/settings/advanced" target="_blank" className="text-blue-500 hover:underline">
                Advanced Settings
              </Link>{' '}
              page.
            </li>
            <li>
              Scroll down to the "Developer settings" section.
            </li>
            <li>
              Copy your existing API key or create a new one.
            </li>
            <li>
              Paste the API key below.
            </li>
          </ol>
          <Input
            type="password"
            placeholder="Enter your Gumroad API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isLoading}
            className="font-mono"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={isLoading || !apiKey}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect Gumroad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 