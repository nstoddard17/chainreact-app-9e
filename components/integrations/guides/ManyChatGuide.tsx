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

interface ManyChatGuideProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (apiKey: string) => Promise<void>
}

export function ManyChatGuide({ open, onOpenChange, onConnect }: ManyChatGuideProps) {
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect to ManyChat</DialogTitle>
          <DialogDescription>
            Follow these steps to find your ManyChat API key and connect your account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-sm mb-2">What you can do with ManyChat:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Send messages and flows to subscribers</li>
              <li>Manage tags and custom fields</li>
              <li>Subscribe/unsubscribe users to sequences</li>
              <li>Get subscriber information</li>
              <li>Find users by ID</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-sm">Setup Instructions:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                Log in to your{' '}
                <Link href="https://manychat.com" target="_blank" className="text-blue-500 hover:underline">
                  ManyChat account
                </Link>.
              </li>
              <li>
                Navigate to{' '}
                <Link href="https://manychat.com/settings" target="_blank" className="text-blue-500 hover:underline">
                  Settings
                </Link>{' '}
                → API tab.
              </li>
              <li>
                Click "Generate Your API Key" button.
              </li>
              <li>
                Copy the generated API key and paste it below.
              </li>
            </ol>
          </div>

          <div className="rounded-md bg-amber-50 dark:bg-amber-950 p-3 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> API access requires a ManyChat Pro subscription. Rate limit: 10 requests per second.
            </p>
          </div>
          <Input
            type="password"
            placeholder="Enter your ManyChat API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isLoading}
            className="font-mono"
            autoComplete="off"
            name="manychat-api-key"
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
            Connect ManyChat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
