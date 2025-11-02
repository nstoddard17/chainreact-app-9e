// Force dynamic rendering for the support section
export const dynamic = 'force-dynamic'

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
