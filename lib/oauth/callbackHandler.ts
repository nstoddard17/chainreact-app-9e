import type { NextApiRequest, NextApiResponse } from "next"
import { getAccessToken, getGithubUser } from "../../utils/github"
import { createUser, getUserByGithubId } from "../../utils/user"
import { setCookie } from "../../utils/cookie"

const callbackHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { code } = req.query

  if (!code) {
    return res.status(400).send("Missing code")
  }

  try {
    const accessToken = await getAccessToken(code as string)
    const githubUser = await getGithubUser(accessToken)

    if (!githubUser) {
      return res.status(500).send("Failed to fetch user from GitHub")
    }

    let user = await getUserByGithubId(githubUser.id)

    if (!user) {
      user = await createUser({
        githubId: githubUser.id,
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      })

      if (!user) {
        return res.status(500).send("Failed to create user")
      }
    }

    const tokenPayload = {
      userId: user.id,
      username: user.username,
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables.")
    }

    const jwt = await new Promise<string>((resolve, reject) => {
      import("jsonwebtoken")
        .then((jsonwebtoken) => {
          jsonwebtoken.sign(tokenPayload, jwtSecret, { expiresIn: "7d" }, (err, token) => {
            if (err) {
              reject(err)
            } else if (token) {
              resolve(token)
            } else {
              reject(new Error("Token is undefined"))
            }
          })
        })
        .catch((err) => {
          reject(err)
        })
    })

    setCookie(res, "auth_token", jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    res.redirect("/")
  } catch (error) {
    console.error("OAuth callback error:", error)
    res.status(500).send("OAuth failed")
  }
}

export default callbackHandler
