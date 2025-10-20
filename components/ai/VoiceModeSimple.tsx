"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, MicOff, Phone, Volume2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { createClient } from '@/utils/supabase/client'

interface VoiceModeProps {
  onClose: () => void
  onTranscript?: (text: string, role: 'user' | 'assistant') => void
}

type ConversationState = 'idle' | 'listening' | 'thinking' | 'speaking'

export function VoiceModeSimple({ onClose, onTranscript }: VoiceModeProps) {
  const [conversationState, setConversationState] = useState<ConversationState>('idle')
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'assistant', text: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(true)
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(20).fill(0))
  const [currentTranscript, setCurrentTranscript] = useState<string>('')
  const [isInitializing, setIsInitializing] = useState(true)
  const [initStatus, setInitStatus] = useState<string>('Requesting microphone access...')

  const recognitionRef = useRef<any>(null)
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null)
  const conversationHistory = useRef<Array<{ role: string, content: string }>>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const conversationStateRef = useRef<ConversationState>('idle')
  const isListeningRef = useRef(true)
  const voicesLoadedRef = useRef(false)

  // Keep refs in sync with state
  useEffect(() => {
    conversationStateRef.current = conversationState
  }, [conversationState])

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  // Check browser compatibility and initialize
  useEffect(() => {
    const initialize = async () => {
      logger.info('🚀 Voice Mode Initialization Started')
      logger.info('Browser:', navigator.userAgent)

      // Check for Speech Recognition support
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SpeechRecognition) {
        logger.error('❌ Speech Recognition not supported')
        setError('Voice mode is not supported in this browser. Please use Chrome, Edge, or Safari.')
        setIsInitializing(false)
        return
      }
      logger.info('✅ Speech Recognition API detected')

      // Check for getUserMedia support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        logger.error('❌ getUserMedia not supported')
        setError('Microphone access is not supported in this browser.')
        setIsInitializing(false)
        return
      }
      logger.info('✅ getUserMedia API detected')

      // Step 1: Request microphone access
      try {
        setInitStatus('Requesting microphone permission...')
        logger.info('🎤 Requesting microphone access...')

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        logger.info('✅ Microphone access granted')

        // Step 2: Set up audio visualization
        setInitStatus('Setting up audio visualization...')
        logger.info('📊 Setting up audio visualization...')

        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        const microphone = audioContext.createMediaStreamSource(stream)

        analyser.fftSize = 64
        microphone.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser

        logger.info('✅ Audio visualization ready')

        // Start visualization loop
        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const updateVisualization = () => {
          if (!analyserRef.current) return

          analyser.getByteFrequencyData(dataArray)

          // Get average audio level
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
          const normalizedAverage = average / 255

          // Create natural-looking waveform by distributing the average with randomization
          const newLevels = Array(20).fill(0).map(() => {
            // Add some randomization so bars don't all move identically
            const randomFactor = 0.7 + Math.random() * 0.6 // Between 0.7 and 1.3
            return Math.min(1, normalizedAverage * randomFactor)
          })

          setAudioLevels(newLevels)
          animationFrameRef.current = requestAnimationFrame(updateVisualization)
        }

        updateVisualization()
        logger.info('✅ Visualization loop started')

      } catch (err: any) {
        logger.error('❌ Failed to access microphone:', err)

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Microphone permission denied. Please allow microphone access in your browser settings and try again.\n\nIn Brave: Click the 🦁 icon in the address bar → Site Settings → Allow Microphone')
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.')
        } else {
          setError(`Failed to access microphone: ${err.message}`)
        }
        setIsInitializing(false)
        return
      }

      // Step 3: Initialize speech recognition
      setInitStatus('Initializing speech recognition...')
      logger.info('🎙️ Initializing speech recognition...')

      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
          logger.info('✅ Speech recognition started')
          setConversationState('listening')
          setError(null)
          setCurrentTranscript('')
          setIsInitializing(false)
        }

        recognition.onresult = async (event: any) => {
          let interimTranscript = ''
          let finalTranscript = ''

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript += transcript
            }
          }

          // Show interim transcript
          if (interimTranscript) {
            setCurrentTranscript(interimTranscript)
            logger.info('🎤 Interim:', interimTranscript)
          }

          // Process final transcript
          if (finalTranscript) {
            const userText = finalTranscript.trim()
            logger.info('✅ Final transcript:', userText)

            setCurrentTranscript('')
            setTranscript(prev => [...prev, { role: 'user', text: userText }])
            if (onTranscript) {
              onTranscript(userText, 'user')
            }

            // Stop listening while AI responds
            recognition.stop()
            setConversationState('thinking')

            // Get AI response
            await getAIResponse(userText)
          }
        }

        recognition.onspeechstart = () => {
          logger.info('🎤 Speech detected')
          setConversationState('listening')
        }

        recognition.onspeechend = () => {
          logger.info('🔇 Speech ended')
        }

        recognition.onaudiostart = () => {
          logger.info('🎙️ Audio capture started')
        }

        recognition.onaudioend = () => {
          logger.info('🔇 Audio capture ended')
        }

        recognition.onerror = (event: any) => {
          // Don't log or handle 'aborted' errors - they're expected when we manually stop
          if (event.error === 'aborted') {
            return
          }

          logger.error('❌ Speech recognition error:', event.error)

          if (event.error === 'no-speech') {
            // User didn't speak, just restart
            logger.info('No speech detected, restarting...')
            setTimeout(() => {
              if (isListeningRef.current && recognitionRef.current) {
                try {
                  recognition.start()
                } catch (e) {
                  logger.error('Error restarting after no-speech:', e)
                }
              }
            }, 100)
          } else if (event.error === 'not-allowed') {
            setError('Speech recognition permission denied. Brave browser may be blocking this feature. Please check your browser settings.')
            setConversationState('idle')
          } else if (event.error === 'network') {
            setError('Network error. Please check your internet connection.')
            setConversationState('idle')
          } else {
            setError(`Speech recognition error: ${event.error}. Try refreshing the page.`)
            setConversationState('idle')
          }
        }

        recognition.onend = () => {
          const currentState = conversationStateRef.current
          const currentListening = isListeningRef.current
          logger.info('🔚 Recognition ended, state:', currentState, 'listening:', currentListening)

          // Only restart if we're listening and not thinking/speaking
          if (currentListening && currentState !== 'thinking' && currentState !== 'speaking') {
            setTimeout(() => {
              try {
                recognition.start()
                logger.info('♻️ Restarting recognition')
              } catch (e) {
                logger.error('Failed to restart recognition:', e)
              }
            }, 100)
          }
        }

        recognitionRef.current = recognition

        // Load voices for speech synthesis
        const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices()
          if (voices.length > 0) {
            voicesLoadedRef.current = true
            logger.info('✅ Loaded', voices.length, 'voices')
          }
        }

        // Load voices immediately if available
        loadVoices()

        // Also listen for voices changed event (needed for some browsers)
        window.speechSynthesis.onvoiceschanged = loadVoices

        // Start listening
        logger.info('🎙️ Starting speech recognition...')
        recognition.start()

      } catch (e: any) {
        logger.error('❌ Failed to initialize speech recognition:', e)
        setError('Failed to start speech recognition. Please try again.')
        setIsInitializing(false)
      }
    }

    initialize()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      window.speechSynthesis.cancel()
    }
  }, [])

  const getAIResponse = async (userMessage: string) => {
    try {
      // Add to conversation history
      conversationHistory.current.push({
        role: 'user',
        content: userMessage
      })

      // Get auth token
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Call AI assistant API
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: conversationHistory.current.slice(-10), // Last 10 messages for context
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()
      const aiText = data.content || 'I apologize, I didn\'t understand that.'

      // Add AI response to conversation history
      conversationHistory.current.push({
        role: 'assistant',
        content: aiText
      })

      setTranscript(prev => [...prev, { role: 'assistant', text: aiText }])
      if (onTranscript) {
        onTranscript(aiText, 'assistant')
      }

      // Speak the response
      speakText(aiText)

    } catch (error: any) {
      logger.error('Error getting AI response:', error)
      const errorMessage = 'Sorry, I encountered an error. Please try again.'
      speakText(errorMessage)
      setTranscript(prev => [...prev, { role: 'assistant', text: errorMessage }])
    }
  }

  const speakText = async (text: string) => {
    try {
      setConversationState('speaking')
      logger.info('🔊 Starting to speak:', text.substring(0, 50) + '...')

      // Cancel any ongoing speech
      window.speechSynthesis.cancel()

      // Wait for voices to load if they haven't yet
      if (!voicesLoadedRef.current) {
        logger.info('⏳ Waiting for voices to load...')
        await new Promise<void>((resolve) => {
          const checkVoices = () => {
            const voices = window.speechSynthesis.getVoices()
            if (voices.length > 0) {
              voicesLoadedRef.current = true
              logger.info('✅ Voices loaded')
              resolve()
            } else {
              setTimeout(checkVoices, 100)
            }
          }
          checkVoices()
        })
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0

      // Try to use a high-quality voice
      const voices = window.speechSynthesis.getVoices()
      logger.info('🎤 Available voices:', voices.length)

      const preferredVoice = voices.find(v =>
        v.name.includes('Samantha') ||
        v.name.includes('Google US English') ||
        v.name.includes('Microsoft') ||
        v.lang === 'en-US'
      )

      if (preferredVoice) {
        utterance.voice = preferredVoice
        logger.info('🎤 Using voice:', preferredVoice.name)
      } else {
        logger.info('🎤 Using default voice')
      }

      utterance.onstart = () => {
        logger.info('🔊 Speech started')
      }

      utterance.onend = () => {
        logger.info('✅ Speech ended')
        setConversationState('idle')

        // Resume listening after a short delay
        setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start()
              logger.info('♻️ Resuming listening after speech')
            } catch (e) {
              logger.error('Failed to resume listening:', e)
            }
          }
        }, 300)
      }

      utterance.onerror = (event) => {
        logger.error('❌ Speech synthesis error:', event.error)
        setConversationState('idle')

        // Resume listening on error
        setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start()
              logger.info('♻️ Resuming listening after error')
            } catch (e) {
              logger.error('Failed to resume listening:', e)
            }
          }
        }, 300)
      }

      synthesisRef.current = utterance
      window.speechSynthesis.speak(utterance)
      logger.info('🔊 Speech queued')
    } catch (error) {
      logger.error('❌ Failed to speak:', error)
      setConversationState('idle')
    }
  }

  const toggleListening = () => {
    if (isListening) {
      // Muting
      logger.info('🔇 Muting microphone')
      setIsListening(false)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          logger.error('Error stopping recognition:', e)
        }
      }
      setConversationState('idle')
    } else {
      // Unmuting
      logger.info('🎤 Unmuting microphone')
      setIsListening(true)

      // Only start if we're in idle state (not thinking or speaking)
      if (conversationStateRef.current === 'idle' && recognitionRef.current) {
        setTimeout(() => {
          try {
            recognitionRef.current.start()
            logger.info('✅ Recognition restarted after unmute')
          } catch (e) {
            logger.error('Error restarting recognition after unmute:', e)
          }
        }, 100)
      }
    }
  }

  const endCall = () => {
    setIsListening(false)
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    window.speechSynthesis.cancel()
    onClose()
  }

  const getStateColor = () => {
    switch (conversationState) {
      case 'listening': return 'text-blue-500'
      case 'thinking': return 'text-yellow-500'
      case 'speaking': return 'text-green-500'
      default: return 'text-muted-foreground'
    }
  }

  const getStateText = () => {
    if (error) return error

    if (isInitializing) return initStatus

    if (!isListening) return 'Microphone muted'

    switch (conversationState) {
      case 'listening': return 'Listening...'
      case 'thinking': return 'Thinking...'
      case 'speaking': return 'Speaking...'
      default: return 'Ready to talk'
    }
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <Card className="w-full max-w-lg mx-4">
        <CardContent className="p-8">
          {/* Status */}
          <div className="text-center mb-8">
            <div className={cn("text-6xl mb-4 transition-colors", getStateColor())}>
              {isInitializing && <Loader2 className="w-16 h-16 mx-auto animate-spin" />}
              {!isInitializing && conversationState === 'listening' && <Mic className="w-16 h-16 mx-auto animate-pulse" />}
              {!isInitializing && conversationState === 'thinking' && <Loader2 className="w-16 h-16 mx-auto animate-spin" />}
              {!isInitializing && conversationState === 'speaking' && <Volume2 className="w-16 h-16 mx-auto animate-pulse" />}
              {!isInitializing && conversationState === 'idle' && !isListening && <MicOff className="w-16 h-16 mx-auto" />}
              {!isInitializing && conversationState === 'idle' && isListening && <Mic className="w-16 h-16 mx-auto" />}
            </div>

            <h2 className="text-2xl font-semibold mb-2">Voice Assistant</h2>
            <p className={cn("text-sm whitespace-pre-line", error ? 'text-destructive' : getStateColor())}>
              {getStateText()}
            </p>
          </div>

          {/* Waveform visualization - REAL audio levels */}
          <div className="h-24 bg-muted/50 rounded-lg mb-4 flex items-center justify-center">
            <div className="flex gap-1 items-center h-full px-4">
              {audioLevels.map((level, i) => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(20, level * 80)}%`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Current transcript being spoken */}
          {currentTranscript && (
            <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">You're saying:</div>
              <div className="text-sm italic">{currentTranscript}</div>
            </div>
          )}

          {/* Recent transcript */}
          {transcript.length > 0 && (
            <div className="mb-6 max-h-32 overflow-y-auto space-y-2 text-sm">
              {transcript.slice(-3).map((item, index) => (
                <div
                  key={index}
                  className={cn(
                    "p-2 rounded",
                    item.role === 'user' ? 'bg-primary/10 text-right' : 'bg-muted'
                  )}
                >
                  <span className="font-medium text-xs opacity-70">
                    {item.role === 'user' ? 'You: ' : 'AI: '}
                  </span>
                  {item.text}
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-4 justify-center">
            <Button
              size="lg"
              variant="outline"
              onClick={toggleListening}
              disabled={!!error || isInitializing}
            >
              {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>

            <Button
              size="lg"
              variant="destructive"
              onClick={endCall}
            >
              <Phone className="w-5 h-5 mr-2" />
              End Call
            </Button>
          </div>

          {/* Error message with detailed instructions */}
          {error && (
            <div className="mt-4 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
            </div>
          )}

          {/* Browser compatibility note */}
          <div className="mt-4 text-center text-xs text-muted-foreground">
            Note: Works best in Chrome or Edge browsers. Brave browser may block voice features by default.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
