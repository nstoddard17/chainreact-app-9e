"use client"

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export default function AIPromptAdminPage() {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [masterPrompt, setMasterPrompt] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dev/prompt-overrides')
      const data = await res.json()
      setValue(data?.overrides?.additionalSystem || '')
      const mp = await fetch('/api/dev/master-prompt')
      const mpData = await mp.json()
      setMasterPrompt(mpData?.systemPrompt || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/dev/prompt-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalSystem: value })
      })
      if (res.ok) setStatus('Saved')
      else setStatus('Failed')
    } finally {
      setLoading(false)
    }
  }

  const runTest = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/dev/generate-workflow-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Create a Discord support triage workflow for bugs, questions, urgent issues, and feature requests.',
          model: 'gpt-4o-mini'
        })
      })
      const data = await res.json()
      console.log('Debug result', data)
      setStatus('Test run complete. Check console for details.')
    } finally {
      setLoading(false)
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return (
      <AppLayout title="AI Prompt Admin">
        <div className="p-6">Not available in production.</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="AI Prompt Admin">
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Global System Prompt Overrides</h2>
        <p className="text-sm text-muted-foreground">This text is prepended to the AI system prompt used for generating workflows.</p>
        <Textarea rows={10} value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="flex gap-3">
          <Button onClick={save} disabled={loading}>Save</Button>
          <Button variant="outline" onClick={load} disabled={loading}>Reload</Button>
          <Button variant="secondary" onClick={runTest} disabled={loading}>Run Test</Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>

        <div className="pt-6 space-y-2">
          <h3 className="text-lg font-medium">Current Master System Prompt</h3>
          <p className="text-sm text-muted-foreground">This is the full prompt used (overrides + dynamic registry prompt). Read-only.</p>
          <Textarea rows={16} value={masterPrompt} readOnly className="font-mono text-xs" />
          <div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>Refresh</Button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
