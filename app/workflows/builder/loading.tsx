import { PageLoader } from "@/components/ui/page-loader"

export default function Loading() {
  return (
    <PageLoader
      message="Loading workflow builder..."
      timeout={10000}
    />
  )
}
