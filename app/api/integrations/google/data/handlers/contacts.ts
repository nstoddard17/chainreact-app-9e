/**
 * Google Contacts Handler
 */

import { GoogleIntegration, GoogleContact, GoogleDataHandler } from '../types'
import { validateGoogleIntegration, makeGoogleApiRequest, getGoogleAccessToken } from '../utils'

/**
 * Fetch Google contacts using People API
 */
export const getGoogleContacts: GoogleDataHandler<GoogleContact> = async (integration: GoogleIntegration) => {
  try {
    validateGoogleIntegration(integration)

    // Get decrypted access token
    const accessToken = getGoogleAccessToken(integration)

    // Fetch contacts using People API
    const response = await makeGoogleApiRequest(
      "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=50&sortOrder=LAST_MODIFIED_DESCENDING",
      accessToken
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google People API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const connections = data.connections || []

    const contacts = connections
      .filter((person: any) => person.emailAddresses?.length > 0)
      .map((person: any): GoogleContact => {
        const primaryEmail = person.emailAddresses[0]
        const name = person.names?.[0]?.displayName || person.names?.[0]?.givenName
        
        return {
          id: person.resourceName || primaryEmail.value,
          name: name,
          email: primaryEmail.value,
          value: primaryEmail.value,
          label: name ? `${name} <${primaryEmail.value}>` : primaryEmail.value
        }
      })

    return contacts

  } catch (error: any) {
    console.error("❌ [Google Contacts] Error fetching contacts:", error)
    throw new Error(`Failed to fetch Google contacts: ${error.message}`)
  }
}