import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"

interface MetricCardProps {
  title: string
  value: number | string
  icon: ReactNode
  color: "blue" | "green" | "purple" | "yellow"
  change?: string
}

const colorClasses = {
  blue: "from-orange-500 to-orange-600",
  green: "from-green-500 to-green-600",
  purple: "from-rose-500 to-rose-600",
  yellow: "from-yellow-500 to-yellow-600",
}

export default function MetricCard({ title, value, icon, color, change }: MetricCardProps) {
  return (
    <Card className="bg-card rounded-2xl shadow-lg border border-border hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground break-words">{title}</p>
            <p className="text-2xl sm:text-3xl font-bold text-card-foreground mt-1">{value}</p>
            {change && <p className="text-sm text-green-600 dark:text-green-400 mt-1">{change}</p>}
          </div>
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br ${colorClasses[color]} rounded-xl flex items-center justify-center text-white shrink-0`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
