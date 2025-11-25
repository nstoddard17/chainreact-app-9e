import { DashboardLoading } from "@/components/common/DashboardLoading"

export default function Loading() {
  return <DashboardLoading title="Loading apps" subtitle="Fetching your connected integrations..." showFilters statCards={4} />
}
