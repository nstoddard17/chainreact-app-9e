// Force dynamic rendering for the webhooks section
export const dynamic = 'force-dynamic'

export default function WebhooksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
