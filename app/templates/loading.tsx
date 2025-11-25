import { DashboardLoading } from "@/components/common/DashboardLoading"

export default function Loading() {
  return <DashboardLoading title="Loading templates" subtitle="Fetching ready-made workflows..." showFilters statCards={3} />
}
