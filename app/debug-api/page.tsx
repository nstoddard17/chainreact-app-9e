"use client"

import { useEffect, useState } from 'react'
import { getApiBaseUrl, getBaseUrl } from '@/lib/utils/getBaseUrl'

export default function DebugApiPage() {
  const [config, setConfig] = useState<any>(null)

  useEffect(() => {
    const debugInfo = {
      baseUrl: getBaseUrl(),
      apiBaseUrl: getApiBaseUrl(),
      windowLocation: typeof window !== 'undefined' ? {
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        port: window.location.port,
        host: window.location.host,
        href: window.location.href
      } : null,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      }
    }
    setConfig(debugInfo)
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">API Debug</h1>
      
      <div className="bg-slate-800 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Current Configuration</h2>
        <pre className="text-sm bg-slate-900 p-4 rounded overflow-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>

      <div className="bg-slate-800 p-6 rounded-lg mt-6">
        <h2 className="text-xl font-semibold mb-4">Expected for Development</h2>
        <ul className="space-y-2 text-sm">
          <li>• <strong>baseUrl:</strong> http://localhost:3000</li>
          <li>• <strong>apiBaseUrl:</strong> http://localhost:3000</li>
          <li>• <strong>hostname:</strong> localhost</li>
        </ul>
        
        <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded">
          <p className="text-yellow-200 text-sm">
            <strong>If you see ngrok URLs above:</strong> Remove or comment out 
            NEXT_PUBLIC_BASE_URL and NEXT_PUBLIC_APP_URL from your .env files
          </p>
        </div>
      </div>
    </div>
  )
}