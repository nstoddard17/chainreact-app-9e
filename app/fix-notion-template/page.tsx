"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { fixNotionTemplate } from './actions'

export default function FixNotionTemplatePage() {
  const [status, setStatus] = useState('Click the button to fix the Notion node in Smart Email Triage template')
  const [loading, setLoading] = useState(false)

  const handleFix = async () => {
    setLoading(true)
    setStatus('Fixing template...')

    try {
      const result = await fixNotionTemplate()

      if (result.success) {
        setStatus(`✅ ${ result.message } Now go delete your workflow copy and copy the template again!`)
      } else {
        setStatus(`❌ Error: ${ result.error}`)
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${ error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-8">
      <div className="max-w-2xl w-full bg-gray-900 rounded-lg border border-gray-800 p-8">
        <h1 className="text-2xl font-bold text-white mb-4">
          Fix Notion Template Configuration
        </h1>

        <p className="text-gray-400 mb-6">
          This will add <code className="bg-gray-800 px-2 py-1 rounded">needsConfiguration: true</code> to the
          &quot;Add to Team Docs&quot; Notion node in the Smart Email Triage template.
        </p>

        <div className="bg-gray-800 p-4 rounded-lg mb-6 font-mono text-sm text-gray-300">
          {status}
        </div>

        <Button
          onClick={handleFix}
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Fixing...' : 'Fix Template'}
        </Button>

        <p className="text-xs text-gray-500 mt-4">
          After fixing, reload any open workflows that use this template to see the configuration modal.
        </p>
      </div>
    </div>
  )
}
