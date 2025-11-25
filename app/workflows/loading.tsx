import { DashboardLoading } from "@/components/common/DashboardLoading"

export default function Loading() {
  return <DashboardLoading title="Loading workflows" subtitle="Fetching your automations..." showFilters statCards={3} />
}
