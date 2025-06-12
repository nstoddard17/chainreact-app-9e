import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface IntegrationStatusProps {
  status: string
  expiresAt?: string | null
  lastRefresh?: string | null
  className?: string
}

export default function IntegrationStatus({ status, expiresAt, lastRefresh, className = "" }: IntegrationStatusProps) {
  // Calculate time until expiration
  let timeUntilExpiry: string | null = null
  let isExpiringSoon = false
  let isExpired = false

  if (expiresAt) {
    try {
      const expiryDate = new Date(expiresAt)
      const now = new Date()

      // Fix: Use UTC timestamps for comparison to avoid timezone issues
      const expiryTimestamp = expiryDate.getTime()
      const nowTimestamp = now.getTime()

      const diffMs = expiryTimestamp - nowTimestamp
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

      isExpired = diffMs <= 0
      isExpiringSoon = !isExpired && diffHours < 24

      if (isExpired) {
        timeUntilExpiry = "Expired"
      } else if (diffHours > 24) {
        const diffDays = Math.floor(diffHours / 24)
        timeUntilExpiry = `${diffDays} day${diffDays !== 1 ? "s" : ""}`
      } else {
        timeUntilExpiry = `${diffHours}h ${diffMinutes}m`
      }
    } catch (e) {
      console.error("Error parsing expiry date:", e)
    }
  }

  // Format last refresh time
  let lastRefreshText = "Never"
  if (lastRefresh) {
    try {
      const refreshDate = new Date(lastRefresh)
      const now = new Date()
      const diffMs = now.getTime() - refreshDate.getTime()
      const diffMinutes = Math.floor(diffMs / (1000 * 60))

      if (diffMinutes < 60) {
        lastRefreshText = `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`
      } else {
        const diffHours = Math.floor(diffMinutes / 60)
        if (diffHours < 24) {
          lastRefreshText = `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
        } else {
          const diffDays = Math.floor(diffHours / 24)
          lastRefreshText = `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`
        }
      }
    } catch (e) {
      console.error("Error parsing refresh date:", e)
    }
  }

  if (status === "connected") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`${
                isExpired
                  ? "bg-red-50 text-red-700 border-red-200"
                  : isExpiringSoon
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-green-50 text-green-700 border-green-200"
              } ${className}`}
            >
              {isExpired ? (
                <XCircle className="w-3.5 h-3.5 mr-1" />
              ) : isExpiringSoon ? (
                <Clock className="w-3.5 h-3.5 mr-1" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
              )}
              {isExpired ? "Expired" : isExpiringSoon ? "Expiring Soon" : "Connected"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-900 text-white border-slate-800 px-3 py-2">
            <div className="text-xs">
              <p className="font-medium mb-1">Integration Status</p>
              <p className="text-slate-300">
                {isExpired
                  ? "Token has expired. Please reconnect."
                  : isExpiringSoon
                    ? `Expires in ${timeUntilExpiry}`
                    : `Valid for ${timeUntilExpiry}`}
              </p>
              <p className="text-slate-300 mt-1">Last refreshed: {lastRefreshText}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (status === "disconnected") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`bg-red-50 text-red-700 border-red-200 ${className}`}>
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Disconnected
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-900 text-white border-slate-800 px-3 py-2">
            <div className="text-xs">
              <p className="font-medium mb-1">Integration Status</p>
              <p className="text-slate-300">This integration is disconnected.</p>
              <p className="text-slate-300 mt-1">Click to reconnect.</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`bg-amber-50 text-amber-700 border-amber-200 ${className}`}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            {status || "Unknown"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 text-white border-slate-800 px-3 py-2">
          <div className="text-xs">
            <p className="font-medium mb-1">Integration Status</p>
            <p className="text-slate-300">Status: {status || "Unknown"}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
