import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Play, Pause, Check, AlertCircle, Clock } from "lucide-react"

type ActivityStatus = "completed" | "paused" | "failed" | "active"

const activities: {
  id: number
  type: string
  workflow: string
  status: ActivityStatus
  time: string
}[] = [
  {
    id: 1,
    type: "execution",
    workflow: "Email Marketing Automation",
    status: "completed",
    time: "10 minutes ago",
  },
  {
    id: 2,
    type: "status",
    workflow: "Data Processing Pipeline",
    status: "paused",
    time: "25 minutes ago",
  },
  {
    id: 3,
    type: "execution",
    workflow: "Customer Onboarding",
    status: "failed",
    time: "1 hour ago",
  },
  {
    id: 4,
    type: "status",
    workflow: "Social Media Scheduler",
    status: "active",
    time: "2 hours ago",
  },
  {
    id: 5,
    type: "execution",
    workflow: "Inventory Sync",
    status: "completed",
    time: "3 hours ago",
  },
]

const statusIcons: Record<ActivityStatus, React.ReactElement> = {
  completed: <Check className="w-4 h-4 text-green-500" />,
  paused: <Pause className="w-4 h-4 text-yellow-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
  active: <Play className="w-4 h-4 text-blue-500" />,
}

export default function ActivityFeed() {
  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-900">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <ul className="space-y-4">
          {activities.map((activity) => (
            <li key={activity.id} className="flex items-start space-x-4">
              <div className="mt-1 flex-shrink-0">{statusIcons[activity.status]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{activity.workflow}</p>
                <div className="flex items-center text-xs text-slate-500 mt-1">
                  <Clock className="w-3 h-3 mr-1.5" />
                  <span>{activity.time}</span>
                </div>
              </div>
              <div
                className={`w-24 text-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                  activity.status === "completed"
                    ? "bg-green-100 text-green-700"
                    : activity.status === "paused"
                      ? "bg-yellow-100 text-yellow-700"
                      : activity.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                }`}
              >
                {activity.status}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
