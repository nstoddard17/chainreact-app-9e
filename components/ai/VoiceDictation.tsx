"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, X, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { cleanTranscription } from '@/lib/utils/text-cleanup'

interface VoiceDictationProps {
  onTranscript: (text: string) => void
  onUpdate?: (text: string) => void // Real-time updates (Chrome only)
  onClose: () => void
}

export function VoiceDictation({ onTranscript, onUpdate, onClose }: VoiceDictationProps) {
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [finalText, setFinalText] = useState('')
  const [useWhisper, setUseWhisper] = useState(false)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [showBraveRecorder, setShowBraveRecorder] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const isMountedRef = useRef(true)
  const isManualStopRef = useRef(false)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    startDictation()

    return () => {
      isMountedRef.current = false
      isManualStopRef.current = true // Set manual stop flag to skip transcription
      cleanup()
    }
  }, [])

  const startDictation = async () => {
    try {
      // Check if Brave browser
      const isBrave = (navigator as any).brave !== undefined
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const hasWebSpeech = !!SpeechRecognition && !isBrave

      if (hasWebSpeech) {
        // Chrome/Safari/Edge: Dual mode (Web Speech + Whisper)
        logger.info('Using dual-mode dictation (Web Speech for display + Whisper for accuracy)')
        setUseWhisper(true)
        setShowBraveRecorder(false)
        startWebSpeechDictation()
        await startWhisperDictation()
      } else {
        // Brave: ChatGPT-style waveform recorder
        logger.info('Brave detected - using ChatGPT-style waveform recorder')
        setUseWhisper(true)
        setShowBraveRecorder(true)
        await startBraveWaveformRecorder()
      }
    } catch (error) {
      logger.error('Error starting dictation:', error)
      onClose()
    }
  }

  const startWebSpeechDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      logger.info('Web Speech API started (real-time display only)')
      setIsListening(true)
    }

    recognition.onresult = (event: any) => {
      let interimWords = ''
      let finalWords = ''

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalWords += transcript + ' '
        } else {
          interimWords += transcript
        }
      }

      // Update display state
      setFinalText(finalWords.trim())
      setInterimText(interimWords.trim())

      // Send real-time updates to input field (Chrome/Safari)
      if (onUpdate) {
        const combinedText = (finalWords + interimWords).trim()
        onUpdate(combinedText)
      }
    }

    recognition.onerror = (event: any) => {
      logger.error('Speech recognition error:', event.error)
      // Don't close on error - Whisper will still work
    }

    recognition.onend = () => {
      logger.info('Speech recognition ended')
      // Don't set isListening to false - Whisper is still recording
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const startBraveWaveformRecorder = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      setIsListening(true)

      // Create audio context for waveform visualization
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext // Store for cleanup

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048 // Higher resolution for smoother waveform
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      const source = audioContext.createMediaStreamSource(stream)
      audioSourceRef.current = source // Store for cleanup
      source.connect(analyser)

      // Start waveform animation
      updateWaveform()

      // Create MediaRecorder for Whisper transcription
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // If manual cancel, don't transcribe
        if (isManualStopRef.current) {
          logger.info('Recording canceled by user')
          audioChunksRef.current = []
          return
        }

        // User clicked checkmark - transcribe
        await transcribeAudio()
      }

      // Start recording
      mediaRecorder.start()
      logger.info('🎙️ ChatGPT-style waveform recorder started')
    } catch (error) {
      logger.error('Error starting waveform recorder:', error)
      onClose()
    }
  }

  const updateWaveform = () => {
    if (!isMountedRef.current || !analyserRef.current) return

    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyserRef.current.getByteFrequencyData(dataArray)

    // Get average of voice frequency range (85Hz - 255Hz)
    const voiceRange = dataArray.slice(3, 30)
    const bars = 40 // Number of bars to show

    // Create waveform data (normalize to 0-1 range)
    const newWaveformData: number[] = []
    for (let i = 0; i < bars; i++) {
      const index = Math.floor((i / bars) * voiceRange.length)
      const value = voiceRange[index] / 255
      newWaveformData.push(value)
    }

    setWaveformData(newWaveformData)

    // Continue animation
    animationFrameRef.current = requestAnimationFrame(updateWaveform)
  }

  const transcribeAudio = async () => {
    if (audioChunksRef.current.length === 0) {
      logger.info('No audio data to transcribe')
      cleanup() // Ensure everything is stopped
      onClose()
      return
    }

    // Show loading spinner
    setIsTranscribing(true)

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    audioChunksRef.current = []

    try {
      // Show instant UI feedback - transcription in progress
      logger.info('🔄 Transcription started...')

      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Transcription failed')
      }

      const data = await response.json()
      if (data.text && data.text.trim()) {
        logger.info('✅ Whisper transcript received:', data.text)
        onTranscript(data.text)
      }
    } catch (error) {
      logger.error('Error transcribing with Whisper:', error)
    } finally {
      setIsTranscribing(false)
      logger.info('🧹 Final cleanup after transcription')
      cleanup() // Extra safety - ensure all resources are released
    }

    onClose()
  }

  const handleConfirm = () => {
    logger.info('✓ User confirmed recording')
    isManualStopRef.current = false

    // Stop waveform animation first
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // CRITICAL FOR BRAVE: Disconnect audio source and close AudioContext FIRST
    if (audioSourceRef.current) {
      logger.info('🔌 Disconnecting audio source node')
      audioSourceRef.current.disconnect()
      audioSourceRef.current = null
    }

    if (audioContextRef.current) {
      logger.info('🔇 Closing AudioContext')
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Stop media stream IMMEDIATELY to remove recording indicator
    if (mediaStreamRef.current) {
      const tracks = mediaStreamRef.current.getTracks()
      tracks.forEach(track => {
        logger.info(`Stopping track: ${track.kind}, state: ${track.readyState}`)
        track.stop()
      })
      mediaStreamRef.current = null // Clear the reference immediately
      logger.info('✅ Media stream stopped and nulled - recording indicator should disappear')
    }

    // Stop media recorder (this will trigger onstop handler which calls transcribeAudio)
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  const handleCancel = () => {
    logger.info('✗ User canceled recording')
    isManualStopRef.current = true
    cleanup()
    onClose()
  }

  const startWhisperDictation = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      setIsListening(true)

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // ALWAYS stop the media stream first - even on manual stop
        if (mediaStreamRef.current) {
          const tracks = mediaStreamRef.current.getTracks()
          tracks.forEach(track => track.stop())
          mediaStreamRef.current = null
          logger.info('✅ Media stream stopped in onstop - recording indicator removed')
        }

        // If manual stop, don't transcribe - just cleanup
        if (isManualStopRef.current) {
          logger.info('Manual stop detected - skipping transcription')
          audioChunksRef.current = []
          return
        }

        if (audioChunksRef.current.length === 0) {
          logger.info('No audio data to process')
          return
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []

        // Convert to WAV and send to Whisper
        try {
          const formData = new FormData()
          formData.append('audio', audioBlob, 'recording.webm')

          const response = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            throw new Error('Transcription failed')
          }

          const data = await response.json()
          if (data.text && data.text.trim()) {
            logger.info('Whisper transcript:', data.text)
            onTranscript(data.text)
          }
        } catch (error) {
          logger.error('Error transcribing with Whisper:', error)
        }

        // Auto-close after transcription
        setTimeout(() => {
          if (isMountedRef.current) {
            onClose()
          }
        }, 500)
      }

      // Start recording - user must manually stop by clicking "Tap to stop"
      mediaRecorder.start()
      logger.info('📹 Recording started - click "Tap to stop" when done speaking')
    } catch (error) {
      logger.error('Error starting Whisper dictation:', error)
      onClose()
    }
  }

  const stopDictation = () => {
    logger.info('🛑 Stopping dictation manually')
    isMountedRef.current = false // Prevent any async operations
    isManualStopRef.current = true // Flag to skip transcription in onstop handler
    cleanup() // Stop all streams and clear resources

    // Small delay to ensure cleanup completes before closing
    setTimeout(() => {
      onClose()
    }, 100)
  }

  const cleanup = () => {
    logger.info('🧹 Cleaning up dictation resources')

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (recognitionRef.current) {
      logger.info('⏹️ Stopping speech recognition')
      try {
        recognitionRef.current.stop()
      } catch (e) {
        logger.info('Speech recognition already stopped')
      }
      recognitionRef.current = null
    }

    // CRITICAL FOR BRAVE: Disconnect audio source and close AudioContext FIRST
    if (audioSourceRef.current) {
      logger.info('🔌 Disconnecting audio source node in cleanup')
      try {
        audioSourceRef.current.disconnect()
      } catch (e) {
        logger.info('Audio source already disconnected')
      }
      audioSourceRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      logger.info('🔇 Closing AudioContext in cleanup')
      try {
        audioContextRef.current.close()
      } catch (e) {
        logger.info('AudioContext already closed')
      }
      audioContextRef.current = null
    }

    // CRITICAL: Stop media stream BEFORE stopping recorder
    // This ensures recording indicator disappears immediately
    if (mediaStreamRef.current) {
      const tracks = mediaStreamRef.current.getTracks()
      logger.info(`🛑 PRIORITY: Stopping ${tracks.length} media tracks FIRST`)
      tracks.forEach((track, index) => {
        logger.info(`  Track ${index + 1}: ${track.kind}, state before: ${track.readyState}`)
        track.stop()
        logger.info(`  Track ${index + 1}: ${track.kind}, state after: ${track.readyState}`)
      })
      mediaStreamRef.current = null
    } else {
      logger.info('ℹ️ Media stream already stopped/cleared')
    }

    // Now stop recorder (this will trigger onstop, but stream is already gone)
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        logger.info('⏹️ Stopping media recorder (stream already stopped)')
        mediaRecorderRef.current.stop()
      }
      mediaRecorderRef.current = null
    }

    analyserRef.current = null

    logger.info('✅ Cleanup complete - all resources released')
  }

  // Brave/ChatGPT-style waveform UI
  if (showBraveRecorder) {
    return (
      <div className="fixed inset-x-0 bottom-24 flex justify-center items-end z-50 pointer-events-none">
        <div className="bg-card border rounded-2xl shadow-2xl px-6 py-4 mx-4 pointer-events-auto max-w-2xl w-full">
          {isTranscribing ? (
            // Transcribing state - show spinner
            <div className="flex items-center justify-center gap-3 py-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm font-medium">Transcribing your message...</p>
            </div>
          ) : (
            // Recording state - show waveform
            <>
              {/* Horizontal waveform bar (ChatGPT style) */}
              <div className="flex items-center gap-3">
                {/* Cancel button (X) */}
                <button
                  onClick={handleCancel}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-colors"
                  title="Cancel recording"
                >
                  <X className="w-5 h-5 text-destructive" />
                </button>

                {/* Waveform visualization */}
                <div className="flex-1 flex items-center justify-center gap-0.5 h-12 bg-muted/30 rounded-lg px-2">
                  {waveformData.map((value, index) => (
                    <div
                      key={index}
                      className="w-1 bg-primary rounded-full transition-all duration-75"
                      style={{
                        height: `${Math.max(4, value * 100)}%`,
                      }}
                    />
                  ))}
                </div>

                {/* Confirm button (✓) */}
                <button
                  onClick={handleConfirm}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors"
                  title="Confirm and transcribe"
                >
                  <Check className="w-5 h-5 text-primary-foreground" />
                </button>
              </div>

              {/* Helper text */}
              <p className="text-xs text-center text-muted-foreground mt-2">
                Speak naturally, then tap ✓ to transcribe or × to cancel
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  // Chrome/Safari/Edge UI - No UI needed, handled by parent
  return null
}
