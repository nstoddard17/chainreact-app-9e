import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function POST(req: Request) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { integrationId } = await req.json()

  if (!integrationId) {
    return NextResponse.json({ error: "Integration ID is required" }, { status: 400 })
  }

  try {
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    const contactGroups = await getGmailContactGroups(integration.access_token)
    return NextResponse.json(contactGroups)
  } catch (error) {
    console.error("Failed to load contact groups:", error)
    return NextResponse.json({ error: "Failed to load contact groups" }, { status: 500 })
  }
}

async function getGmailContactGroups(accessToken: string) {
  try {
    // Get contact groups from Google People API
    const groupsResponse = await fetch(
      `https://people.googleapis.com/v1/contactGroups?pageSize=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!groupsResponse.ok) {
      if (groupsResponse.status === 401) {
        throw new Error("Gmail authentication expired. Please reconnect your account.")
      }
      throw new Error(`Google People API error: ${groupsResponse.status}`)
    }

    const groupsData = await groupsResponse.json()
    const contactGroups = groupsData.contactGroups || []

    // Filter out system groups and get member details for user-created groups
    const userGroups = contactGroups.filter((group: any) => 
      group.groupType === 'USER_CONTACT_GROUP' && group.memberCount > 0
    )

    // Get members for each group
    const groupsWithMembers = await Promise.all(
      userGroups.map(async (group: any) => {
        try {
          const membersResponse = await fetch(
            `https://people.googleapis.com/v1/contactGroups/${group.resourceName}/members?pageSize=100`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          )

          if (!membersResponse.ok) {
            console.warn(`Failed to fetch members for group ${group.name}`)
            return null
          }

          const membersData = await membersResponse.json()
          const memberResourceNames = membersData.memberResourceNames || []

          if (memberResourceNames.length === 0) {
            return null
          }

          // Get contact details for members
          const contactsResponse = await fetch(
            `https://people.googleapis.com/v1/people:batchGet?` +
            `resourceNames=${memberResourceNames.join('&resourceNames=')}&` +
            `personFields=names,emailAddresses`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          )

          if (!contactsResponse.ok) {
            console.warn(`Failed to fetch contact details for group ${group.name}`)
            return null
          }

          const contactsData = await contactsResponse.json()
          const people = contactsData.responses || []

          const emails = people
            .map((response: any) => response.person)
            .filter((person: any) => person && person.emailAddresses)
            .flatMap((person: any) => {
              const primaryName = person.names?.find((name: any) => name.metadata?.primary)
              const emailAddresses = person.emailAddresses || []
              
              return emailAddresses
                .filter((email: any) => email.value && isValidEmail(email.value))
                .map((email: any) => ({
                  email: email.value,
                  name: primaryName?.displayName || email.value,
                  isPrimary: email.metadata?.primary || false
                }))
            })

          // Remove duplicates and keep primary emails
          const uniqueEmails = Array.from(
            new Map(emails.map((item: any) => [item.email.toLowerCase(), item])).values()
          )

          return {
            id: group.resourceName,
            name: group.name,
            memberCount: group.memberCount,
            emails: uniqueEmails,
            type: 'contact_group'
          }

        } catch (error) {
          console.warn(`Error processing group ${group.name}:`, error)
          return null
        }
      })
    )

    return groupsWithMembers.filter(group => group !== null)

  } catch (error) {
    console.error("Failed to get Gmail contact groups:", error)
    throw new Error("Failed to get Gmail contact groups")
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email.trim())
} 