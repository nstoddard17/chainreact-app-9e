"use client"

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function TestEmailFlowPage() {
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')

  const testConfirmationFlow = async () => {
    if (!email || !userId) {
      alert('Please enter both email and userId')
      return
    }

    try {
      // Simulate the confirmation data that would be sent
      const confirmationData = {
        userId: userId,
        timestamp: Date.now(),
        confirmed: true
      }
      
      console.log('Simulating email confirmation with data:', confirmationData)
      
      // Set localStorage (like the confirm page would do)
      localStorage.setItem('emailConfirmed', JSON.stringify(confirmationData))

      // Send BroadcastChannel message (like the confirm page would do)
      try {
        const channel = new BroadcastChannel('emailConfirmation')
        channel.postMessage(confirmationData)
        channel.close()
        console.log('Sent BroadcastChannel message')
      } catch (error) {
        console.warn('BroadcastChannel not supported:', error)
      }

      alert('Test confirmation sent! Check the waiting page if you have it open.')
    } catch (error) {
      console.error('Error testing confirmation flow:', error)
      alert('Error: ' + error)
    }
  }

  const openWaitingPage = () => {
    // Set up pending signup data
    const pendingData = {
      email: email || 'test@example.com',
      userId: userId || 'test-user-id'
    }
    localStorage.setItem('pendingSignup', JSON.stringify(pendingData))
    
    // Open waiting page in new tab
    window.open('/auth/waiting-confirmation', '_blank')
  }

  const openConfirmPage = () => {
    // Open confirm page with test token
    const testToken = Buffer.from(`${userId || 'test-user-id'}:${Date.now()}`).toString('base64')
    window.open(`/auth/confirm?from=email&token=${testToken}`, '_blank')
  }

  return (
    <div className="min-h-screen p-8 bg-slate-900 text-white">
      <h1 className="text-3xl font-bold mb-6">Email Confirmation Flow Test</h1>
      
      <div className="space-y-4 mb-8 max-w-md">
        <div>
          <label className="block text-sm font-medium mb-2">Test Email:</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test@example.com"
            className="bg-slate-800 border-slate-600"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Test User ID:</label>
          <Input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="test-user-id"
            className="bg-slate-800 border-slate-600"
          />
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <Button onClick={openWaitingPage} className="mr-4">
          Open Waiting Page (Tab 1)
        </Button>
        
        <Button onClick={openConfirmPage} className="mr-4">
          Open Confirm Page (Tab 2)
        </Button>
        
        <Button onClick={testConfirmationFlow} variant="outline">
          Test Confirmation (Simulate Email Click)
        </Button>
      </div>

      <div className="bg-slate-800 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Testing Steps:</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Enter a test email and user ID above</li>
          <li>Click "Open Waiting Page" - this simulates the user waiting for email confirmation</li>
          <li>Click "Open Confirm Page" - this simulates clicking the email confirmation link</li>
          <li>OR click "Test Confirmation" to simulate the confirmation without opening tabs</li>
          <li>Check if the waiting page detects the confirmation and redirects to username setup</li>
        </ol>
        
        <div className="mt-4 p-3 bg-slate-700 rounded">
          <p className="text-sm text-yellow-300">
            <strong>Expected behavior:</strong> When the confirm page loads, it should signal the waiting page 
            via both BroadcastChannel and localStorage. The waiting page should immediately detect this 
            and redirect to /setup-username.
          </p>
        </div>
      </div>
    </div>
  )
}