"use client"

import { useEffect, useState } from 'react'
import { useIntegrationStore } from '@/stores/integrationStore'

export default function TestIntegrationCalls() {
  const [callCount, setCallCount] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const { fetchIntegrations } = useIntegrationStore()
  
  // Override console.log to capture logs
  useEffect(() => {
    const originalLog = console.log
    const originalError = console.error
    const originalTrace = console.trace
    
    console.log = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      
      if (message.includes('fetchIntegrations') || 
          message.includes('ConfigForm') || 
          message.includes('WorkflowBuilder') ||
          message.includes('AUTH ERROR')) {
        setLogs(prev => [...prev.slice(-50), `[LOG] ${new Date().toISOString()}: ${message}`])
      }
      originalLog(...args)
    }
    
    console.error = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      
      if (message.includes('fetchIntegrations') || 
          message.includes('AUTH ERROR')) {
        setLogs(prev => [...prev.slice(-50), `[ERROR] ${new Date().toISOString()}: ${message}`])
      }
      originalError(...args)
    }
    
    console.trace = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      
      if (message.includes('fetchIntegrations')) {
        setCallCount(prev => prev + 1)
        setLogs(prev => [...prev.slice(-50), `[TRACE] ${new Date().toISOString()}: ${message}`])
      }
      originalTrace(...args)
    }
    
    return () => {
      console.log = originalLog
      console.error = originalError
      console.trace = originalTrace
    }
  }, [])
  
  // Simulate mounting ConfigurationForm multiple times
  const [showConfig, setShowConfig] = useState(false)
  const [rapidTest, setRapidTest] = useState(false)
  
  // Simulate rapid mounting/unmounting like what might happen in workflow
  useEffect(() => {
    if (rapidTest) {
      const interval = setInterval(() => {
        setShowConfig(prev => !prev)
      }, 100) // Toggle every 100ms
      
      // Stop after 3 seconds
      setTimeout(() => {
        clearInterval(interval)
        setRapidTest(false)
        setShowConfig(false)
      }, 3000)
      
      return () => clearInterval(interval)
    }
  }, [rapidTest])
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Integration Calls Test</h1>
      
      <div className="mb-4 p-4 bg-red-100 rounded">
        <h2 className="text-xl font-bold text-red-700">
          fetchIntegrations called: {callCount} times
        </h2>
      </div>
      
      <button 
        onClick={() => setShowConfig(!showConfig)}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        {showConfig ? 'Hide' : 'Show'} Config Form (triggers mount/unmount)
      </button>
      
      <button 
        onClick={() => setRapidTest(true)}
        className="mb-4 ml-2 px-4 py-2 bg-red-500 text-white rounded"
        disabled={rapidTest}
      >
        {rapidTest ? 'Running Rapid Test...' : 'Start Rapid Mount/Unmount Test (3s)'}
      </button>
      
      <button 
        onClick={() => {
          setCallCount(0)
          setLogs([])
        }}
        className="mb-4 ml-2 px-4 py-2 bg-gray-500 text-white rounded"
      >
        Clear Logs
      </button>
      
      {showConfig && <MockConfigForm />}
      
      <div className="mt-4">
        <h3 className="font-bold mb-2">Recent Logs (last 50):</h3>
        <div className="bg-black text-green-400 p-4 rounded h-96 overflow-y-auto font-mono text-xs">
          {logs.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Simulate ConfigurationForm behavior WITH DEBOUNCE
function MockConfigForm() {
  const { fetchIntegrations } = useIntegrationStore()
  
  useEffect(() => {
    const componentId = Math.random().toString(36).substr(2, 9);
    console.log('🚨 [MockConfigForm] MOUNT EFFECT RUNNING', {
      timestamp: new Date().toISOString(),
      componentId
    })
    
    let mounted = true;
    let timeoutId: NodeJS.Timeout;
    
    // DEBOUNCE - same as real ConfigurationForm
    timeoutId = setTimeout(async () => {
      if (mounted) {
        console.log('✅ [MockConfigForm] Component stayed mounted, fetching', { componentId });
        await fetchIntegrations();
      } else {
        console.log('⏭️ [MockConfigForm] Component unmounted quickly, skipping fetch', { componentId });
      }
    }, 500); // 500ms debounce
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      console.log('🚨 [MockConfigForm] UNMOUNT EFFECT CLEANUP', { componentId })
    }
  }, [])
  
  return (
    <div className="p-4 border-2 border-blue-500 rounded">
      <h3 className="font-bold">Mock Config Form (With Debounce)</h3>
      <p>This simulates the ConfigurationForm component with 500ms debounce</p>
    </div>
  )
}