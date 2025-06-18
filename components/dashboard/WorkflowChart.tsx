import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface ChartData {
  name: string;
  executions: number;
  completions?: number;
  workflows?: number;
}

interface WorkflowChartProps {
  data: ChartData[]
}

export default function WorkflowChart({ data = [] }: WorkflowChartProps) {
  // If no data is provided, use sample data
  const chartData = data.length
    ? data
    : [
        { name: "Mon", executions: 4, completions: 3 },
        { name: "Tue", executions: 7, completions: 5 },
        { name: "Wed", executions: 5, completions: 4 },
        { name: "Thu", executions: 10, completions: 8 },
        { name: "Fri", executions: 8, completions: 7 },
        { name: "Sat", executions: 3, completions: 3 },
        { name: "Sun", executions: 5, completions: 4 },
      ]

  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-900">Workflow Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 5,
                right: 10,
                left: 0,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                }}
              />
              <Line type="monotone" dataKey="executions" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="completions" stroke="#8b5cf6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center mt-4 space-x-6">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
            <span className="text-sm text-slate-600">Executions</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
            <span className="text-sm text-slate-600">Completions</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
