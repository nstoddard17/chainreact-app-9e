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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to ManyChat</DialogTitle>
          <DialogDescription>
            Follow these steps to find your ManyChat API key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Log in to your ManyChat account.
            </li>
            <li>
              Navigate to{' '}
              <Link href="https://manychat.com/settings" target="_blank" className="text-blue-500 hover:underline">
                Settings
              </Link>{' '}
              and then to the "API" tab.
            </li>
            <li>
              Click the "Generate Your API Key" button.
            </li>
            <li>
              Copy the generated API key and paste it below.
            </li>
          </ol>
          <Input
            type="password"
            placeholder="Enter your ManyChat API Key"
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
            Connect ManyChat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 