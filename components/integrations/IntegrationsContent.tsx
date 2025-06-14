"use client"

import { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

const IntegrationsContent = () => {
  const [integrations, setIntegrations] = useState([])
  const supabase = createClientComponentClient()

  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        const { data, error } = await supabase.from("integrations").select("*")

        if (error) {
          console.error("Error fetching integrations:", error)
        } else {
          setIntegrations(data || [])
        }
      } catch (error) {
        console.error("Unexpected error fetching integrations:", error)
      }
    }

    fetchIntegrations()
  }, [supabase])

  return (
    <div>
      <h1>Integrations</h1>
      {integrations.length > 0 ? (
        <ul>
          {integrations.map((integration) => (
            <li key={integration.id}>{integration.name}</li>
          ))}
        </ul>
      ) : (
        <p>No integrations found.</p>
      )}
    </div>
  )
}

export default IntegrationsContent
