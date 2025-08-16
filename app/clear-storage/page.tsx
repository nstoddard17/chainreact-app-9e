"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"

export default function ClearStoragePage() {
  const [storageItems, setStorageItems] = useState<{[key: string]: string}>({})

  useEffect(() => {
    // Get all localStorage items
    const items: {[key: string]: string} = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        items[key] = localStorage.getItem(key) || ''
      }
    }
    setStorageItems(items)
  }, [])

  const clearAll = () => {
    localStorage.clear()
    setStorageItems({})
    alert('All localStorage cleared!')
  }

  const clearSpecific = (key: string) => {
    localStorage.removeItem(key)
    const newItems = {...storageItems}
    delete newItems[key]
    setStorageItems(newItems)
  }

  return (
    <div className="min-h-screen p-8 bg-slate-900 text-white">
      <h1 className="text-3xl font-bold mb-6">Clear Storage</h1>
      
      <Button onClick={clearAll} variant="destructive" className="mb-6">
        Clear All localStorage
      </Button>

      <div className="bg-slate-800 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Current localStorage Items:</h2>
        {Object.keys(storageItems).length === 0 ? (
          <p className="text-gray-400">No items in localStorage</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(storageItems).map(([key, value]) => (
              <div key={key} className="flex items-start justify-between p-2 bg-slate-700 rounded">
                <div className="flex-1 mr-4">
                  <strong className="text-blue-300">{key}:</strong>
                  <pre className="text-sm text-gray-300 mt-1 whitespace-pre-wrap break-all">
                    {value.length > 200 ? value.substring(0, 200) + '...' : value}
                  </pre>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => clearSpecific(key)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}