"use client"

import { useState, useEffect } from "react"

export default function DebugNotionPage() {
  const [pages, setPages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPages() {
      try {
        const response = await fetch("/api/integrations/notion/debug")
        if (!response.ok) {
          const errorText = await response.text()
          setError(`API Error: ${response.status} - ${errorText}`)
          setLoading(false)
          return
        }
        const result = await response.json()
        setPages(result.pages || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }
    fetchPages()
  }, [])

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">Notion Page Hierarchy</h1>
        {loading && (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <div className="text-white">Loading Notion pages...</div>
          </div>
        )}
        {error && (
          <div className="p-8 text-red-400 bg-red-900 border border-red-700 rounded">
            <h2 className="font-semibold mb-2 text-white">Error:</h2>
            <pre className="whitespace-pre-wrap text-red-300">{error}</pre>
          </div>
        )}
        {!loading && !error && (
          <ul className="space-y-4">
            {pages.map((page) => (
              <li key={page.id}>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-semibold text-blue-400 hover:underline"
                >
                  {page.title}
                </a>
                {page.subpages && page.subpages.length > 0 && (
                  <ul className="ml-6 mt-2 space-y-1 list-disc">
                    {page.subpages.map((sub: any) => (
                      <li key={sub.id}>
                        <a
                          href={sub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-300 hover:underline"
                        >
                          {sub.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
} 