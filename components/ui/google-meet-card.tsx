import React from "react"
import { Video, Settings, Copy, X } from "lucide-react"

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
        <div className="flex items-center space-x-2 ml-4">
          <button
            className="p-1 rounded hover:bg-[#232323] transition"
            title="Settings"
            type="button"
            onClick={onSettings}
            style={{ color: '#b0b0b0' }}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            className="p-1 rounded hover:bg-[#232323] transition"
            title="Copy link"
            type="button"
            onClick={onCopy}
            disabled={!meetUrl}
            style={{ color: '#b0b0b0' }}
          >
            <Copy className="w-5 h-5" />
          </button>
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