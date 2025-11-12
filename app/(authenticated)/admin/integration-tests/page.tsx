import { permanentRedirect } from 'next/navigation'

export default function AdminIntegrationTestsRedirect() {
  permanentRedirect('/test/apps')
}
