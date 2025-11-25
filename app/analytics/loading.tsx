import { DashboardLoading } from "@/components/common/DashboardLoading"

export default function Loading() {
  return <DashboardLoading title="Loading analytics" subtitle="Pulling recent run data..." statCards={4} />
}
