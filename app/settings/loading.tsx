import { DashboardLoading } from "@/components/common/DashboardLoading"

export default function Loading() {
  return <DashboardLoading title="Loading settings" subtitle="Fetching your preferences and usage..." statCards={3} />
}
