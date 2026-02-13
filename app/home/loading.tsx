import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF8F6] dark:bg-[#0A1628]">
      <div className="text-center space-y-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <p className="text-lg font-medium">Loading...</p>
      </div>
    </div>
  )
}
