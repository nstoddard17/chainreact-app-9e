"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function DebugNotionPage() {
  const [info, setInfo] = useState('Click to check template')

  const checkTemplate = async () => {
    const res = await fetch('/api/templates?search=Smart%20Email%20Triage')
    const data = await res.json()

    if (data.templates && data.templates.length > 0) {
      const template = data.templates[0]
      const nodes = template.nodes || []
      const notionNode = nodes.find((n: any) => n.id === 'chain-3-notion')

      setInfo(JSON.stringify({
        templateId: template.id,
        notionNodeConfig: notionNode?.data?.config,
        fieldNames: Object.keys(notionNode?.data?.config || {})
      }, null, 2))
    }
  }

  return (
    <div className="p-8 bg-gray-950 min-h-screen text-white">
      <h1 className="text-2xl mb-4">Debug Notion Template</h1>
      <Button onClick={checkTemplate} className="mb-4">Check Template</Button>
      <pre className="bg-gray-900 p-4 rounded text-sm overflow-auto">
        {info}
      </pre>

      <div className="mt-8 bg-gray-900 p-4 rounded">
        <h2 className="text-xl mb-2">What field name is in ConfigurationForm.tsx?</h2>
        <p className="text-gray-400">Checking for: <code className="bg-gray-800 px-2 py-1">database</code> and <code className="bg-gray-800 px-2 py-1">databaseId</code></p>

        <h2 className="text-xl mb-2 mt-4">Steps to fix:</h2>
        <ol className="list-decimal list-inside text-gray-400 space-y-2">
          <li>Delete your current workflow (don't just close it)</li>
          <li>Refresh this page</li>
          <li>Go to Templates and copy Smart Email Triage again</li>
          <li>Open Notion node and check browser console for logs starting with 🚫</li>
        </ol>
      </div>
    </div>
  )
}
