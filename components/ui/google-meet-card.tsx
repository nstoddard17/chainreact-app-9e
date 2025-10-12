import React, { useState } from "react"
import { Video, Settings, Copy, X, ChevronDown, Users, Lock, Globe } from "lucide-react"

import { logger } from '@/lib/utils/logger'

interface GoogleMeetCardProps {
  meetUrl?: string
  guestLimit?: number
  onRemove: () => void
  onCopy?: () => void
  onSettings?: () => void
}

export const GoogleMeetCard: React.FC<GoogleMeetCardProps> = ({
  meetUrl,
  guestLimit = 100,
  onRemove,
  onCopy,
  onSettings,
}) => {
  const [showCopyNotification, setShowCopyNotification] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const handleCopy = async () => {
    if (meetUrl) {
      try {
        await navigator.clipboard.writeText(meetUrl)
        setShowCopyNotification(true)
        setTimeout(() => setShowCopyNotification(false), 2000)
        onCopy?.()
      } catch (err) {
        logger.error('Failed to copy link:', err)
      }
    }
  }

  const handleSettings = () => {
    setShowSettings(!showSettings)
    onSettings?.()
  }

  return (
    <div
      className="relative rounded-2xl p-4 flex flex-col items-start shadow border border-zinc-800 bg-[#181818]"
      style={{ fontFamily: 'Roboto, Arial, sans-serif', minWidth: 420 }}
    >
      <div className="flex w-full items-center justify-between mb-1">
        <button
          className="rounded-full px-8 py-2 text-base font-medium flex items-center bg-[#c7d6f7] text-[#174ea6] hover:bg-[#b3c6f7] transition border-none shadow-none focus:outline-none"
          style={{ minWidth: 260 }}
          disabled={!meetUrl}
          onClick={() => meetUrl && window.open(meetUrl, "_blank")}
        >
          <Video className="w-5 h-5 mr-2 -ml-1" />
          Join with Google Meet
        </button>
        <div className="flex items-center space-x-2 ml-4 relative">
          {/* Settings Button and Dropdown */}
          <div className="relative">
            <button
              className="p-1 rounded hover:bg-[#232323] transition flex items-center gap-1"
              title="Meeting settings"
              type="button"
              onClick={handleSettings}
              style={{ color: '#b0b0b0' }}
            >
              <Settings className="w-4 h-4" />
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {/* Settings Dropdown */}
            {showSettings && (
              <div className="absolute right-0 top-full mt-1 bg-[#232323] border border-zinc-700 rounded-lg shadow-lg z-10 min-w-48">
                <div className="p-2">
                  <div className="text-[#e0e0e0] text-sm font-medium mb-2 px-2">Meeting settings</div>
                  <div className="space-y-1">
                    <button className="w-full text-left px-2 py-1.5 text-sm text-[#b0b0b0] hover:bg-[#2a2a2a] rounded flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>Quick access</span>
                      <span className="ml-auto text-xs text-[#666]">On</span>
                    </button>
                    <button className="w-full text-left px-2 py-1.5 text-sm text-[#b0b0b0] hover:bg-[#2a2a2a] rounded flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      <span>Host controls</span>
                      <span className="ml-auto text-xs text-[#666]">On</span>
                    </button>
                    <button className="w-full text-left px-2 py-1.5 text-sm text-[#b0b0b0] hover:bg-[#2a2a2a] rounded flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      <span>Meeting visibility</span>
                      <span className="ml-auto text-xs text-[#666]">Public</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Copy Button */}
          <button
            className="p-1 rounded hover:bg-[#232323] transition relative"
            title="Copy link"
            type="button"
            onClick={handleCopy}
            disabled={!meetUrl}
            style={{ color: '#b0b0b0' }}
          >
            <Copy className="w-5 h-5" />
            
            {/* Copy Notification Popup */}
            {showCopyNotification && (
              <div className="absolute bottom-full right-0 mb-2 bg-[#232323] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-[#e0e0e0] whitespace-nowrap shadow-lg z-20">
                Meeting link copied!
                <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#232323]"></div>
              </div>
            )}
          </button>

          {/* Remove Button */}
          <button
            className="p-1 rounded hover:bg-[#232323] transition"
            title="Remove Google Meet"
            type="button"
            onClick={onRemove}
            style={{ color: '#b0b0b0' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="text-[#e0e0e0] text-[15px] mt-2 flex items-center" style={{ fontWeight: 400 }}>
        {meetUrl ? (
          <span className="font-mono text-[#b3c6f7] text-[15px]" style={{ fontWeight: 400 }}>{meetUrl}</span>
        ) : (
          <span className="italic text-zinc-400">Google Meet link will be generated momentarily</span>
        )}
        <span className="mx-2 text-[#b0b0b0]">·</span>
        <span className="text-[#b0b0b0]">Up to {guestLimit} guest connections</span>
      </div>
    </div>
  )
}

export default GoogleMeetCard; 