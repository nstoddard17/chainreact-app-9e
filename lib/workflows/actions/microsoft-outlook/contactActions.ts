import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { refreshMicrosoftToken } from '../core/refreshMicrosoftToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new contact in Outlook
 */
export async function createOutlookContact(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const {
      givenName,
      surname,
      emailAddress,
      businessPhone,
      mobilePhone,
      jobTitle,
      companyName,
      department
    } = resolvedConfig

    if (!givenName) {
      throw new Error('First name is required')
    }
    if (!emailAddress) {
      throw new Error('Email address is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Build contact data
    const contactData: any = {
      givenName
    }

    if (surname) contactData.surname = surname
    if (jobTitle) contactData.jobTitle = jobTitle
    if (companyName) contactData.companyName = companyName
    if (department) contactData.department = department

    // Email addresses - Graph API expects an array
    contactData.emailAddresses = [{
      address: emailAddress,
      name: `${givenName}${surname ? ' ' + surname : ''}`
    }]

    // Phone numbers
    if (businessPhone) {
      contactData.businessPhones = [businessPhone]
    }
    if (mobilePhone) {
      contactData.mobilePhone = mobilePhone
    }

    const makeRequest = async (token: string) => {
      return fetch('https://graph.microsoft.com/v1.0/me/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contactData)
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to create contact: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to create contact: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const createdContact = await response.json()

    return {
      success: true,
      output: {
        id: createdContact.id,
        displayName: createdContact.displayName,
        emailAddress: createdContact.emailAddresses?.[0]?.address,
        givenName: createdContact.givenName,
        surname: createdContact.surname,
        jobTitle: createdContact.jobTitle,
        companyName: createdContact.companyName,
        createdDateTime: createdContact.createdDateTime
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Contacts] Error creating contact:', error)
    throw error
  }
}

/**
 * Update an existing contact in Outlook
 */
export async function updateOutlookContact(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const {
      contactId,
      givenName,
      surname,
      emailAddress,
      businessPhone,
      mobilePhone,
      jobTitle,
      companyName
    } = resolvedConfig

    if (!contactId) {
      throw new Error('Contact ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Build update payload - only include fields that are provided
    const updateData: any = {}

    if (givenName !== undefined && givenName !== '') updateData.givenName = givenName
    if (surname !== undefined && surname !== '') updateData.surname = surname
    if (jobTitle !== undefined && jobTitle !== '') updateData.jobTitle = jobTitle
    if (companyName !== undefined && companyName !== '') updateData.companyName = companyName

    if (emailAddress !== undefined && emailAddress !== '') {
      updateData.emailAddresses = [{
        address: emailAddress,
        name: `${givenName || ''}${surname ? ' ' + surname : ''}`.trim() || emailAddress
      }]
    }

    if (businessPhone !== undefined && businessPhone !== '') {
      updateData.businessPhones = [businessPhone]
    }

    if (mobilePhone !== undefined && mobilePhone !== '') {
      updateData.mobilePhone = mobilePhone
    }

    const endpoint = `https://graph.microsoft.com/v1.0/me/contacts/${contactId}`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to update contact: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to update contact: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const updatedContact = await response.json()

    return {
      success: true,
      output: {
        id: updatedContact.id,
        updated: true,
        displayName: updatedContact.displayName,
        emailAddress: updatedContact.emailAddresses?.[0]?.address
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Contacts] Error updating contact:', error)
    throw error
  }
}

/**
 * Delete a contact from Outlook
 */
export async function deleteOutlookContact(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { contactId } = resolvedConfig

    if (!contactId) {
      throw new Error('Contact ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    const endpoint = `https://graph.microsoft.com/v1.0/me/contacts/${contactId}`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text()
      let errorMessage = `Failed to delete contact: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to delete contact: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    return {
      success: true,
      output: {
        deleted: true,
        contactId
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Contacts] Error deleting contact:', error)
    throw error
  }
}

/**
 * Find/search contacts in Outlook
 */
export async function findOutlookContact(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { searchQuery, maxResults = 25 } = resolvedConfig

    if (!searchQuery) {
      throw new Error('Search query is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Build search URL using $filter or $search
    const params = new URLSearchParams()
    params.append('$top', Math.min(Math.max(1, maxResults), 100).toString())
    params.append('$select', 'id,displayName,givenName,surname,emailAddresses,businessPhones,mobilePhone,jobTitle,companyName')

    // Use $search for full-text search
    params.append('$search', `"${searchQuery}"`)

    const endpoint = `https://graph.microsoft.com/v1.0/me/contacts?${params.toString()}`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'ConsistencyLevel': 'eventual'
        }
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    // If search fails (some tenants don't support $search), try $filter
    if (!response.ok && response.status === 400) {
      const filterParams = new URLSearchParams()
      filterParams.append('$top', Math.min(Math.max(1, maxResults), 100).toString())
      filterParams.append('$select', 'id,displayName,givenName,surname,emailAddresses,businessPhones,mobilePhone,jobTitle,companyName')
      filterParams.append('$filter', `contains(displayName,'${searchQuery}') or contains(givenName,'${searchQuery}') or contains(surname,'${searchQuery}')`)

      const filterEndpoint = `https://graph.microsoft.com/v1.0/me/contacts?${filterParams.toString()}`

      response = await fetch(filterEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to search contacts: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to search contacts: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const contacts = data.value || []

    return {
      success: true,
      output: {
        contacts: contacts.map((contact: any) => ({
          id: contact.id,
          displayName: contact.displayName,
          givenName: contact.givenName,
          surname: contact.surname,
          emailAddresses: contact.emailAddresses?.map((e: any) => e.address),
          businessPhones: contact.businessPhones,
          mobilePhone: contact.mobilePhone,
          jobTitle: contact.jobTitle,
          companyName: contact.companyName
        })),
        count: contacts.length
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Contacts] Error searching contacts:', error)
    throw error
  }
}
