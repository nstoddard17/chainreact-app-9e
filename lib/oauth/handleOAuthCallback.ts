import { lucia } from "@/lib/auth"
import { OAuthRequestError } from "@lucia-auth/oauth"
import { cookies } from "next/headers"

export async function handleOAuthCallback(provider: any, context: any) {
  try {
    const { existingUser, providerUser, createUser } = await context.validate()

    const getUser = async () => {
      if (existingUser) return existingUser
      const user = await createUser({
        attributes: {
          // whatever user information you want to store
          email: providerUser.email,
          email_verified: providerUser.email_verified,
          name: providerUser.name,
          picture: providerUser.picture,
        },
      })
      return user
    }

    const user = await getUser()

    const session = await lucia.createSession(user.userId, {})
    const sessionCookie = lucia.createSessionCookie(session.id)
    cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
    return
  } catch (e) {
    console.error(e)
    if (e instanceof OAuthRequestError) {
      // invalid code
      return new Response(null, {
        status: 400,
      })
    }
    return new Response(null, {
      status: 500,
    })
  }
}
