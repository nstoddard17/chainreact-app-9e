"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"

export default function TestCrossTabPage() {
  const [receivedMessages, setReceivedMessages] = useState<string[]>([])
  const [isListening, setIsListening] = useState(false)

  useEffect(() => {
    if (!isListening) return

    let broadcastChannel: BroadcastChannel | null = null

    // Test BroadcastChannel
    try {
      broadcastChannel = new BroadcastChannel('emailConfirmation')
      broadcastChannel.onmessage = (event) => {
        setReceivedMessages(prev => [
          ...prev,
          `BroadcastChannel: ${JSON.stringify(event.data)} at ${new Date().toLocaleTimeString()}`
        ])
      }
    } catch (error) {
      setReceivedMessages(prev => [
        ...prev,
        `BroadcastChannel not supported: ${error}`
      ])
    }

    // Test storage events
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'emailConfirmed') {
        setReceivedMessages(prev => [
          ...prev,
          `Storage event: ${event.newValue} at ${new Date().toLocaleTimeString()}`
        ])
      }
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
      if (broadcastChannel) {
        broadcastChannel.close()
      }
    }
  }, [isListening])

  const sendBroadcastMessage = () => {
    try {
      const channel = new BroadcastChannel('emailConfirmation')
      const data = { 
        confirmed: true, 
        userId: 'test-user', 
        timestamp: Date.now() 
      }
      channel.postMessage(data)
      channel.close()
      
      setReceivedMessages(prev => [
        ...prev,
        `Sent BroadcastChannel message: ${JSON.stringify(data)} at ${new Date().toLocaleTimeString()}`
      ])
    } catch (error) {
      setReceivedMessages(prev => [
        ...prev,
        `Failed to send BroadcastChannel: ${error}`
      ])
    }
  }

  const sendStorageMessage = () => {
    const data = { 
      confirmed: true, 
      userId: 'test-user', 
      timestamp: Date.now() 
    }
    localStorage.setItem('emailConfirmed', JSON.stringify(data))
    
    setReceivedMessages(prev => [
      ...prev,
      `Set localStorage: ${JSON.stringify(data)} at ${new Date().toLocaleTimeString()}`
    ])
  }

  return (
    <div className="min-h-screen p-8 bg-slate-900 text-white">
      <h1 className="text-3xl font-bold mb-6">Cross-Tab Communication Test</h1>
      
      <div className="space-y-4 mb-8">
        <Button
          onClick={() => setIsListening(!isListening)}
          variant={isListening ? "destructive" : "default"}
        >
          {isListening ? "Stop Listening" : "Start Listening"}
        </Button>
        
        <Button onClick={sendBroadcastMessage} disabled={!isListening}>
          Send BroadcastChannel Message
        </Button>
        
        <Button onClick={sendStorageMessage} disabled={!isListening}>
          Send Storage Message
        </Button>
        
        <Button onClick={() => setReceivedMessages([])}>
          Clear Messages
        </Button>
      </div>

      <div className="bg-slate-800 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Received Messages:</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {receivedMessages.length === 0 ? (
            <p className="text-gray-400">No messages received yet...</p>
          ) : (
            receivedMessages.map((message, index) => (
              <div key={index} className="p-2 bg-slate-700 rounded text-sm">
                {message}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-8 text-sm text-gray-400">
        <p>Instructions:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open this page in multiple tabs</li>
          <li>Click "Start Listening" in all tabs</li>
          <li>Click "Send BroadcastChannel Message" in one tab</li>
          <li>Check if other tabs receive the message</li>
          <li>Try "Send Storage Message" (this should only work across different tabs)</li>
        </ol>
      </div>
    </div>
  )
}