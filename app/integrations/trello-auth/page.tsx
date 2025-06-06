import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"

async function getTrelloToken(userId: string) {
  const trelloIntegration = await db.trelloIntegration.findUnique({
    where: {
      userId: userId,
    },
  })

  return trelloIntegration?.trelloToken
}

async function TrelloAuthPage() {
  const supabase = createServerComponentClient({ cookies })
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const trelloToken = await getTrelloToken(user.id)

  if (trelloToken) {
    redirect("/integrations/trello")
  }

  const trelloApiKey = process.env.TRELLO_API_KEY
  const trelloAuthUrl = `https://trello.com/1/authorize?expiration=never&name=Taskify&scope=read,write,account&response_type=token&key=${trelloApiKey}&return_url=${process.env.NEXT_PUBLIC_SITE_URL}/integrations/trello-auth/callback`

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">Connect to Trello</h1>
      <a href={trelloAuthUrl} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
        Authorize Trello
      </a>
    </div>
  )
}

export default TrelloAuthPage
